#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env
/**
 * Generate posts.json from markdown files
 *
 * Scans content/posts/ for markdown files with YAML frontmatter:
 *
 * ---
 * date: 2026-01-26
 * tags: [python, backend]
 * description: Optional description
 * ---
 * # Title from first heading
 *
 * Run: deno task build:posts
 */

import { join, dirname, basename, extname, relative } from "@std/path";
import { getConfig, getPostsDir, getProjectRoot } from "./config.ts";

const config = getConfig();
const POSTS_DIR = getPostsDir();
const PROJECT_ROOT = getProjectRoot();
const OUTPUT_FILE = join(PROJECT_ROOT, "blog", "posts.json");

interface Frontmatter {
  date?: string;
  tags?: string[];
  description?: string;
  [key: string]: unknown;
}

interface ParsedContent {
  frontmatter: Frontmatter;
  body: string;
}

interface Post {
  slug: string;
  title: string;
  date: string;
  type: string;
  ext: string;
  tags?: string[];
  description?: string;
  pdfPreview?: boolean;
}

// Parse YAML frontmatter (simple parser, handles basic cases)
function parseFrontmatter(content: string): ParsedContent {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const frontmatter: Frontmatter = {};
  const yamlLines = match[1].split("\n");

  for (const line of yamlLines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const rawValue = line.slice(colonIndex + 1).trim();
    let value: string | string[] = rawValue;

    // Parse arrays: [item1, item2]
    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      value = rawValue
        .slice(1, -1)
        .split(",")
        .map((s: string) => s.trim().replace(/['"]/g, ""));
    }
    // Remove quotes from strings
    else if (
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
    ) {
      value = rawValue.slice(1, -1);
    }

    frontmatter[key] = value;
  }

  return { frontmatter, body: match[2] };
}

// Extract title from first # heading
function extractTitle(body: string): string {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "Untitled";
}

// Supported file extensions
const SUPPORTED_EXTENSIONS = [
  ".md",
  ".ipynb",
  ".pdf",
  ".docx",
  ".txt",
  ".xlsx",
  ".pptx",
  ".csv",
  // Images
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  // Video
  ".mp4",
  ".webm",
  // Audio
  ".mp3",
  ".wav",
  ".ogg",
  // Code & Data
  ".json",
  ".html",
  ".xml",
  ".yaml",
  ".yml",
  ".py",
  ".js",
  ".ts",
  ".go",
  ".java",
  ".rs",
  ".cpp",
  ".c",
  ".h",
  ".hpp",
  ".rb",
  ".php",
  ".sh",
  ".bash",
  ".zsh",
  // LaTeX & RTF
  ".tex",
  ".rtf",
  // OpenDocument
  ".odt",
  ".ods",
  ".odp",
];

// Extensions that can be converted to PDF for preview
const PDF_CONVERTIBLE = [".pptx", ".rtf", ".tex", ".odt", ".ods", ".odp"];

// Check if file exists
function existsSync(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

// Recursively find all supported files
function findPostFiles(dir: string, files: string[] = []): string[] {
  let entries: Iterable<Deno.DirEntry>;
  try {
    entries = Deno.readDirSync(dir);
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory) {
      findPostFiles(fullPath, files);
    } else if (
      SUPPORTED_EXTENSIONS.some((ext) => entry.name.endsWith(ext)) &&
      !entry.name.endsWith(".meta.json")
    ) {
      const ext = extname(entry.name).toLowerCase();
      // Skip PDF if a source file exists (source file will be listed with pdfPreview flag)
      if (ext === ".pdf") {
        const hasSource = PDF_CONVERTIBLE.some((srcExt) => {
          const srcPath = fullPath.replace(/\.pdf$/i, srcExt);
          return existsSync(srcPath);
        });
        if (hasSource) {
          continue; // Skip PDF, source file will be listed instead
        }
      }
      files.push(fullPath);
    }
  }

  return files;
}

// Extract date from filename if format is yyyyMMdd-name.ext
// Returns { date: 'YYYY-MM-DD', name: 'name' } or null
function parseDateFromFilename(
  filename: string
): { date: string; name: string } | null {
  const match = filename.match(/^(\d{4})(\d{2})(\d{2})-(.+)$/);
  if (match) {
    const [, year, month, day, name] = match;
    // Validate date
    const dateStr = `${year}-${month}-${day}`;
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return { date: dateStr, name };
    }
  }
  return null;
}

// Get file type from extension
function getFileType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const typeMap: Record<string, string> = {
    ".md": "markdown",
    ".ipynb": "notebook",
    ".pdf": "pdf",
    ".docx": "word",
    ".txt": "text",
    ".xlsx": "excel",
    ".pptx": "powerpoint",
    ".csv": "csv",
    // Images
    ".jpg": "image",
    ".jpeg": "image",
    ".png": "image",
    ".gif": "image",
    ".webp": "image",
    ".svg": "image",
    // Video
    ".mp4": "video",
    ".webm": "video",
    // Audio
    ".mp3": "audio",
    ".wav": "audio",
    ".ogg": "audio",
    // Code & Data
    ".json": "json",
    ".html": "html",
    ".xml": "xml",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".py": "code",
    ".js": "code",
    ".ts": "code",
    ".go": "code",
    ".java": "code",
    ".rs": "code",
    ".cpp": "code",
    ".c": "code",
    ".h": "code",
    ".hpp": "code",
    ".rb": "code",
    ".php": "code",
    ".sh": "code",
    ".bash": "code",
    ".zsh": "code",
    // LaTeX & RTF
    ".tex": "latex",
    ".rtf": "rtf",
    // OpenDocument
    ".odt": "opendocument-text",
    ".ods": "opendocument-spreadsheet",
    ".odp": "opendocument-presentation",
  };
  return typeMap[ext] || "unknown";
}

