// Shared sidebar component - Configurable via /sidebar-config.json
// Usage: <aside id="sidebar-content"></aside> + <script src="/components/sidebar.js"></script>

// Icon SVGs by type
const ICONS = {
    email: `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M1.5 8.67v8.58a3 3 0 003 3h15a3 3 0 003-3V8.67l-8.928 5.493a3 3 0 01-3.144 0L1.5 8.67z"/>
        <path d="M22.5 6.908V6.75a3 3 0 00-3-3h-15a3 3 0 00-3 3v.158l9.714 5.978a1.5 1.5 0 001.572 0L22.5 6.908z"/>
    </svg>`,
    github: `<svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
    </svg>`,
    twitter: `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>`,
    linkedin: `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452H17.2v-5.569c0-1.328-.025-3.039-1.852-3.039-1.853 0-2.136 1.447-2.136 2.942v5.666h-3.248V9h3.122v1.561h.045c.435-.823 1.498-1.688 3.083-1.688 3.295 0 3.903 2.17 3.903 4.989v6.59zM5.337 7.433a1.882 1.882 0 110-3.764 1.882 1.882 0 010 3.764zm1.626 13.019H3.708V9h3.255v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.226.792 24 1.771 24h20.451C23.2 24 24 23.226 24 22.271V1.729C24 .774 23.2 0 22.222 0z"/>
    </svg>`,
    youtube: `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>`,
    medium: `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z"/>
    </svg>`,
    orcid: `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zM7.369 4.378c.525 0 .947.431.947.947s-.422.947-.947.947a.95.95 0 0 1-.947-.947c0-.525.422-.947.947-.947zm-.722 3.038h1.444v10.041H6.647V7.416zm3.562 0h3.9c3.712 0 5.344 2.653 5.344 5.025 0 2.578-2.016 5.025-5.325 5.025h-3.919V7.416zm1.444 1.303v7.444h2.297c3.272 0 4.022-2.484 4.022-3.722 0-2.016-1.284-3.722-4.097-3.722h-2.222z"/>
    </svg>`,
    blog: `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
    </svg>`,
    gallery: `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z"/>
    </svg>`,
    website: `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
    </svg>`,
    default: `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
    </svg>`
};

// Generate sidebar HTML from config
function generateSidebarHTML(config) {
    const linksHTML = config.links.map(link => {
        const icon = ICONS[link.type] || ICONS.default;
        const isExternal = link.url.startsWith('http');
        const target = isExternal ? ' target="_blank" rel="noopener"' : '';
        const hideClass = link.hideOnMobile ? ' class="hide-mobile"' : '';
        return `<a href="${link.url}"${target}${hideClass}>${icon}${link.label}</a>`;
    }).join('\n            ');

    const emailHTML = config.email ? `
            <a href="mailto:${config.email}">
                ${ICONS.email}
                ${config.email}
            </a>` : '';

    const searchHTML = config.search !== false ? `
    <!-- Global Semantic Search -->
    <div class="sidebar-search" id="sidebar-search">
        <div class="sidebar-search-box">
            <svg class="sidebar-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
            </svg>
            <input type="text" class="sidebar-search-input" id="semantic-search-input" placeholder="Search...">
        </div>
    </div>` : '';

    return `
<div class="sidebar-top">
    <a href="/" class="avatar"><img src="${config.avatar}" alt="${config.name}"></a>
    <div class="name-block"><h1>${config.name}</h1></div>
    <div class="title-role">${config.title}</div>
    ${searchHTML}
    <div class="contact-block">
        <div class="social-links">${emailHTML}
            ${linksHTML}
        </div>
    </div>
</div>
<div class="sidebar-footer">&copy; ${config.copyright}</div>
`;
}

