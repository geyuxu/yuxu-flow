#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env --allow-net
/**
 * Build Medium-friendly HTML
 * - Creates GitHub Gists for long code blocks (>15 lines)
 * - Converts tables to PNG images (requires Puppeteer)
 * Output: blog/medium/{slug}.html
 * Run: GITHUB_TOKEN_CREATE_GIST=xxx deno task build:medium
 */

import { join, dirname, basename } from "@std/path";
import { marked, Renderer, type Tokens } from "marked";
import { tableToImage } from "./table-to-image.ts";
import { getConfig, getPostsDir, getProjectRoot } from "./config.ts";

const config = getConfig();
const PROJECT_ROOT = getProjectRoot();
const POSTS_DIR = getPostsDir();
const DIST_DIR = join(PROJECT_ROOT, config.paths.output);
const POSTS_JSON = join(DIST_DIR, "blog", "posts.json");
const OUTPUT_DIR = join(DIST_DIR, "blog", "medium");
const GIST_CACHE_FILE = join(DIST_DIR, "blog", ".gist-cache.json");
const TABLE_CACHE_FILE = join(DIST_DIR, "blog", ".table-cache.json");
const MAX_CODE_LINES = config.build.medium.maxCodeLines;

// GitHub API for Gist creation
const GITHUB_TOKEN_CREATE_GIST = Deno.env.get("GITHUB_TOKEN_CREATE_GIST");

// Note: medium export feature check moved to build() function

