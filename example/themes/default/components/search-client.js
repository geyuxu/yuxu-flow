/**
 * Hybrid Search Client
 *
 * Browser-side search combining:
 * - Keyword search using inverted index with BM25 scoring
 * - Semantic search using Voy WASM engine
 *
 * Results are merged using Reciprocal Rank Fusion (RRF).
 *
 * Usage:
 *   <script type="module">
 *     import { SearchClient } from '/components/search-client.js';
 *     const search = new SearchClient();
 *     await search.init();
 *     const results = await search.search('how to rate limit');
 *   </script>
 */

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
    embeddingUrl: '/api/embedding',  // Default, can be overridden
    indexUrl: '/public/search.dat',
    metadataUrl: '/public/search-metadata.json',
    invertedIndexUrl: '/public/search-inverted.json',
    topK: 5,
    // BM25 parameters
    bm25: {
        k1: 1.2,  // Term frequency saturation
        b: 0.75,  // Length normalization
    },
    // RRF parameter (higher = more weight to top ranks)
    rrfK: 60,
    // Weight for combining scores (keyword vs semantic)
    keywordWeight: 0.4,
    semanticWeight: 0.6,
};

// ============================================================
// STOPWORDS (same as build script)
// ============================================================
const STOPWORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who',
    'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'same',
    'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there',
    '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一',
    '个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有',
    '看', '好', '自己', '这', '那', '她', '他', '它', '们', '么', '与', '及',
]);

