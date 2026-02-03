/**
 * Cloudflare Worker - OpenAI API Proxy
 *
 * Endpoints:
 *   POST /api/embedding - Get text embeddings (for vector search)
 *   POST /api/chat      - Chat completion with RAG context
 *   POST /api/translate - Translate content to target language (with KV caching)
 *   GET  /api/languages - Get supported languages
 *
 * Environment Variables (set in Cloudflare Dashboard):
 *   - OPENAI_API_KEY: Your OpenAI API key
 *   - system_prompt: System prompt for chat
 *
 * KV Namespaces (bind in Cloudflare Dashboard):
 *   - TRANSLATIONS: For caching translated content (optional)
 */

// Supported languages for translation
const LANGUAGES = {
    'en': 'English',
    'zh': '中文 (Chinese)',
    'ja': '日本語 (Japanese)',
    'ko': '한국어 (Korean)',
    'es': 'Español (Spanish)',
    'fr': 'Français (French)',
    'de': 'Deutsch (German)',
    'pt': 'Português (Portuguese)',
    'ru': 'Русский (Russian)',
    'ar': 'العربية (Arabic)',
};

// Simple hash for cache keys
function hashContent(content) {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

export default {
    async fetch(request, env) {
        const origin = request.headers.get("Origin");
        const allowedOrigins = ["https://yuxu.ge", "https://www.yuxu.ge", "http://localhost:8080", "http://127.0.0.1:8080"];

        const corsHeaders = {
            "Access-Control-Allow-Origin": allowedOrigins.includes(origin) ? origin : "https://yuxu.ge",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        // GET /api/languages - return supported languages
        if (request.method === "GET" && (path === "/api/languages" || path === "/api/translate/languages")) {
            return new Response(JSON.stringify({ languages: LANGUAGES }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        if (request.method !== "POST") {
            return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
        }

        try {
            // Route: /api/chat
            if (path === "/api/chat") {
                const { messages, context } = await request.json();

                const systemPrompt = env.system_prompt || "你是一个友好的 AI 助手。";
                const fullPrompt = context
                    ? `${systemPrompt}\n\n## 相关博客内容\n${context}`
                    : systemPrompt;

                const response = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
                    },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [{ role: "system", content: fullPrompt }, ...messages],
                        max_tokens: 1024,
                        temperature: 0.7,
                    }),
                });

                const data = await response.json();
                return new Response(JSON.stringify({ reply: data.choices[0].message.content }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            // Route: /api/translate
            if (path === "/api/translate") {
                const { content, targetLang, slug } = await request.json();

                if (!content || typeof content !== 'string') {
                    return new Response(JSON.stringify({ error: 'Missing or invalid "content" field' }), {
                        status: 400,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }

                if (!targetLang || !LANGUAGES[targetLang]) {
                    return new Response(JSON.stringify({ error: 'Invalid target language', supported: Object.keys(LANGUAGES) }), {
                        status: 400,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }

                if (content.length > 40000) {
                    return new Response(JSON.stringify({ error: 'Content too long (max 40000 chars)' }), {
                        status: 400,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }

                // Check KV cache if available
                const contentHash = hashContent(content);
                const cacheKey = `${slug || 'post'}_${contentHash}_${targetLang}`;

                if (env.TRANSLATIONS) {
                    try {
                        const cached = await env.TRANSLATIONS.get(cacheKey);
                        if (cached) {
                            return new Response(JSON.stringify({ translated: cached, cached: true }), {
                                headers: { ...corsHeaders, "Content-Type": "application/json" },
                            });
                        }
                    } catch (e) {
                        console.warn('KV read error:', e);
                    }
                }

                // Translate via OpenAI
                const langName = LANGUAGES[targetLang];
                const response = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
                    },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [
                            {
                                role: "system",
                                content: `You are a professional translator. Translate the following content to ${langName}.

Rules:
- Preserve all Markdown formatting (headers, code blocks, links, lists, etc.)
- Keep code blocks unchanged (do not translate code)
- Keep technical terms in their original form when appropriate
- Maintain the same tone and style
- Do not add explanations or notes
- Return only the translated content`
                            },
                            { role: "user", content }
                        ],
                        max_tokens: 4096,
                        temperature: 0.3,
                    }),
                });

                if (!response.ok) {
                    const error = await response.text();
                    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
                }

                const data = await response.json();
                const translated = data.choices[0].message.content;

                // Cache result if KV available
                if (env.TRANSLATIONS) {
                    try {
                        await env.TRANSLATIONS.put(cacheKey, translated, {
                            expirationTtl: 30 * 24 * 60 * 60 // 30 days
                        });
                    } catch (e) {
                        console.warn('KV write error:', e);
                    }
                }

                return new Response(JSON.stringify({ translated, cached: false }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            // Default route: /api/embedding
            const { text } = await request.json();
            const response = await fetch("https://api.openai.com/v1/embeddings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
                },
                body: JSON.stringify({
                    input: text,
                    model: "text-embedding-3-small",
                    dimensions: 512,
                }),
            });

            const data = await response.json();
            return new Response(JSON.stringify({ embedding: data.data[0].embedding }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });

        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }
    },
};
