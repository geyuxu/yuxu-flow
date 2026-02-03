---
date: 2026-01-26
tags: [python, backend, geospatial]
description: A deep dive into coordinate transformation (WGS84/GCJ02), connection pooling, rate limiting with token bucket, and retry strategies for geocoding APIs.
---

# Building a Production-Ready Geocoding Client: Coordinate Hacks, Connection Pools, and Rate Limiting

Geocoding looks simple: send an address, get coordinates back. But at scale, three hidden problems emerge that tutorials never mention:

1. **In China, coordinates lie—by design**
2. **HTTP connections don't clean up after themselves**
3. **API quotas disappear faster than you'd expect**

I've seen each of these take down production systems. This article shows how to build a geocoding client that handles all three.

---

## Architecture Overview

Before diving into details, here's how the pieces fit together:

![architecture-diagram](/blog/images/geocoding-client/architecture-diagram.png)

Three modules, three problems solved. Let's examine each one.

---

## Problem #1: The 300-Meter Coordinate Drift

In China, consumer-facing maps don't use raw GPS coordinates (WGS-84). Instead, they use GCJ-02—nicknamed "Mars Coordinates"—which applies a non-linear offset to every point. This isn't a simple translation; it's a deliberate obfuscation involving trigonometric functions that shift coordinates by 50–500 meters depending on location.

If your backend receives WGS-84 coordinates from GPS devices but passes them directly to a Chinese mapping API, your pins will land in the wrong place. Delivery zones break. Geofences fail. Users complain that "the map is wrong."

### The Solution: Iterative Inversion

The GCJ-02 transformation has no closed-form inverse. We solve it numerically:

1. Guess that WGS-84 ≈ GCJ-02 (good enough to start)
2. Apply the forward transformation to get a predicted GCJ-02
3. Measure the error and adjust
4. Repeat until error < 10⁻⁶ degrees (~0.1 meter)

```python
import math

_A = 6378245.0  # Semi-major axis
_EE = 0.00669342162296594323  # First eccentricity squared


def _out_of_china(lng: float, lat: float) -> bool:
    """Check if point is outside China (skip transformation)."""
    return not (72.004 <= lng <= 137.8347 and 0.8293 <= lat <= 55.8271)


def _transform_lat(x: float, y: float) -> float:
    ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y
    ret += 0.2 * math.sqrt(abs(x))
    ret += (20.0 * math.sin(6.0 * x * math.pi) + 
            20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    ret += (20.0 * math.sin(y * math.pi) + 
            40.0 * math.sin(y / 3.0 * math.pi)) * 2.0 / 3.0
    ret += (160.0 * math.sin(y / 12.0 * math.pi) + 
            320.0 * math.sin(y * math.pi / 30.0)) * 2.0 / 3.0
    return ret


def _transform_lng(x: float, y: float) -> float:
    ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y
    ret += 0.1 * math.sqrt(abs(x))
    ret += (20.0 * math.sin(6.0 * x * math.pi) + 
            20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    ret += (20.0 * math.sin(x * math.pi) + 
            40.0 * math.sin(x / 3.0 * math.pi)) * 2.0 / 3.0
    ret += (150.0 * math.sin(x / 12.0 * math.pi) + 
            300.0 * math.sin(x / 30.0 * math.pi)) * 2.0 / 3.0
    return ret


def wgs84_to_gcj02(lng: float, lat: float) -> tuple[float, float]:
    """Convert WGS-84 to GCJ-02 (forward transformation)."""
    if _out_of_china(lng, lat):
        return lng, lat
    
    dlat = _transform_lat(lng - 105.0, lat - 35.0)
    dlng = _transform_lng(lng - 105.0, lat - 35.0)
    
    rad_lat = lat / 180.0 * math.pi
    magic = math.sin(rad_lat)
    magic = 1 - _EE * magic * magic
    sqrt_magic = math.sqrt(magic)
    
    dlat = (dlat * 180.0) / ((_A * (1 - _EE)) / (magic * sqrt_magic) * math.pi)
    dlng = (dlng * 180.0) / (_A / sqrt_magic * math.cos(rad_lat) * math.pi)
    
    return lng + dlng, lat + dlat


def gcj02_to_wgs84(lng: float, lat: float, 
                   tol: float = 1e-6, 
                   max_iter: int = 10) -> tuple[float, float]:
    """Convert GCJ-02 back to WGS-84 via iterative refinement."""
    wgs_lng, wgs_lat = lng, lat
    
    for _ in range(max_iter):
        pred_lng, pred_lat = wgs84_to_gcj02(wgs_lng, wgs_lat)
        dlng = pred_lng - lng
        dlat = pred_lat - lat
        
        if abs(dlng) < tol and abs(dlat) < tol:
            break
            
        wgs_lng -= dlng
        wgs_lat -= dlat
    
    return wgs_lng, wgs_lat
```