// ============================================================
// TOKENIZER (must match build script)
// ============================================================
function tokenize(text) {
    if (!text) return [];
    let normalized = text.toLowerCase().trim();
    const tokens = normalized.match(/[\u4e00-\u9fff]+|[a-z0-9]+/g) || [];

    const result = [];
    for (const token of tokens) {
        if (/[\u4e00-\u9fff]/.test(token)) {
            for (let i = 0; i < token.length; i++) {
                result.push(token[i]);
                if (i < token.length - 1) {
                    result.push(token.slice(i, i + 2));
                }
            }
        } else if (token.length >= 2) {
            result.push(token);
        }
    }

    return result.filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

// ============================================================
// GET EMBEDDING FROM API
// ============================================================
async function getVector(text, embeddingUrl) {
    const response = await fetch(embeddingUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Embedding API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.embedding;
}

// ============================================================
// HYBRID SEARCH CLIENT
// ============================================================
export class SearchClient {
    constructor(options = {}) {
        this.indexUrl = options.indexUrl || CONFIG.indexUrl;
        this.metadataUrl = options.metadataUrl || CONFIG.metadataUrl;
        this.invertedIndexUrl = options.invertedIndexUrl || CONFIG.invertedIndexUrl;
        this.topK = options.topK || CONFIG.topK;

        // Semantic search config - only enabled if explicitly set to true
        this.enableSemantic = options.enableSemantic === true;
        this.embeddingUrl = options.embeddingUrl || CONFIG.embeddingUrl;

        // Data stores
        this.voy = null;
        this.metadata = null;
        this.invertedIndex = null;

        this.ready = false;
        this.keywordReady = false;
        this.semanticReady = false;
    }

    /**
     * Initialize the search client
     * Loads all indexes in parallel, gracefully handling missing components
     */
    async init() {
        try {
            console.log('[Search] Initializing hybrid search...');

            // Build promises array - only include semantic if enabled
            const promises = [
                fetch(this.metadataUrl).catch(() => null),
                fetch(this.invertedIndexUrl).catch(() => null),
            ];

            // Only try to load semantic search if enabled in config
            if (this.enableSemantic) {
                promises.push(
                    this._loadVoy().catch(err => {
                        console.warn('[Search] Semantic search unavailable:', err.message);
                        return null;
                    })
                );
            } else {
                console.log('[Search] Semantic search disabled in config');
                promises.push(Promise.resolve(null));
            }

            const [metadataResponse, invertedResponse, voyResult] = await Promise.all(promises);

            // Load Voy index if available
            if (voyResult) {
                this.voy = voyResult;
                this.semanticReady = true;
                console.log('[Search] Semantic index loaded');
            }

            // Load metadata
            if (metadataResponse?.ok) {
                this.metadata = await metadataResponse.json();
                console.log('[Search] Metadata loaded');
            }

            // Load inverted index
            if (invertedResponse?.ok) {
                this.invertedIndex = await invertedResponse.json();
                this.keywordReady = true;
                console.log('[Search] Inverted index loaded');
            }

            this.ready = this.keywordReady || this.semanticReady;

            if (!this.ready) {
                throw new Error('No search indexes available');
            }

            console.log(`[Search] Ready (keyword: ${this.keywordReady}, semantic: ${this.semanticReady})`);
            return true;

        } catch (err) {
            console.error('[Search] Init failed:', err);
            this.ready = false;
            throw err;
        }
    }

    /**
     * Load Voy semantic search engine
     * @private
     */
    async _loadVoy() {
        const indexResponse = await fetch(this.indexUrl);
        if (!indexResponse.ok) {
            throw new Error('Semantic index not found');
        }
        const { getVoy } = await import('/lib/voy-loader.js');
        const voyModule = await getVoy();
        const indexData = await indexResponse.text();
        return voyModule.deserialize(indexData);
    }

    /**
     * BM25 keyword search
     * @param {string} query - Search query
     * @param {number} limit - Max results
     * @returns {Array} Results with BM25 scores
     */
    keywordSearch(query, limit = this.topK * 2) {
        if (!this.keywordReady || !this.invertedIndex) {
            return [];
        }

        const tokens = tokenize(query);
        if (tokens.length === 0) {
            return [];
        }

        const { idx, dl, avgDL, N } = this.invertedIndex;
        const { k1, b } = CONFIG.bm25;
        const scores = {};

        for (const term of tokens) {
            const postings = idx[term];
            if (!postings) continue;

            // IDF: log((N - df + 0.5) / (df + 0.5) + 1)
            const df = postings.length;
            const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

            for (const { id, tf } of postings) {
                const docLen = dl[id] || avgDL;
                // BM25 TF: tf * (k1 + 1) / (tf + k1 * (1 - b + b * dl/avgdl))
                const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * docLen / avgDL));
                const score = idf * tfNorm;

                scores[id] = (scores[id] || 0) + score;
            }
        }

        // Sort by score and return top results
        return Object.entries(scores)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([id, score], rank) => ({
                url: id,
                score,
                rank: rank + 1,
                source: 'keyword',
            }));
    }

    /**
     * Semantic search using Voy
     * @param {string} query - Search query
     * @param {number} limit - Max results
     * @returns {Promise<Array>} Results
     */
    async semanticSearch(query, limit = this.topK * 2) {
        if (!this.semanticReady || !this.voy) {
            return [];
        }

        try {
            const embedding = await getVector(query.trim(), this.embeddingUrl);
            const results = this.voy.search(embedding, limit * 3);

            // Deduplicate by URL and enrich with metadata
            const seen = new Set();
            const deduplicated = [];

            for (const neighbor of results.neighbors) {
                if (!seen.has(neighbor.url)) {
                    seen.add(neighbor.url);
                    const meta = this.findMetadata(neighbor.url);
                    deduplicated.push({
                        url: neighbor.url,
                        id: neighbor.id,
                        title: meta?.title || neighbor.title || neighbor.url.split('/').pop(),
                        date: meta?.date || '',
                        text: meta?.text || '',
                        rank: deduplicated.length + 1,
                        source: 'ai',
                    });

                    if (deduplicated.length >= limit) break;
                }
            }

            return deduplicated;
        } catch (err) {
            console.warn('[Search] Semantic search failed:', err.message);
            return [];
        }
    }

    /**
     * Hybrid search combining keyword and semantic results
     * Uses Reciprocal Rank Fusion (RRF) for merging
     * @param {string} query - Search query
     * @param {number} limit - Max results
     * @returns {Promise<Array>} Merged results
     */
    async search(query, limit = this.topK) {
        if (!this.ready) {
            throw new Error('Search not initialized. Call init() first.');
        }

        if (!query || query.trim().length < 2) {
            return [];
        }

        const trimmedQuery = query.trim();

        // Run both searches in parallel
        const [keywordResults, semanticResults] = await Promise.all([
            Promise.resolve(this.keywordSearch(trimmedQuery, limit * 2)),
            this.semanticSearch(trimmedQuery, limit * 2),
        ]);

        // Merge using Reciprocal Rank Fusion
        const rrfScores = {};
        const k = CONFIG.rrfK;

        // Add keyword results
        for (const result of keywordResults) {
            const rrf = CONFIG.keywordWeight / (k + result.rank);
            rrfScores[result.url] = (rrfScores[result.url] || 0) + rrf;
        }

        // Add semantic results
        for (const result of semanticResults) {
            const rrf = CONFIG.semanticWeight / (k + result.rank);
            rrfScores[result.url] = (rrfScores[result.url] || 0) + rrf;
        }

        // Sort by RRF score
        const sortedUrls = Object.entries(rrfScores)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([url]) => url);

        // Build final results with metadata
        const results = [];
        for (const url of sortedUrls) {
            // Find metadata from any source
            const meta = this.findMetadata(url);
            const inKeyword = keywordResults.some(r => r.url === url);
            const inSemantic = semanticResults.some(r => r.url === url);

            results.push({
                url,
                title: meta?.title || url.split('/').pop(),
                date: meta?.date || '',
                text: meta?.text || '',
                rank: results.length + 1,
                sources: [
                    inKeyword ? 'keyword' : null,
                    inSemantic ? 'ai' : null,
                ].filter(Boolean),
            });
        }

        return results;
    }

    /**
     * Find metadata for a URL
     * @private
     */
    findMetadata(url) {
        if (!this.metadata) return null;

        // Try to find in metadata (may have chunk suffix)
        for (const meta of Object.values(this.metadata)) {
            if (meta.url === url) {
                return meta;
            }
        }

        return null;
    }

    /**
     * Keyword-only search (for fast results without API call)
     * @param {string} query - Search query
     * @param {number} limit - Max results
     * @returns {Array} Results
     */
    searchKeywordOnly(query, limit = this.topK) {
        if (!query || query.trim().length < 2) {
            return [];
        }

        const results = this.keywordSearch(query.trim(), limit);

        return results.map(r => ({
            url: r.url,
            title: this.findMetadata(r.url)?.title || r.url.split('/').pop(),
            date: this.findMetadata(r.url)?.date || '',
            text: this.findMetadata(r.url)?.text || '',
            rank: r.rank,
            sources: ['keyword'],
        }));
    }

    /**
     * Check if search is ready
     */
    isReady() {
        return this.ready;
    }

    /**
     * Check if keyword search is available
     */
    isKeywordReady() {
        return this.keywordReady;
    }

    /**
     * Check if semantic search is available
     */
    isSemanticReady() {
        return this.semanticReady;
    }
}

