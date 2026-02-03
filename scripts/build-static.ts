#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env
/**
 * Build static HTML for crawlers/Medium
 * Output: blog/static/{slug}.html
 * Run: deno task build:static
 */

import { join, dirname } from "@std/path";
import { marked } from "marked";
import { getConfig, getPostsDir, getThemeDir, getProjectRoot } from "./config.ts";

const config = getConfig();
const PROJECT_ROOT = getProjectRoot();
const POSTS_DIR = getPostsDir();
const DIST_DIR = join(PROJECT_ROOT, config.paths.output);
const TEMPLATE_PATH = join(getThemeDir(), "blog", "post.html");
const POSTS_JSON = join(DIST_DIR, "blog", "posts.json");
const OUTPUT_DIR = join(DIST_DIR, "blog", "static");

// Check if file exists
function existsSync(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

// Process code blocks to add line number spans at build time
function addLineNumbers(html: string): string {
  return html.replace(
    /<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g,
    (_match, attrs, code) => {
      const lines = code.split("\n");
      if (lines[lines.length - 1] === "") lines.pop();
      const wrappedLines = lines
        .map((line: string) => `<span class="line">${line}</span>`)
        .join("\n");
      return `<pre><code${attrs}>${wrappedLines}</code></pre>`;
    }
  );
}

// HTML escape helper
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface Post {
  slug: string;
  title: string;
  type: string;
}

interface NotebookCell {
  cell_type: string;
  source: string | string[];
  outputs?: NotebookOutput[];
}

interface NotebookOutput {
  output_type: string;
  text?: string | string[];
  data?: {
    "text/html"?: string | string[];
    "image/png"?: string;
    "image/jpeg"?: string;
    "text/plain"?: string | string[];
  };
  traceback?: string[];
}

// Convert notebook JSON to HTML (pure implementation)
function convertNotebook(notebookPath: string): string | null {
  try {
    const content = Deno.readTextFileSync(notebookPath);
    const notebook = JSON.parse(content);
    const cells: NotebookCell[] = notebook.cells || [];
    let html = "";
    let skipFirstMarkdown = true;

    for (const cell of cells) {
      const source = Array.isArray(cell.source)
        ? cell.source.join("")
        : cell.source;

      if (cell.cell_type === "markdown") {
        // Skip frontmatter cell
        if (skipFirstMarkdown && source.startsWith("---\n")) {
          const afterFm = source.replace(/^---\n[\s\S]*?\n---\n?/, "");
          if (afterFm.trim()) {
            html += `<div class="nb-cell nb-cell-markdown">${marked.parse(afterFm)}</div>`;
          }
          skipFirstMarkdown = false;
          continue;
        }
        skipFirstMarkdown = false;
        html += `<div class="nb-cell nb-cell-markdown">${marked.parse(source)}</div>`;
      } else if (cell.cell_type === "code") {
        skipFirstMarkdown = false;
        html += '<div class="nb-cell nb-cell-code">';
        html += `<div class="nb-source"><pre><code class="language-python">${escapeHtml(source)}</code></pre></div>`;

        // Render outputs
        const outputs = cell.outputs || [];
        for (const output of outputs) {
          if (output.output_type === "stream") {
            const text = Array.isArray(output.text)
              ? output.text.join("")
              : output.text || "";
            html += `<div class="nb-output"><pre>${escapeHtml(text)}</pre></div>`;
          } else if (
            output.output_type === "execute_result" ||
            output.output_type === "display_data"
          ) {
            const data = output.data || {};
            if (data["text/html"]) {
              const htmlContent = Array.isArray(data["text/html"])
                ? data["text/html"].join("")
                : data["text/html"];
              html += `<div class="nb-output">${htmlContent}</div>`;
            } else if (data["image/png"]) {
              html += `<div class="nb-output"><img src="data:image/png;base64,${data["image/png"]}" /></div>`;
            } else if (data["image/jpeg"]) {
              html += `<div class="nb-output"><img src="data:image/jpeg;base64,${data["image/jpeg"]}" /></div>`;
            } else if (data["text/plain"]) {
              const text = Array.isArray(data["text/plain"])
                ? data["text/plain"].join("")
                : data["text/plain"];
              html += `<div class="nb-output"><pre>${escapeHtml(text)}</pre></div>`;
            }
          } else if (output.output_type === "error") {
            const traceback = (output.traceback || [])
              .join("\n")
              .replace(/\x1b\[[0-9;]*m/g, ""); // Strip ANSI codes
            html += `<div class="nb-output nb-error"><pre>${escapeHtml(traceback)}</pre></div>`;
          }
        }
        html += "</div>";
      }
    }

    return html;
  } catch (err) {
    console.error(`Error converting notebook: ${(err as Error).message}`);
    return null;
  }
}

// Notebook CSS styles (uses nb- prefix to match converter)
const notebookCss = `
/* Jupyter Notebook Styles */
.notebook-container { margin-top: 1rem; }
.notebook-download {
    display: inline-flex; align-items: center; gap: 0.5rem;
    padding: 0.5rem 1rem; margin-bottom: 1.5rem;
    background: var(--black); color: var(--off-white);
    border-radius: 4px; font-size: 0.85rem;
    transition: opacity 0.2s;
}
.notebook-download:hover { opacity: 0.8; color: var(--off-white); }
.notebook-download svg { width: 16px; height: 16px; }

/* Cells */
.nb-cell { margin-bottom: 1.5rem; }
.nb-cell-code .nb-source { background: #2d2d2d; border-radius: 6px; overflow-x: auto; }
.nb-cell-code .nb-source pre { margin: 0; padding: 1rem; }
.nb-cell-code .nb-source code { background: none; padding: 0; color: #ccc; font-family: "SF Mono", Monaco, monospace; font-size: 0.85em; }

/* Output */
.nb-output { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 0.75rem; margin-top: 0.5rem; }
.nb-output pre { margin: 0; padding: 0; background: transparent; white-space: pre-wrap; word-wrap: break-word; font-family: "SF Mono", Monaco, monospace; font-size: 0.85em; color: #222; }
.nb-output img { max-width: 100%; height: auto; display: block; margin: 0.5rem 0; }
.nb-output table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.nb-output th, .nb-output td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
.nb-output th { background: #e8e8e8; font-weight: 600; }
.nb-error pre { color: #c00; }

/* Markdown cells */
.nb-cell-markdown { padding: 0; }
.nb-cell-markdown h1:first-child { margin-top: 0; }
`;

// After article - with Prism and copy button
const afterArticle = `    </article>
    </main>
</div>

<script src="https://cdn.jsdelivr.net/npm/prismjs@1/prism.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/prismjs@1/components/prism-python.min.js"></script>
<script>
Prism.highlightAll();
document.querySelectorAll('article pre').forEach(pre => {
    const code = pre.querySelector('code');
    if (!code) return;
    const toolbar = document.createElement('div');
    toolbar.className = 'code-toolbar';
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.onclick = () => {
        navigator.clipboard.writeText(code.textContent).then(() => {
            btn.textContent = 'Copied!';
            btn.classList.add('copied');
            setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
        });
    };
    toolbar.appendChild(btn);
    pre.parentNode.insertBefore(toolbar, pre);
});
</script>
</body>
</html>`;

// Main function
export function main(argsOverride?: string[]) {
  // Skip if static HTML build is disabled
  if (!config.build.staticHtml) {
    console.log("Static HTML build is disabled in config. Skipping.");
    return;
  }

  // Read template
  let template: string;
  try {
    template = Deno.readTextFileSync(TEMPLATE_PATH);
  } catch {
    // Fallback to old location if theme template not found
    const fallbackPath = join(PROJECT_ROOT, "blog", "post.html");
    if (existsSync(fallbackPath)) {
      template = Deno.readTextFileSync(fallbackPath);
    } else {
      console.error(`Template not found: ${TEMPLATE_PATH}`);
      return;
    }
  }

  // Extract before article (fix relative paths)
  const beforeArticle = template
    .match(/[\s\S]*?<article id="article">/)?.[0]
    ?.replace('<article id="article">', "<article>")
    .replace(/<div class="loading">Loading\.\.\.<\/div>/, "")
    .replace(/\.\.\/photo\.jpg/g, "/photo.jpg") || "";

  // Read posts
  let posts: Post[] = [];
  if (existsSync(POSTS_JSON)) {
    posts = JSON.parse(Deno.readTextFileSync(POSTS_JSON));
  }

  // Parse command line arguments
  const args = argsOverride || Deno.args;
  const generateAll = args.includes("--all");
  const specificSlugs = args.filter((arg) => !arg.startsWith("--"));

  // Show usage if no arguments
  if (args.length === 0) {
    console.log("Usage:");
    console.log("  deno task build:static <slug>          Generate specific article");
    console.log("  deno task build:static <slug1> <slug2> Generate multiple articles");
    console.log("  deno task build:static --all           Generate all articles");
    console.log("\nAvailable slugs:");
    posts.forEach((p) =>
      console.log(`  ${p.slug}${p.type === "notebook" ? " (notebook)" : ""}`)
    );
    return;
  }

  // Ensure output dir exists
  try {
    Deno.mkdirSync(OUTPUT_DIR, { recursive: true });
  } catch {
    // Directory exists
  }

  posts.forEach((post) => {
    const isNotebook = post.type === "notebook";

    // Skip if not in specified list (unless --all)
    if (!generateAll && specificSlugs.length > 0 && !specificSlugs.includes(post.slug)) {
      return;
    }

    const ext = isNotebook ? ".ipynb" : ".md";
    // Support both old and new path structures
    let sourcePath = join(POSTS_DIR, `${post.slug.replace("posts/", "")}${ext}`);
    if (!existsSync(sourcePath)) {
      // Fallback to old structure
      sourcePath = join(PROJECT_ROOT, "blog", `${post.slug}${ext}`);
    }

    if (!existsSync(sourcePath)) {
      console.log(`Warning: Skip: ${post.slug}${ext} not found`);
      return;
    }

    let htmlContent: string;

    if (isNotebook) {
      // Convert notebook to HTML
      const notebookHtml = convertNotebook(sourcePath);

      if (!notebookHtml) {
        console.log(`Warning: Skip: ${post.slug} (notebook conversion failed)`);
        return;
      }

      // Add download button and wrap content
      const downloadUrl = `/${post.slug}.ipynb`;
      const downloadBtn = `
<a href="${downloadUrl}" download class="notebook-download">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
    Download Notebook (.ipynb)
</a>`;

      htmlContent = `<div class="notebook-container">
${downloadBtn}
${notebookHtml}
</div>`;
    } else {
      // Markdown processing
      const markdown = Deno.readTextFileSync(sourcePath);
      htmlContent = marked.parse(markdown) as string;
      htmlContent = addLineNumbers(htmlContent);
    }

    // Build static HTML
    let beforeArticleModified = beforeArticle.replace(
      /<title>.*?<\/title>/,
      `<title>${post.title} | ${config.site.name}</title>`
    );

    // Add notebook CSS if needed
    if (isNotebook) {
      beforeArticleModified = beforeArticleModified.replace(
        "</style>",
        notebookCss + "\n</style>"
      );
    }

    const staticHtml = beforeArticleModified + "\n" + htmlContent + "\n" + afterArticle;

    // Output path
    const htmlPath = join(OUTPUT_DIR, `${post.slug}.html`);
    const htmlDir = dirname(htmlPath);
    try {
      Deno.mkdirSync(htmlDir, { recursive: true });
    } catch {
      // Directory exists
    }
    Deno.writeTextFileSync(htmlPath, staticHtml);

    console.log(`OK ${post.slug}.html${isNotebook ? " (notebook)" : ""}`);
  });

  console.log(`\nDone! Files in: ${OUTPUT_DIR}/`);
}

// Run if called directly
if (import.meta.main) {
  main();
}