// CSS for sidebar search
const sidebarSearchCSS = `
.sidebar-search {
    width: 100%;
    margin-top: 1.5rem;
    margin-bottom: 0.5rem;
}

.sidebar-search-box {
    position: relative;
    width: 100%;
}

.sidebar-search-icon {
    position: absolute;
    left: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    color: #666;
    pointer-events: none;
}

.sidebar-search-input {
    width: 100%;
    padding: 0.6rem 0.75rem 0.6rem 2.25rem;
    font-size: 0.85rem;
    border: 1px solid #333;
    border-radius: 6px;
    background: #1a1a1a;
    color: #f4f4f4;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
}

.sidebar-search-input:focus {
    border-color: #C41E3A;
    box-shadow: 0 0 0 2px rgba(196, 30, 58, 0.2);
}

.sidebar-search-input::placeholder {
    color: #666;
}

@media (max-width: 900px) {
    .sidebar-search {
        margin-top: 1rem;
        margin-bottom: 0.25rem;
        max-width: 280px;
    }
    .sidebar-search-input {
        font-size: 16px;
        padding: 0.5rem 0.75rem 0.5rem 2rem;
    }
}

.search-results-overlay {
    position: fixed;
    top: 0;
    left: 320px;
    right: 0;
    bottom: 0;
    background: #f4f4f4;
    z-index: 100;
    padding: 3rem 4rem;
    overflow-y: auto;
}

.search-results-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #ddd;
}

.search-results-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: #111;
}

.search-results-close {
    padding: 0.5rem 1rem;
    font-size: 0.85rem;
    background: #111;
    color: #fff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
}

.search-results-close:hover {
    background: #C41E3A;
}

.search-results-list {
    list-style: none;
}

.search-result-item {
    padding: 1.25rem;
    margin-bottom: 1rem;
    background: #fff;
    border: 1px solid #e5e5e5;
    border-radius: 8px;
    transition: all 0.2s;
}

.search-result-item:hover {
    border-color: #C41E3A;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.search-result-item a {
    text-decoration: none;
    color: inherit;
    display: block;
}

.search-result-item-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: #111;
    margin-bottom: 0.5rem;
}

.search-result-item:hover .search-result-item-title {
    color: #C41E3A;
}

.search-result-item-text {
    font-size: 0.9rem;
    color: #666;
    line-height: 1.5;
    margin-bottom: 0.5rem;
}

.search-result-item-meta {
    font-size: 0.8rem;
    color: #888;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.search-result-sources {
    display: flex;
    gap: 0.35rem;
}

.search-source-badge {
    font-size: 0.65rem;
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
    font-weight: 500;
    text-transform: uppercase;
}

.search-source-badge.keyword {
    background: #e3f2fd;
    color: #1565c0;
}

.search-source-badge.semantic,
.search-source-badge.ai {
    background: #fce4ec;
    color: #c2185b;
}

@keyframes slideIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
}

.search-result-item.new {
    animation: slideIn 0.3s ease-out;
}

.search-ai-loading {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: #fef3c7;
    border-radius: 6px;
    margin-bottom: 1rem;
    font-size: 0.85rem;
    color: #92400e;
}

.search-ai-loading .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid #fbbf24;
    border-top-color: #92400e;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.search-loading, .search-empty, .search-error {
    text-align: center;
    padding: 3rem;
    color: #888;
    font-size: 1rem;
}

.search-error {
    color: #C41E3A;
}

@media (max-width: 900px) {
    .search-results-overlay {
        left: 0;
        padding: 1.5rem 1rem;
    }
    .search-results-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.75rem;
    }
    .search-results-title {
        font-size: 1.25rem;
    }
    .search-results-close {
        position: absolute;
        top: 1.5rem;
        right: 1rem;
    }
}
`;

// Store search client and config
let searchClient = null;
let sidebarConfig = null;

// Load config and initialize sidebar
async function initSidebar() {
    const placeholder = document.getElementById('sidebar-content');
    if (!placeholder) return;

    // Load config
    try {
        const response = await fetch('/sidebar-config.json');
        sidebarConfig = await response.json();
    } catch (e) {
        // Fallback config
        sidebarConfig = {
            name: "Your Name",
            title: "Your Title",
            avatar: "/avatar.svg",
            email: "you@example.com",
            copyright: "2026",
            search: true,
            chat: false,
            links: [
                { type: "blog", url: "/blog/", label: "Blog" },
                { type: "gallery", url: "/gallery/", label: "Gallery" }
            ]
        };
    }

    // Render sidebar
    placeholder.innerHTML = generateSidebarHTML(sidebarConfig);

    // Inject CSS
    const style = document.createElement('style');
    style.textContent = sidebarSearchCSS;
    document.head.appendChild(style);

    // Initialize search if enabled
    if (sidebarConfig.search !== false) {
        initGlobalSearch();
    }

    // Initialize chat if enabled
    if (sidebarConfig.chat === true) {
        initChat();
    }
}