// ============================================================
// SEARCH UI COMPONENT
// ============================================================
export class SearchUI {
    constructor(containerId, searchClient) {
        this.container = document.getElementById(containerId);
        this.client = searchClient;
        this.debounceTimer = null;
    }

    render() {
        this.container.innerHTML = `
            <div class="search-wrapper">
                <input type="text"
                       class="search-input"
                       placeholder="Search posts..."
                       aria-label="Search">
                <div class="search-results"></div>
            </div>
        `;

        const input = this.container.querySelector('.search-input');
        const results = this.container.querySelector('.search-results');

        input.addEventListener('input', (e) => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.handleSearch(e.target.value, results);
            }, 300);
        });
    }

    async handleSearch(query, resultsContainer) {
        if (!query || query.length < 2) {
            resultsContainer.innerHTML = '';
            return;
        }

        resultsContainer.innerHTML = '<div class="search-loading">Searching...</div>';

        try {
            const results = await this.client.search(query);

            if (results.length === 0) {
                resultsContainer.innerHTML = '<div class="search-empty">No results found</div>';
                return;
            }

            resultsContainer.innerHTML = results.map(r => `
                <a href="${r.url}" class="search-result">
                    <div class="search-result-title">${this.escapeHtml(r.title)}</div>
                    ${r.text ? `<div class="search-result-text">${this.escapeHtml(r.text)}...</div>` : ''}
                    <div class="search-result-meta">
                        ${r.date ? `<span class="search-result-date">${r.date}</span>` : ''}
                        <span class="search-result-sources">${r.sources.join(' + ')}</span>
                    </div>
                </a>
            `).join('');

        } catch (err) {
            resultsContainer.innerHTML = `<div class="search-error">Search error: ${err.message}</div>`;
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

export default SearchClient;