interface NotebookParsed {
  frontmatter: Frontmatter;
  title: string;
}

// Parse Jupyter notebook metadata
function parseNotebook(content: string, filePath: string): NotebookParsed | null {
  try {
    const notebook = JSON.parse(content);
    const cells = notebook.cells || [];

    // Find metadata in first markdown cell (looking for YAML frontmatter)
    let frontmatter: Frontmatter = {};
    let titleCell: string | null = null;

    for (const cell of cells) {
      if (cell.cell_type === "markdown") {
        const source = Array.isArray(cell.source)
          ? cell.source.join("")
          : cell.source;

        // Check for YAML frontmatter (---\n...\n---)
        const fmMatch = source.match(/^---\n([\s\S]*?)\n---/);
        if (fmMatch && Object.keys(frontmatter).length === 0) {
          const yamlLines = fmMatch[1].split("\n");
          for (const line of yamlLines) {
            const colonIndex = line.indexOf(":");
            if (colonIndex === -1) continue;
            const key = line.slice(0, colonIndex).trim();
            const rawValue = line.slice(colonIndex + 1).trim();
            let value: string | string[] = rawValue;
            // Parse arrays
            if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
              value = rawValue
                .slice(1, -1)
                .split(",")
                .map((s: string) => s.trim().replace(/['"]/g, ""));
            } else if (
              (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
              (rawValue.startsWith("'") && rawValue.endsWith("'"))
            ) {
              value = rawValue.slice(1, -1);
            }
            frontmatter[key] = value;
          }
        }

        // Find first # heading for title
        if (!titleCell) {
          const titleMatch = source.match(/^#\s+(.+)$/m);
          if (titleMatch) {
            titleCell = titleMatch[1].trim();
          }
        }
      }
    }

    return {
      frontmatter,
      title: titleCell || basename(filePath, ".ipynb"),
    };
  } catch (err) {
    console.log(
      `Warning: Error parsing notebook ${filePath}: ${(err as Error).message}`
    );
    return null;
  }
}

// Get file creation date (birthtime) formatted as YYYY-MM-DD
function getFileCreationDate(filePath: string): string {
  const stats = Deno.statSync(filePath);
  const birthtime = stats.birthtime || stats.mtime || new Date();
  const year = birthtime.getFullYear();
  const month = String(birthtime.getMonth() + 1).padStart(2, "0");
  const day = String(birthtime.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface Meta {
  title?: string;
  date?: string;
  description?: string;
  tags?: string[];
}

// Get or create meta.json for non-markdown files
// Returns { title, date, description, tags? } or null
function getOrCreateMeta(
  filePath: string,
  defaultTitle: string,
  defaultDate: string
): Meta | null {
  const ext = extname(filePath);
  const metaPath = filePath.replace(new RegExp(`\\${ext}$`), ".meta.json");

  if (existsSync(metaPath)) {
    // Read existing meta.json
    try {
      const meta = JSON.parse(Deno.readTextFileSync(metaPath)) as Meta;
      console.log(`  (using ${basename(metaPath)})`);
      return meta;
    } catch (err) {
      console.log(`  Warning: Error reading ${metaPath}: ${(err as Error).message}`);
      return null;
    }
  } else {
    // Create new meta.json
    const meta: Meta = {
      title: defaultTitle,
      date: defaultDate,
      description: "",
    };
    try {
      Deno.writeTextFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
      console.log(`  (created ${basename(metaPath)})`);
      return meta;
    } catch (err) {
      console.log(`  Warning: Error creating ${metaPath}: ${(err as Error).message}`);
      return null;
    }
  }
}

// Main
function main() {
  console.log(`Posts directory: ${POSTS_DIR}`);
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log("");

  if (!existsSync(POSTS_DIR)) {
    console.log("No posts directory found");
    // Ensure output directory exists
    const outputDir = dirname(OUTPUT_FILE);
    if (!existsSync(outputDir)) {
      Deno.mkdirSync(outputDir, { recursive: true });
    }
    Deno.writeTextFileSync(OUTPUT_FILE, "[]\n");
    return;
  }

  const postFiles = findPostFiles(POSTS_DIR);
  const posts: Post[] = [];

  for (const filePath of postFiles) {
    const fileType = getFileType(filePath);
    const ext = extname(filePath);
    const baseName = basename(filePath, ext);

    let frontmatter: Frontmatter = {};
    let title: string;
    let postDate: string | undefined;

    // Try to extract date from filename (yyyyMMdd-name format)
    const filenameParsed = parseDateFromFilename(baseName);

    if (fileType === "markdown") {
      // Parse Markdown with frontmatter
      const content = Deno.readTextFileSync(filePath);
      const parsed = parseFrontmatter(content);
      frontmatter = parsed.frontmatter;
      title = extractTitle(parsed.body);

      postDate = frontmatter.date as string | undefined;
      if (!postDate) {
        console.log(`Warning: Skip: ${baseName} (no date in frontmatter)`);
        continue;
      }
    } else if (fileType === "notebook") {
      // Parse Jupyter notebook for internal frontmatter first
      const content = Deno.readTextFileSync(filePath);
      const parsed = parseNotebook(content, filePath);
      if (!parsed) continue;

      // Default values from notebook content
      let defaultTitle = parsed.title;
      let defaultDate = parsed.frontmatter.date as string | undefined;

      if (!defaultDate && filenameParsed) {
        defaultDate = filenameParsed.date;
      }
      if (!defaultDate) {
        defaultDate = getFileCreationDate(filePath);
      }

      // Check/create meta.json - it takes precedence over internal frontmatter
      const meta = getOrCreateMeta(filePath, defaultTitle, defaultDate);
      if (meta) {
        title = meta.title || defaultTitle;
        postDate = meta.date || defaultDate;
        if (meta.description) frontmatter.description = meta.description;
        if (meta.tags) frontmatter.tags = meta.tags;
      } else {
        title = defaultTitle;
        postDate = defaultDate;
        frontmatter = parsed.frontmatter;
      }
    } else {
      // PDF, Word, TXT, etc. - use meta.json for metadata
      // Determine default values first
      let defaultTitle: string;
      let defaultDate: string;

      if (filenameParsed) {
        defaultDate = filenameParsed.date;
        defaultTitle = filenameParsed.name.replace(/-/g, " ");
      } else {
        defaultDate = getFileCreationDate(filePath);
        defaultTitle = baseName.replace(/-/g, " ");
      }

      // Check/create meta.json
      const meta = getOrCreateMeta(filePath, defaultTitle, defaultDate);
      if (meta) {
        title = meta.title || defaultTitle;
        postDate = meta.date || defaultDate;
        if (meta.description) frontmatter.description = meta.description;
        if (meta.tags) frontmatter.tags = meta.tags;
      } else {
        title = defaultTitle;
        postDate = defaultDate;
      }
    }

    // Generate slug from path relative to posts directory
    const relativePath = relative(POSTS_DIR, filePath);
    const slug = "posts/" + relativePath.replace(/\.[^.]+$/, "");

    const post: Post = {
      slug,
      title,
      date: postDate!,
      type: fileType,
      ext: ext.slice(1), // Store extension without dot for code files
    };

    // Check if this source file has a corresponding PDF (for preview with dual download)
    if (PDF_CONVERTIBLE.includes(ext)) {
      const pdfPath = filePath.replace(new RegExp(`\\${ext}$`, "i"), ".pdf");
      if (existsSync(pdfPath)) {
        post.pdfPreview = true; // Flag to indicate PDF is available for preview
        console.log(`  (${fileType} with PDF preview)`);
      }
    }

    // Optional fields from frontmatter
    if (frontmatter.tags) {
      post.tags = frontmatter.tags as string[];
    }
    if (frontmatter.description) {
      post.description = frontmatter.description as string;
    }

    posts.push(post);
    const typeLabel = fileType !== "markdown" ? ` (${fileType})` : "";
    console.log(`OK ${slug}${typeLabel}`);
  }

  // Sort by date descending
  posts.sort((a, b) => b.date.localeCompare(a.date));

  // Ensure output directory exists
  const outputDir = dirname(OUTPUT_FILE);
  if (!existsSync(outputDir)) {
    Deno.mkdirSync(outputDir, { recursive: true });
  }

  // Write posts.json
  Deno.writeTextFileSync(OUTPUT_FILE, JSON.stringify(posts, null, 2) + "\n");
  console.log(`\nGenerated: ${OUTPUT_FILE} (${posts.length} posts)`);
}

// Export main function
export { main };

// Run if called directly
if (import.meta.main) {
  main();
}