// Initialize global hybrid search
function initGlobalSearch() {
    const input = document.getElementById('semantic-search-input');
    if (!input) return;

    let semanticAbort = null;
    let currentQuery = '';

    async function getSearchClient() {
        if (searchClient) return searchClient;
        try {
            const { SearchClient } = await import('/components/search-client.js');
            // Pass config: semantic search only if enabled in config
            searchClient = new SearchClient({
                enableSemantic: sidebarConfig.semanticSearch === true,
                embeddingUrl: sidebarConfig.embeddingApi || null,
            });
            await searchClient.init();
            return searchClient;
        } catch (err) {
            console.error('[Search] Init failed:', err);
            return null;
        }
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function createResultItem(r, isNew = false) {
        // URL from search index is like '/content/posts/2026/hello-world'
        // We need to transform it to '/blog/post.html?p=posts/2026/hello-world'
        const slug = r.url.replace('/content/', '');
        const href = `/blog/post.html?p=${slug}`;
        const sources = r.sources || [];
        const sourceBadges = sources.map(s =>
            `<span class="search-source-badge ${s}">${s}</span>`
        ).join('');
        return `
            <li class="search-result-item${isNew ? ' new' : ''}" data-url="${r.url}">
                <a href="${href}">
                    <div class="search-result-item-title">${escapeHtml(r.title)}</div>
                    ${r.text ? `<div class="search-result-item-text">${escapeHtml(r.text)}...</div>` : ''}
                    <div class="search-result-item-meta">
                        <span>${r.date || ''}</span>
                        <div class="search-result-sources">${sourceBadges}</div>
                    </div>
                </a>
            </li>
        `;
    }

    function showSearchOverlay(query, results, showAiLoading = false, error = null) {
        let overlay = document.getElementById('search-results-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'search-results-overlay';
            overlay.className = 'search-results-overlay';
            document.body.appendChild(overlay);
        }

        let content = '';
        if (error) {
            content = `<div class="search-error">${escapeHtml(error)}</div>`;
        } else if (results.length === 0 && !showAiLoading) {
            content = `<div class="search-empty">No results found for "${escapeHtml(query)}"</div>`;
        } else {
            const aiLoadingHtml = showAiLoading ? `
                <div class="search-ai-loading" id="ai-loading">
                    <div class="spinner"></div>
                    <span>AI searching for related content...</span>
                </div>
            ` : '';
            content = `
                ${aiLoadingHtml}
                <ul class="search-results-list" id="search-results-list">
                    ${results.map(r => createResultItem(r, false)).join('')}
                </ul>
            `;
        }

        overlay.innerHTML = `
            <div class="search-results-header">
                <h2 class="search-results-title">Search: "${escapeHtml(query)}"</h2>
                <button class="search-results-close" id="close-search">Close</button>
            </div>
            ${content}
        `;

        document.getElementById('close-search')?.addEventListener('click', closeSearch);
    }

    function mergeSemanticResults(semanticResults, keywordUrls) {
        const list = document.getElementById('search-results-list');
        const aiLoading = document.getElementById('ai-loading');
        if (aiLoading) aiLoading.remove();
        if (!list) return;

        const newResults = semanticResults.filter(r => !keywordUrls.has(r.url));

        for (const r of semanticResults) {
            if (keywordUrls.has(r.url)) {
                const existingItem = list.querySelector(`[data-url="${r.url}"]`);
                if (existingItem) {
                    const sourcesDiv = existingItem.querySelector('.search-result-sources');
                    if (sourcesDiv && !sourcesDiv.innerHTML.includes('ai')) {
                        sourcesDiv.innerHTML += `<span class="search-source-badge ai">AI</span>`;
                    }
                }
            }
        }

        for (const r of newResults) {
            r.sources = ['ai'];
            list.insertAdjacentHTML('beforeend', createResultItem(r, true));
        }
    }

    function closeSearch() {
        const overlay = document.getElementById('search-results-overlay');
        if (overlay) overlay.remove();
        input.value = '';
        currentQuery = '';
        semanticAbort = true;
    }

    async function handleSearch(query) {
        if (!query || query.length < 1) {
            const overlay = document.getElementById('search-results-overlay');
            if (overlay) overlay.remove();
            currentQuery = '';
            return;
        }

        currentQuery = query;
        semanticAbort = false;

        const client = await getSearchClient();
        if (!client) {
            showSearchOverlay(query, [], false, 'Search unavailable');
            return;
        }

        const keywordResults = client.searchKeywordOnly(query, 10);
        const keywordUrls = new Set(keywordResults.map(r => r.url));
        const shouldShowAiLoading = client.isSemanticReady() && query.length >= 2;
        showSearchOverlay(query, keywordResults, shouldShowAiLoading, null);

        if (client.isSemanticReady() && query.length >= 2) {
            try {
                const semanticResults = await client.semanticSearch(query, 10);
                if (currentQuery === query && !semanticAbort) {
                    mergeSemanticResults(semanticResults, keywordUrls);
                }
            } catch (err) {
                console.warn('[Search] Semantic search failed:', err.message);
                const aiLoading = document.getElementById('ai-loading');
                if (aiLoading) aiLoading.remove();
            }
        }
    }

    let keywordTimer = null;
    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(keywordTimer);
        keywordTimer = setTimeout(() => handleSearch(query), 50);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSearch();
    });
}

// Initialize chat widget
async function initChat() {
    if (window.location.pathname.includes('/gallery')) return;
    try {
        const { initChatWidget } = await import('/components/chat-widget.js');
        await initChatWidget();
    } catch (e) {
        console.warn('Chat widget not available:', e);
    }
}

// Auto-initialize
document.addEventListener('DOMContentLoaded', initSidebar);
