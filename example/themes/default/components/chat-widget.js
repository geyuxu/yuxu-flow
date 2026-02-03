/**
 * AI Chat Widget
 *
 * Floating chat bubble with RAG-powered responses.
 * Uses vector search for context retrieval.
 */

const CHAT_CONFIG = {
    apiUrl: 'https://yuxu.ge/api/chat',
    maxMessages: 20,
    maxContextChunks: 3,
    storageKey: 'chat_history',
    historyTTL: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Simple markdown to HTML converter
 */
function parseMarkdown(text) {
    return text
        // Escape HTML
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        // Bold
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
        // Line breaks
        .replace(/\n/g, '<br>');
}

export class ChatWidget {
    constructor() {
        this.messages = [];
        this.isOpen = false;
        this.isLoading = false;
        this.searchClient = null;
        this.container = null;
    }

    /**
     * Initialize the chat widget
     * @param {SearchClient} searchClient - Optional search client for RAG
     */
    async init(searchClient = null) {
        this.searchClient = searchClient;
        this.render();
        this.bindEvents();
        this.loadHistory();
    }

    render() {
        // Create container
        this.container = document.createElement('div');
        this.container.id = 'chat-widget';
        this.container.innerHTML = `
            <button class="chat-bubble" id="chat-bubble" aria-label="Open chat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
            </button>
            <div class="chat-window" id="chat-window">
                <div class="chat-header">
                    <span class="chat-title">AI Assistant</span>
                    <div class="chat-header-actions">
                        <button class="chat-clear" id="chat-clear" aria-label="Clear history" title="Clear history">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                        <button class="chat-close" id="chat-close" aria-label="Close chat">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="chat-messages" id="chat-messages">
                    <div class="chat-welcome">
                        <p>Hi! I'm Yuxu's AI assistant.</p>
                        <p>Ask me about blog posts, projects, or anything else!</p>
                    </div>
                </div>
                <form class="chat-input-form" id="chat-form">
                    <input type="text" class="chat-input" id="chat-input"
                           placeholder="Type a message..." autocomplete="off">
                    <button type="submit" class="chat-send" id="chat-send" aria-label="Send">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>
                </form>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            #chat-widget {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 9999;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }

            .chat-bubble {
                width: 56px;
                height: 56px;
                border-radius: 50%;
                background: linear-gradient(135deg, #C41E3A 0%, #a01830 100%);
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 12px rgba(196, 30, 58, 0.4);
                transition: transform 0.2s, box-shadow 0.2s;
            }

            .chat-bubble:hover {
                transform: scale(1.05);
                box-shadow: 0 6px 16px rgba(196, 30, 58, 0.5);
            }

            .chat-bubble svg {
                width: 24px;
                height: 24px;
                color: white;
            }

            .chat-bubble.hidden {
                display: none;
            }

            .chat-window {
                position: absolute;
                bottom: 70px;
                right: 0;
                width: 360px;
                height: 480px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
                display: none;
                flex-direction: column;
                overflow: hidden;
            }

            .chat-window.open {
                display: flex;
            }

            .chat-header {
                padding: 16px;
                background: linear-gradient(135deg, #C41E3A 0%, #a01830 100%);
                color: white;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .chat-title {
                font-weight: 600;
                font-size: 15px;
            }

            .chat-header-actions {
                display: flex;
                gap: 4px;
            }

            .chat-close,
            .chat-clear {
                background: none;
                border: none;
                cursor: pointer;
                padding: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                transition: background 0.2s;
            }

            .chat-close:hover,
            .chat-clear:hover {
                background: rgba(255, 255, 255, 0.2);
            }

            .chat-close svg,
            .chat-clear svg {
                width: 18px;
                height: 18px;
                color: white;
            }

            .chat-messages {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .chat-welcome {
                text-align: center;
                color: #666;
                font-size: 14px;
                padding: 20px 0;
            }

            .chat-welcome p {
                margin: 4px 0;
            }

            .chat-message {
                max-width: 85%;
                padding: 10px 14px;
                border-radius: 12px;
                font-size: 14px;
                line-height: 1.4;
                word-wrap: break-word;
            }

            .chat-message.user {
                align-self: flex-end;
                background: #C41E3A;
                color: white;
                border-bottom-right-radius: 4px;
            }

            .chat-message.assistant {
                align-self: flex-start;
                background: #f0f0f0;
                color: #333;
                border-bottom-left-radius: 4px;
            }

            .chat-message.assistant a {
                color: #C41E3A;
                text-decoration: underline;
            }

            .chat-message.assistant a:hover {
                color: #a01830;
            }

            .chat-message.assistant strong {
                font-weight: 600;
            }

            .chat-message.loading {
                background: #f0f0f0;
                color: #666;
            }

            .chat-message.loading::after {
                content: '';
                animation: dots 1.5s infinite;
            }

            @keyframes dots {
                0%, 20% { content: '.'; }
                40% { content: '..'; }
                60%, 100% { content: '...'; }
            }

            .chat-input-form {
                padding: 12px;
                border-top: 1px solid #e5e5e5;
                display: flex;
                gap: 8px;
            }

            .chat-input {
                flex: 1;
                padding: 10px 14px;
                border: 1px solid #e0e0e0;
                border-radius: 20px;
                font-size: 14px;
                outline: none;
                transition: border-color 0.2s;
            }

            .chat-input:focus {
                border-color: #C41E3A;
            }

            .chat-send {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: #C41E3A;
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s;
            }

            .chat-send:hover {
                background: #a01830;
            }

            .chat-send:disabled {
                background: #ccc;
                cursor: not-allowed;
            }

            .chat-send svg {
                width: 18px;
                height: 18px;
                color: white;
            }

            @media (max-width: 480px) {
                #chat-widget {
                    bottom: 10px;
                    right: 10px;
                }

                .chat-window {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    width: 100%;
                    height: 100%;
                    border-radius: 0;
                    max-height: 100vh;
                    max-height: 100dvh;
                }

                .chat-header {
                    padding: 12px 16px;
                    padding-top: max(12px, env(safe-area-inset-top));
                }

                .chat-messages {
                    padding: 12px;
                    flex: 1;
                    min-height: 0;
                }

                .chat-input-form {
                    padding: 10px 12px;
                    padding-bottom: max(10px, env(safe-area-inset-bottom));
                    gap: 8px;
                    background: white;
                }

                .chat-input {
                    padding: 10px 14px;
                    font-size: 16px; /* Prevents iOS zoom on focus */
                }

                .chat-bubble {
                    width: 48px;
                    height: 48px;
                }

                .chat-bubble svg {
                    width: 20px;
                    height: 20px;
                }
            }

            /* Handle keyboard visible on mobile */
            @media (max-width: 480px) and (max-height: 500px) {
                .chat-messages {
                    flex: 1;
                    min-height: 100px;
                }
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(this.container);
    }

    bindEvents() {
        const bubble = document.getElementById('chat-bubble');
        const closeBtn = document.getElementById('chat-close');
        const clearBtn = document.getElementById('chat-clear');
        const form = document.getElementById('chat-form');
        const input = document.getElementById('chat-input');

        bubble.addEventListener('click', () => this.toggle());
        closeBtn.addEventListener('click', () => this.close());
        clearBtn.addEventListener('click', () => this.clearHistory());
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendMessage(input.value);
            input.value = '';
        });

        // ESC to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }

    toggle() {
        this.isOpen ? this.close() : this.open();
    }

    open() {
        this.isOpen = true;
        document.getElementById('chat-window').classList.add('open');
        document.getElementById('chat-bubble').classList.add('hidden');
        document.getElementById('chat-input').focus();
    }

    close() {
        this.isOpen = false;
        document.getElementById('chat-window').classList.remove('open');
        document.getElementById('chat-bubble').classList.remove('hidden');
    }

    async sendMessage(text) {
        if (!text.trim() || this.isLoading) return;

        // Add user message
        this.addMessage('user', text);
        this.messages.push({ role: 'user', content: text });

        // Show loading
        this.isLoading = true;
        const loadingEl = this.addMessage('assistant', 'Thinking', true);
        document.getElementById('chat-send').disabled = true;

        try {
            // Get RAG context if search client available
            let context = '';
            if (this.searchClient?.isReady()) {
                try {
                    const results = await this.searchClient.search(text, CHAT_CONFIG.maxContextChunks);
                    if (results.length > 0) {
                        context = results.map(r => `[${r.title}]\n${r.text || ''}`).join('\n\n');
                    }
                } catch (e) {
                    console.warn('RAG search failed:', e);
                }
            }

            // Call chat API
            const response = await fetch(CHAT_CONFIG.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: this.messages.slice(-CHAT_CONFIG.maxMessages),
                    context,
                }),
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            const reply = data.reply || 'Sorry, I encountered an error.';

            // Replace loading with actual response (render markdown)
            loadingEl.innerHTML = parseMarkdown(reply);
            loadingEl.classList.remove('loading');
            this.messages.push({ role: 'assistant', content: reply });

            // Save to localStorage
            this.saveHistory();

        } catch (err) {
            console.error('Chat error:', err);
            loadingEl.textContent = 'Sorry, something went wrong. Please try again.';
            loadingEl.classList.remove('loading');
        } finally {
            this.isLoading = false;
            document.getElementById('chat-send').disabled = false;
        }

        this.scrollToBottom();
    }

    addMessage(role, content, isLoading = false) {
        const messagesEl = document.getElementById('chat-messages');

        // Remove welcome message if exists
        const welcome = messagesEl.querySelector('.chat-welcome');
        if (welcome) welcome.remove();

        const msgEl = document.createElement('div');
        msgEl.className = `chat-message ${role}${isLoading ? ' loading' : ''}`;
        msgEl.textContent = content;
        messagesEl.appendChild(msgEl);

        this.scrollToBottom();
        return msgEl;
    }

    scrollToBottom() {
        const messagesEl = document.getElementById('chat-messages');
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    /**
     * Save chat history to localStorage
     */
    saveHistory() {
        try {
            const data = {
                messages: this.messages.slice(-CHAT_CONFIG.maxMessages),
                timestamp: Date.now(),
            };
            localStorage.setItem(CHAT_CONFIG.storageKey, JSON.stringify(data));
        } catch (e) {
            console.warn('Failed to save chat history:', e);
        }
    }

    /**
     * Load chat history from localStorage
     */
    loadHistory() {
        try {
            const raw = localStorage.getItem(CHAT_CONFIG.storageKey);
            if (!raw) return;

            const data = JSON.parse(raw);

            // Check if history is expired
            if (Date.now() - data.timestamp > CHAT_CONFIG.historyTTL) {
                localStorage.removeItem(CHAT_CONFIG.storageKey);
                return;
            }

            if (data.messages && data.messages.length > 0) {
                this.messages = data.messages;
                this.renderHistory();
            }
        } catch (e) {
            console.warn('Failed to load chat history:', e);
        }
    }

    /**
     * Render saved history messages
     */
    renderHistory() {
        const messagesEl = document.getElementById('chat-messages');

        // Remove welcome message
        const welcome = messagesEl.querySelector('.chat-welcome');
        if (welcome) welcome.remove();

        // Render each message
        for (const msg of this.messages) {
            const msgEl = document.createElement('div');
            msgEl.className = `chat-message ${msg.role}`;
            if (msg.role === 'assistant') {
                msgEl.innerHTML = parseMarkdown(msg.content);
            } else {
                msgEl.textContent = msg.content;
            }
            messagesEl.appendChild(msgEl);
        }

        this.scrollToBottom();
    }

    /**
     * Clear chat history
     */
    clearHistory() {
        this.messages = [];
        localStorage.removeItem(CHAT_CONFIG.storageKey);

        const messagesEl = document.getElementById('chat-messages');
        messagesEl.innerHTML = `
            <div class="chat-welcome">
                <p>Hi! I'm Yuxu's AI assistant.</p>
                <p>Ask me about blog posts, projects, or anything else!</p>
            </div>
        `;
    }
}

/**
 * Auto-initialize chat widget
 */
export async function initChatWidget() {
    const widget = new ChatWidget();

    // Try to use existing search client for RAG
    let searchClient = null;
    try {
        const { SearchClient } = await import('/components/search-client.js');
        searchClient = new SearchClient();
        await searchClient.init();
    } catch (e) {
        console.warn('Search client not available for RAG:', e);
    }

    await widget.init(searchClient);
    return widget;
}

export default ChatWidget;
