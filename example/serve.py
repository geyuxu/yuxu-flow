#!/usr/bin/env python3
"""Simple HTTP server with correct MIME types for WASM"""
import http.server
import socketserver

class WASMHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
    
    def end_headers(self):
        # Add CORS headers for local development
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

# Add WASM MIME type
WASMHandler.extensions_map['.wasm'] = 'application/wasm'

PORT = 8080
with socketserver.TCPServer(("", PORT), WASMHandler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    httpd.serve_forever()