The iteration converges in 2–3 steps for typical coordinates.

---

## Problem #2: The TIME_WAIT Storm

Every naive geocoding request creates a new TCP connection:

```
connect() → send HTTP request → receive response → close()
```

At 500 QPS, this creates 500 connections per second. Each closed connection enters TIME_WAIT state for 60 seconds (Linux default). Do the math: 500 × 60 = 30,000 sockets stuck in TIME_WAIT, competing for the ~28,000 ephemeral ports available on a typical system.

Result: `OSError: [Errno 99] Cannot assign requested address`

### The Solution: Connection Pooling + Exponential Backoff

Replace stateless requests with a persistent session that reuses TCP connections:

```python
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


def create_resilient_session(pool_size: int = 50) -> requests.Session:
    """
    Create an HTTP session with connection pooling and retry logic.
    
    Args:
        pool_size: Max connections to keep alive (tune based on expected QPS)
    """
    session = requests.Session()
    
    retry_strategy = Retry(
        total=5,
        backoff_factor=1,  # delays: 0s, 2s, 4s, 8s, 16s
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    
    adapter = HTTPAdapter(
        max_retries=retry_strategy,
        pool_connections=pool_size,
        pool_maxsize=pool_size,
    )
    
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    
    return session
```

**Connection pool sizing**: Use `pool_size = expected_QPS × average_latency`. At 500 QPS with 100ms latency, that's 50 connections.

---

## Problem #3: Quota Burnout

Commercial geocoding APIs have strict rate limits. Without client-side throttling, a traffic spike can exhaust your daily quota in minutes—then return HTTP 429 for the rest of the day.

### The Solution: Token Bucket Rate Limiting

The token bucket algorithm enforces average rate while tolerating short bursts:

```python
import threading
import time
from dataclasses import dataclass, field


@dataclass
class TokenBucket:
    """
    Local token bucket rate limiter.
    For distributed systems, use Redis with Lua scripts.
    """
    rate: float      # Tokens per second
    capacity: float  # Max burst size
    _tokens: float = field(init=False)
    _timestamp: float = field(init=False)
    _lock: threading.Lock = field(init=False)
    
    def __post_init__(self):
        self._tokens = self.capacity
        self._timestamp = time.time()
        self._lock = threading.Lock()
    
    def acquire(self, tokens: int = 1) -> bool:
        with self._lock:
            now = time.time()
            self._tokens = min(
                self.capacity,
                self._tokens + (now - self._timestamp) * self.rate
            )
            self._timestamp = now
            
            if self._tokens >= tokens:
                self._tokens -= tokens
                return True
            return False
```

Set `capacity = rate × 2` to allow 2 seconds of burst without risking quota exhaustion.

---

## Complete Implementation

Here's everything combined into a production-ready class:

```python
import math
import threading
import time
from dataclasses import dataclass, field
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


# === Coordinate Transformation ===

_A = 6378245.0
_EE = 0.00669342162296594323

def _out_of_china(lng: float, lat: float) -> bool:
    return not (72.004 <= lng <= 137.8347 and 0.8293 <= lat <= 55.8271)

def _transform_lat(x: float, y: float) -> float:
    ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y
    ret += 0.2 * math.sqrt(abs(x))
    ret += (20.0 * math.sin(6.0 * x * math.pi) + 
            20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    ret += (20.0 * math.sin(y * math.pi) + 
            40.0 * math.sin(y / 3.0 * math.pi)) * 2.0 / 3.0
    ret += (160.0 * math.sin(y / 12.0 * math.pi) + 
            320.0 * math.sin(y * math.pi / 30.0)) * 2.0 / 3.0
    return ret

def _transform_lng(x: float, y: float) -> float:
    ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y
    ret += 0.1 * math.sqrt(abs(x))
    ret += (20.0 * math.sin(6.0 * x * math.pi) + 
            20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    ret += (20.0 * math.sin(x * math.pi) + 
            40.0 * math.sin(x / 3.0 * math.pi)) * 2.0 / 3.0
    ret += (150.0 * math.sin(x / 12.0 * math.pi) + 
            300.0 * math.sin(x / 30.0 * math.pi)) * 2.0 / 3.0
    return ret


# === Rate Limiter ===

@dataclass
class TokenBucket:
    rate: float
    capacity: float
    _tokens: float = field(init=False)
    _timestamp: float = field(init=False)
    _lock: threading.Lock = field(init=False)
    
    def __post_init__(self):
        self._tokens = self.capacity
        self._timestamp = time.time()
        self._lock = threading.Lock()
    
    def acquire(self, tokens: int = 1) -> bool:
        with self._lock:
            now = time.time()
            self._tokens = min(
                self.capacity,
                self._tokens + (now - self._timestamp) * self.rate
            )
            self._timestamp = now
            if self._tokens >= tokens:
                self._tokens -= tokens
                return True
            return False


# === Main Engine ===

class SpatialDataEngine:
    
    def __init__(
        self,
        api_key: str,
        pool_size: int = 50,
        qps: float = 100,
        burst: float = 200,
        base_url: str = "https://restapi.amap.com/v3/geocode/geo",
    ):
        self.api_key = api_key
        self.base_url = base_url
        self._session = self._create_session(pool_size)
        self._limiter = TokenBucket(rate=qps, capacity=burst)
    
    def _create_session(self, pool_size: int) -> requests.Session:
        session = requests.Session()
        retry = Retry(
            total=5,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET"],
        )
        adapter = HTTPAdapter(
            max_retries=retry,
            pool_connections=pool_size,
            pool_maxsize=pool_size,
        )
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        return session
    
    def geocode(self, address: str, 
                timeout: tuple[float, float] = (3.0, 10.0)) -> dict[str, Any]:
        if not self._limiter.acquire():
            return {"error": "rate_limited", "retry_after": 1.0}
        
        try:
            resp = self._session.get(
                self.base_url,
                params={"address": address, "key": self.api_key},
                timeout=timeout,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.Timeout:
            return {"error": "timeout"}
        except requests.exceptions.ConnectionError as e:
            return {"error": "connection_failed", "detail": str(e)}
        except requests.exceptions.HTTPError as e:
            return {"error": "http_error", "status": e.response.status_code}
    
    @staticmethod
    def wgs84_to_gcj02(lng: float, lat: float) -> tuple[float, float]:
        if _out_of_china(lng, lat):
            return lng, lat
        dlat = _transform_lat(lng - 105.0, lat - 35.0)
        dlng = _transform_lng(lng - 105.0, lat - 35.0)
        rad_lat = lat / 180.0 * math.pi
        magic = 1 - _EE * math.sin(rad_lat) ** 2
        sqrt_magic = math.sqrt(magic)
        dlat = (dlat * 180.0) / ((_A * (1 - _EE)) / (magic * sqrt_magic) * math.pi)
        dlng = (dlng * 180.0) / (_A / sqrt_magic * math.cos(rad_lat) * math.pi)
        return lng + dlng, lat + dlat
    
    @staticmethod
    def gcj02_to_wgs84(lng: float, lat: float, 
                       tol: float = 1e-6, max_iter: int = 10) -> tuple[float, float]:
        wgs_lng, wgs_lat = lng, lat
        for _ in range(max_iter):
            pred_lng, pred_lat = SpatialDataEngine.wgs84_to_gcj02(wgs_lng, wgs_lat)
            dlng, dlat = pred_lng - lng, pred_lat - lat
            if abs(dlng) < tol and abs(dlat) < tol:
                break
            wgs_lng -= dlng
            wgs_lat -= dlat
        return wgs_lng, wgs_lat
```

---

## Key Takeaways

| Layer | Problem | Solution |
|-------|---------|----------|
| **Data** | Coordinate system mismatch | CRS transformation + iterative inversion |
| **Network** | Connection overhead, transient failures | Persistent pool + exponential backoff |
| **System** | Quota exhaustion | Token bucket rate limiting |

Each layer is invisible until it fails. The code above handles all three.

---

## Next Steps

- **Multi-provider failover**: Route to backup API on errors
- **Response caching**: Addresses rarely move; cache aggressively  
- **Async processing**: Use `asyncio` + `aiohttp` for bulk geocoding
- **Observability**: Export latency, error rates, token utilization to your monitoring stack

*#geocoding #python #distributed-systems #rate-limiting #geospatial #backend-engineering*