// Check if file exists
function existsSync(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

// Load or initialize caches
let gistCache: Record<string, string> = {};
if (existsSync(GIST_CACHE_FILE)) {
  gistCache = JSON.parse(Deno.readTextFileSync(GIST_CACHE_FILE));
}

let tableCache: Record<string, string> = {};
if (existsSync(TABLE_CACHE_FILE)) {
  tableCache = JSON.parse(Deno.readTextFileSync(TABLE_CACHE_FILE));
}

// Create a hash for code content to use as cache key
function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

// Create GitHub Gist
async function createGist(
  code: string,
  language: string,
  description: string
): Promise<string> {
  const extMap: Record<string, string> = {
    python: "py",
    javascript: "js",
    typescript: "ts",
    bash: "sh",
    text: "txt",
  };
  const ext = extMap[language] || language || "txt";
  const filename = `code.${ext}`;

  const response = await fetch("https://api.github.com/gists", {
    method: "POST",
    headers: {
      Authorization: `token ${GITHUB_TOKEN_CREATE_GIST}`,
      "Content-Type": "application/json",
      "User-Agent": "build-medium.ts",
    },
    body: JSON.stringify({
      description: description || "Code snippet",
      public: true,
      files: {
        [filename]: { content: code },
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const msg = data.message || `Status ${response.status}`;
    throw new Error(`GitHub API: ${msg}`);
  }

  return data.html_url;
}

// Store pending gists and tables to create
interface PendingGist {
  code: string;
  language: string;
  hash: string;
  lines: number;
}

interface PendingTable {
  html: string;
  hash: string;
}

const pendingGists: PendingGist[] = [];
const pendingTables: PendingTable[] = [];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Custom renderer for Medium compatibility
const renderer = new Renderer();

// Replace long code blocks with placeholder or gist link
renderer.code = function ({ text, lang }: Tokens.Code): string {
  const code = text || "";
  const language = lang || "text";
  const lines = code.split("\n");

  if (lines.length > MAX_CODE_LINES) {
    const codeHash = hashCode(code);
    const previewLines = lines.slice(0, 8);
    const previewFormatted = previewLines
      .map((line) => `<code>${escapeHtml(line)}</code>`)
      .join("<br>\n");
    const moreLines = lines.length - 8;

    // Check cache for existing gist - output preview + Gist link
    if (gistCache[codeHash]) {
      return `<blockquote>${previewFormatted}<br>\n<code># ... (${moreLines} more lines)</code></blockquote>
<p><em>View full code: <a href="${gistCache[codeHash]}">GitHub Gist</a></em></p>`;
    }

    // Queue for gist creation (always track, create only if token available)
    pendingGists.push({ code, language, hash: codeHash, lines: lines.length });

    if (GITHUB_TOKEN_CREATE_GIST) {
      // Will replace placeholder with actual gist URL later - output preview + link
      return `<blockquote>${previewFormatted}<br>\n<code># ... (${moreLines} more lines)</code></blockquote>
<p><em>View full code: <a href="__GIST_${codeHash}__">GitHub Gist</a></em></p>`;
    }

    // No token - fallback to repo link with code preview
    return `<blockquote>${previewFormatted}<br>\n<code># ... (${moreLines} more lines)</code></blockquote>
<p><em>Full code available in the <a href="https://github.com/geyuxu">GitHub repository</a>.</em></p>`;
  }

  // Short code block - use inline code format for Medium compatibility
  if (lines.length === 1) {
    // Single line: inline code
    return `<p><code>${escapeHtml(code)}</code></p>`;
  }
  // Multi-line short code: use blockquote with code formatting
  const formattedLines = lines
    .map((line) => `<code>${escapeHtml(line)}</code>`)
    .join("<br>\n");
  return `<blockquote>${formattedLines}</blockquote>`;
};

// Convert tables to images
renderer.table = function ({ header, rows }: Tokens.Table): string {
  // Build HTML table for image rendering
  const extractText = (cell: Tokens.TableCell): string => {
    if (cell.tokens && cell.tokens.length > 0) {
      return cell.tokens
        .map((t) => {
          if (t.type === "strong") return `<strong>${(t as Tokens.Strong).text}</strong>`;
          if (t.type === "codespan") return `<code>${(t as Tokens.Codespan).text}</code>`;
          return (t as { text?: string; raw?: string }).text || (t as { raw?: string }).raw || "";
        })
        .join("");
    }
    return cell.text || "";
  };

  let tableHtml = "<table>\n<tr>";
  header.forEach((h) => {
    tableHtml += `<th>${extractText(h)}</th>`;
  });
  tableHtml += "</tr>\n";

  rows.forEach((row) => {
    tableHtml += "<tr>";
    row.forEach((cell) => {
      tableHtml += `<td>${extractText(cell)}</td>`;
    });
    tableHtml += "</tr>\n";
  });
  tableHtml += "</table>";

  // Generate hash for caching
  const tableHash = hashCode(tableHtml).slice(0, 8);

  // Check cache (and verify file exists)
  if (tableCache[tableHash]) {
    const cachedPath = join(PROJECT_ROOT, "blog", tableCache[tableHash].replace("/blog/", ""));
    if (existsSync(cachedPath)) {
      return `<p><img src="${tableCache[tableHash]}" alt="Table"></p>`;
    }
  }

  // Queue for image generation
  pendingTables.push({ html: tableHtml, hash: tableHash });
  return `<p><img src="__TABLE_${tableHash}__" alt="Table"></p>`;
};

// Configure marked
marked.setOptions({
  renderer: renderer,
  gfm: true,
  breaks: false,
});

// Build HTML wrapper
function buildHtml(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: Georgia, serif; max-width: 700px; margin: 2rem auto; padding: 0 1rem; line-height: 1.7; color: #333; }
        h1 { font-size: 2rem; margin-bottom: 0.5rem; }
        h2 { font-size: 1.4rem; margin-top: 2rem; }
        pre { background: #f4f4f4; padding: 1rem; overflow-x: auto; border-radius: 4px; }
        code { font-family: Menlo, Monaco, monospace; font-size: 0.9em; }
        p code { background: #f4f4f4; padding: 0.2em 0.4em; border-radius: 3px; }
        img { max-width: 100%; }
        blockquote { border-left: 3px solid #ddd; margin-left: 0; padding-left: 1rem; color: #666; }
        ul { padding-left: 1.5rem; }
        hr { border: none; border-top: 1px solid #ddd; margin: 2rem 0; }
        a { color: #1a8917; }
    </style>
</head>
<body>
${content}
</body>
</html>`;
}

interface Post {
  slug: string;
  title: string;
  type: string;
}

interface PostOutput {
  post: Post;
  htmlContent: string;
  htmlPath: string;
}

// Main async build function
async function build() {
  // Skip if medium export is disabled
  if (!config.features.mediumExport) {
    console.log("Medium export is disabled in config. Skipping.");
    return;
  }

  console.log(`Posts directory: ${POSTS_DIR}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log("");

  let posts: Post[] = [];
  if (existsSync(POSTS_JSON)) {
    posts = JSON.parse(Deno.readTextFileSync(POSTS_JSON));
  }

  // Clean and recreate output dir
  if (existsSync(OUTPUT_DIR)) {
    Deno.removeSync(OUTPUT_DIR, { recursive: true });
    console.log("OK Cleaned medium/");
  }
  Deno.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Track generated HTML for each post (to replace gist placeholders later)
  const postOutputs: PostOutput[] = [];

  for (const post of posts) {
    if (post.type !== "markdown") continue;

    // Support both old and new path structures
    let mdPath = join(POSTS_DIR, `${post.slug.replace("posts/", "")}.md`);
    if (!existsSync(mdPath)) {
      mdPath = join(PROJECT_ROOT, "blog", `${post.slug}.md`);
    }

    if (!existsSync(mdPath)) {
      console.log(`Warning: Skip: ${post.slug}.md not found`);
      continue;
    }

    const markdown = Deno.readTextFileSync(mdPath);
    const htmlContent = marked.parse(markdown) as string;
    const htmlPath = join(OUTPUT_DIR, `${post.slug}.html`);

    postOutputs.push({ post, htmlContent, htmlPath });
  }

  // Create table images
  if (pendingTables.length > 0) {
    console.log(`\nConverting ${pendingTables.length} tables to images...`);

    for (const table of pendingTables) {
      try {
        const imgPath = await tableToImage(table.html, `table-${table.hash}`);
        const relativePath = "/blog/images/tables/" + basename(imgPath);
        tableCache[table.hash] = relativePath;
        console.log(`  OK Table image: ${relativePath}`);
      } catch (err) {
        console.log(`  FAIL table image: ${(err as Error).message}`);
      }
    }

    // Save cache
    Deno.writeTextFileSync(TABLE_CACHE_FILE, JSON.stringify(tableCache, null, 2));
    console.log("OK Table cache saved to .table-cache.json");
  }

  // Create gists if we have pending ones and a token
  if (pendingGists.length > 0 && GITHUB_TOKEN_CREATE_GIST) {
    const masked =
      GITHUB_TOKEN_CREATE_GIST.slice(0, 4) +
      "..." +
      GITHUB_TOKEN_CREATE_GIST.slice(-4);
    console.log(
      `\nCreating ${pendingGists.length} GitHub Gists (token: ${masked})...`
    );

    for (const gist of pendingGists) {
      try {
        const url = await createGist(
          gist.code,
          gist.language,
          `Code snippet (${gist.lines} lines)`
        );
        gistCache[gist.hash] = url;
        console.log(`  OK Gist created: ${url}`);
      } catch (err) {
        console.log(`  FAIL gist: ${(err as Error).message}`);
      }
    }

    // Save cache
    Deno.writeTextFileSync(GIST_CACHE_FILE, JSON.stringify(gistCache, null, 2));
    console.log("OK Gist cache saved to .gist-cache.json");
  } else if (pendingGists.length > 0) {
    console.log(
      `\nWarning: ${pendingGists.length} long code blocks found but no GITHUB_TOKEN_CREATE_GIST set.`
    );
    console.log(
      "  Run with: GITHUB_TOKEN_CREATE_GIST=xxx deno task build:medium"
    );
  }

  // Write HTML files (replace placeholders with actual URLs/paths)
  for (const { post, htmlContent, htmlPath } of postOutputs) {
    let finalHtml = htmlContent;

    // Replace gist placeholders
    for (const [hash, url] of Object.entries(gistCache)) {
      finalHtml = finalHtml.replace(new RegExp(`__GIST_${hash}__`, "g"), url);
    }

    // Replace table placeholders
    for (const [hash, imgPath] of Object.entries(tableCache)) {
      finalHtml = finalHtml.replace(new RegExp(`__TABLE_${hash}__`, "g"), imgPath);
    }

    const fullHtml = buildHtml(post.title, finalHtml);
    const htmlDir = dirname(htmlPath);
    try {
      Deno.mkdirSync(htmlDir, { recursive: true });
    } catch {
      // Directory exists
    }
    Deno.writeTextFileSync(htmlPath, fullHtml);

    console.log(`OK ${post.slug}.html`);
  }

  console.log(`\nDone! Medium-friendly files in: ${OUTPUT_DIR}/`);
  if (GITHUB_TOKEN_CREATE_GIST) {
    console.log("Note: Long code blocks converted to GitHub Gists.");
  } else {
    console.log(
      "Note: Long code blocks truncated (set GITHUB_TOKEN_CREATE_GIST for Gist creation)."
    );
  }
  console.log("Note: Tables converted to PNG images.");
}

// Export main function
export async function main() {
  await build();
}

// Run if called directly
if (import.meta.main) {
  build().catch((err) => {
    console.error("Build failed:", err);
    Deno.exit(1);
  });
}
