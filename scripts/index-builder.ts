#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net
/**
 * Vector Search Index Builder
 *
 * Builds a Voy search index from Markdown blog posts.
 * Uses OpenAI text-embedding-3-small (512 dimensions) for embeddings.
 *
 * Usage: OPENAI_API_KEY=sk-xxx deno task build:search
 */

import { join, dirname, basename, relative } from "@std/path";
import { crypto } from "@std/crypto";
import { encodeHex } from "jsr:@std/encoding@^1/hex";
import { Voy } from "npm:voy-search@0.6.3/voy_search.js";
import { getConfig, getPostsDir, getProjectRoot, getCacheDir } from "./config.ts";

const config = getConfig();
const PROJECT_ROOT = getProjectRoot();
const POSTS_DIR = getPostsDir();

// Configuration from config file
const CONFIG = {
  postsDir: POSTS_DIR,
  outputFile: join(PROJECT_ROOT, "public", "search.dat"),
  metadataFile: join(PROJECT_ROOT, "public", "search-metadata.json"),
  invertedIndexFile: join(PROJECT_ROOT, "public", "search-inverted.json"),
  embeddingCacheFile: join(getCacheDir(), "embeddings.json"),
  chunkSize: config.build.search.chunkSize,
  chunkOverlap: config.build.search.chunkOverlap,
  dimensions: config.build.search.dimensions,
  model: config.build.search.model,
  batchSize: config.build.search.batchSize,
};

// Check if file exists
function existsSync(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

// Note: vector search feature check moved to buildIndex() function

// ============================================================
// CACHING UTILITIES
// ============================================================

interface EmbeddingCache {
  [chunkId: string]: { hash: string; embedding: number[] };
}

/**
 * Compute MD5 hash for content
 */
async function contentHash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("MD5", data);
  return encodeHex(new Uint8Array(hashBuffer));
}

/**
 * Load embedding cache
 * Format: { [chunkId]: { hash, embedding } }
 */
function loadEmbeddingCache(): EmbeddingCache {
  try {
    if (existsSync(CONFIG.embeddingCacheFile)) {
      return JSON.parse(Deno.readTextFileSync(CONFIG.embeddingCacheFile));
    }
  } catch (err) {
    console.warn("  Warning: Could not load embedding cache:", (err as Error).message);
  }
  return {};
}

/**
 * Save embedding cache
 */
function saveEmbeddingCache(cache: EmbeddingCache): void {
  const cacheDir = dirname(CONFIG.embeddingCacheFile);
  if (!existsSync(cacheDir)) {
    Deno.mkdirSync(cacheDir, { recursive: true });
  }
  Deno.writeTextFileSync(CONFIG.embeddingCacheFile, JSON.stringify(cache));
}

// ============================================================
// INVERTED INDEX UTILITIES
// ============================================================

// Stopwords for Chinese and English
const STOPWORDS = new Set([
  // English
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
  "be", "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "can", "this", "that", "these", "those",
  "i", "you", "he", "she", "it", "we", "they", "what", "which", "who",
  "when", "where", "why", "how", "all", "each", "every", "both", "few",
  "more", "most", "other", "some", "such", "no", "not", "only", "same",
  "so", "than", "too", "very", "just", "also", "now", "here", "there",
  // Chinese
  "的", "了", "是", "在", "我", "有", "和", "就", "不", "人", "都", "一",
  "个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有",
  "看", "好", "自己", "这", "那", "她", "他", "它", "们", "么", "与", "及",
]);

/**
 * Tokenize text into terms (supports Chinese and English)
 */
function tokenize(text: string): string[] {
  if (!text) return [];

  // Normalize: lowercase, remove extra spaces
  const normalized = text.toLowerCase().trim();

  // Split by whitespace and punctuation, keeping Chinese characters together
  const tokens = normalized.match(/[\u4e00-\u9fff]+|[a-z0-9]+/g) || [];

  // For Chinese text, split into individual characters and bigrams
  const result: string[] = [];
  for (const token of tokens) {
    if (/[\u4e00-\u9fff]/.test(token)) {
      // Chinese: add individual chars and bigrams
      for (let i = 0; i < token.length; i++) {
        result.push(token[i]);
        if (i < token.length - 1) {
          result.push(token.slice(i, i + 2)); // bigram
        }
      }
    } else if (token.length >= 2) {
      // English: only add tokens with 2+ chars
      result.push(token);
    }
  }

  // Filter stopwords and short tokens
  return result.filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

interface Document {
  id: string;
  title: string;
  url: string;
  date: string;
  tags: string;
  text: string;
  embeddingText: string;
}

interface InvertedIndex {
  index: Record<string, { id: string; tf: number }[]>;
  docLengths: Record<string, number>;
  avgDocLength: number;
  docCount: number;
}

/**
 * Build inverted index from documents
 */
function buildInvertedIndex(documents: Document[]): InvertedIndex {
  const index: Record<string, { id: string; tf: number }[]> = {};
  const docLengths: Record<string, number> = {};
  let totalLength = 0;

  // Group chunks by URL (article level)
  const articleMap = new Map<string, {
    id: string;
    title: string;
    url: string;
    date: string;
    tags: string;
    chunks: string[];
  }>();

  for (const doc of documents) {
    if (!articleMap.has(doc.url)) {
      articleMap.set(doc.url, {
        id: doc.url,
        title: doc.title,
        url: doc.url,
        date: doc.date,
        tags: doc.tags || "",
        chunks: [],
      });
    }
    articleMap.get(doc.url)!.chunks.push(doc.text);
  }

  // Process each article
  for (const [url, article] of articleMap) {
    // Combine all chunks + title + tags for indexing
    const fullText = article.title + " " + article.tags + " " + article.chunks.join(" ");
    const tokens = tokenize(fullText);

    // Count term frequencies
    const termFreq: Record<string, number> = {};
    for (const token of tokens) {
      termFreq[token] = (termFreq[token] || 0) + 1;
    }

    // Update inverted index
    for (const [term, freq] of Object.entries(termFreq)) {
      if (!index[term]) {
        index[term] = [];
      }
      index[term].push({
        id: url,
        tf: freq,
      });
    }

    docLengths[url] = tokens.length;
    totalLength += tokens.length;
  }

  const avgDocLength = totalLength / articleMap.size;

  return {
    index,
    docLengths,
    avgDocLength,
    docCount: articleMap.size,
  };
}

interface ParsedPost {
  title: string;
  url: string;
  date: string;
  tags: string[];
  description: string;
  content: string;
}

// Extract frontmatter and content from Markdown
function parseMarkdown(content: string, filePath: string): ParsedPost | null {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!frontmatterMatch) {
    return null;
  }

  const frontmatter = frontmatterMatch[1];
  const body = frontmatterMatch[2];

  // Parse YAML frontmatter (simple parser)
  const meta: Record<string, string | string[]> = {};
  frontmatter.split("\n").forEach((line) => {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      let value: string | string[] = match[2].trim();
      // Handle arrays like [tag1, tag2]
      if (value.startsWith("[") && value.endsWith("]")) {
        value = value.slice(1, -1).split(",").map((s) => s.trim());
      }
      meta[match[1]] = value;
    }
  });

  // Extract title from first H1
  const titleMatch = body.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : basename(filePath, ".md");

  // Generate URL from file path: content/posts/2026/foo.md -> /content/posts/2026/foo
  const relativePath = relative(PROJECT_ROOT, filePath);
  const url = "/" + relativePath.replace(/\.md$/, "");

  // Clean content: remove code blocks, images, links
  const cleanContent = body
    .replace(/```[\s\S]*?```/g, "") // Remove code blocks
    .replace(/!\[.*?\]\(.*?\)/g, "") // Remove images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Keep link text
    .replace(/^#+\s+/gm, "") // Remove heading markers
    .replace(/\|.*\|/g, "") // Remove table rows
    .replace(/[-*_]{3,}/g, "") // Remove horizontal rules
    .replace(/\n{3,}/g, "\n\n") // Normalize newlines
    .trim();

  return {
    title,
    url,
    date: (meta.date as string) || "",
    tags: (meta.tags as string[]) || [],
    description: (meta.description as string) || "",
    content: cleanContent,
  };
}

// Split content into overlapping chunks
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    let chunk = text.slice(start, end);

    // Try to break at sentence boundary
    if (end < text.length) {
      const lastPeriod = chunk.lastIndexOf(".");
      const lastNewline = chunk.lastIndexOf("\n");
      const breakPoint = Math.max(lastPeriod, lastNewline);
      if (breakPoint > chunkSize * 0.5) {
        chunk = chunk.slice(0, breakPoint + 1);
      }
    }

    chunks.push(chunk.trim());
    start += chunk.length - overlap;

    if (start >= text.length - overlap) break;
  }

  return chunks.filter((c) => c.length > 50); // Filter tiny chunks
}

// Call OpenAI Embeddings API
async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CONFIG.model,
      input: texts,
      dimensions: CONFIG.dimensions,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.data.map((item: { embedding: number[] }) => item.embedding);
}

// Process embeddings in batches
async function batchGetEmbeddings(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += CONFIG.batchSize) {
    const batch = texts.slice(i, i + CONFIG.batchSize);
    console.log(
      `  Embedding batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(texts.length / CONFIG.batchSize)}...`
    );

    const embeddings = await getEmbeddings(batch);
    results.push(...embeddings);

    // Rate limit: 3000 RPM = 50/sec, be conservative
    if (i + CONFIG.batchSize < texts.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return results;
}

// Recursively find all Markdown and Notebook files
function findPostFiles(dir: string): string[] {
  const files: string[] = [];

  if (!existsSync(dir)) {
    return files;
  }

  for (const entry of Deno.readDirSync(dir)) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory) {
      files.push(...findPostFiles(fullPath));
    } else if (entry.name.endsWith(".md") || entry.name.endsWith(".ipynb")) {
      files.push(fullPath);
    }
  }

  return files;
}

// Parse Jupyter Notebook and extract content
function parseNotebook(content: string, filePath: string): ParsedPost | null {
  try {
    const notebook = JSON.parse(content);
    const cells = notebook.cells || [];

    let frontmatter: Record<string, string | string[]> = {};
    let title = "";
    const textContent: string[] = [];

    for (const cell of cells) {
      const source = Array.isArray(cell.source) ? cell.source.join("") : cell.source;

      if (cell.cell_type === "markdown") {
        // Check for YAML frontmatter in first markdown cell
        if (Object.keys(frontmatter).length === 0 && source.startsWith("---\n")) {
          const fmMatch = source.match(/^---\n([\s\S]*?)\n---/);
          if (fmMatch) {
            const yamlLines = fmMatch[1].split("\n");
            for (const line of yamlLines) {
              const colonIndex = line.indexOf(":");
              if (colonIndex === -1) continue;
              const key = line.slice(0, colonIndex).trim();
              const rawValue = line.slice(colonIndex + 1).trim();
              let value: string | string[] = rawValue;
              if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
                value = rawValue.slice(1, -1).split(",").map((s: string) => s.trim().replace(/['"]/g, ""));
              }
              frontmatter[key] = value;
            }
            // Get content after frontmatter
            const afterFm = source.slice(fmMatch[0].length).trim();
            if (afterFm) textContent.push(afterFm);
            continue;
          }
        }

        // Extract title from first # heading
        if (!title) {
          const titleMatch = source.match(/^#\s+(.+)$/m);
          if (titleMatch) title = titleMatch[1].trim();
        }

        textContent.push(source);
      } else if (cell.cell_type === "code") {
        // Include code for search (but not outputs)
        textContent.push(source);
      }
    }

    if (!title) {
      title = basename(filePath, ".ipynb");
    }

    // Generate URL from file path
    const relativePath = relative(PROJECT_ROOT, filePath);
    const url = "/" + relativePath.replace(/\.ipynb$/, "");

    // Clean content: remove markdown formatting
    const cleanContent = textContent
      .join("\n\n")
      .replace(/```[\s\S]*?```/g, "") // Remove code blocks in markdown
      .replace(/!\[.*?\]\(.*?\)/g, "") // Remove images
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Keep link text
      .replace(/^#+\s+/gm, "") // Remove heading markers
      .trim();

    // Get date: frontmatter > file creation time
    let postDate = (frontmatter.date as string) || "";
    if (!postDate) {
      const stats = Deno.statSync(filePath);
      const birthtime = stats.birthtime || stats.mtime || new Date();
      const year = birthtime.getFullYear();
      const month = String(birthtime.getMonth() + 1).padStart(2, "0");
      const day = String(birthtime.getDate()).padStart(2, "0");
      postDate = `${year}-${month}-${day}`;
    }

    return {
      title,
      url,
      date: postDate,
      tags: (frontmatter.tags as string[]) || [],
      description: (frontmatter.description as string) || "",
      content: cleanContent,
    };
  } catch (err) {
    console.log(`  Error parsing notebook ${filePath}: ${(err as Error).message}`);
    return null;
  }
}

// Main build process
async function buildIndex() {
  // Skip if vector search is disabled
  if (!config.features.vectorSearch) {
    console.log("Vector search is disabled in config. Skipping.");
    return;
  }

  console.log("=== Building Vector Search Index ===\n");
  console.log(`Posts directory: ${CONFIG.postsDir}`);
  console.log(`Chunk size: ${CONFIG.chunkSize}, Overlap: ${CONFIG.chunkOverlap}`);
  console.log(`Model: ${CONFIG.model}, Dimensions: ${CONFIG.dimensions}`);
  console.log("");

  // 1. Find all posts (markdown and notebooks)
  const postFiles = findPostFiles(CONFIG.postsDir);
  const mdCount = postFiles.filter((f) => f.endsWith(".md")).length;
  const nbCount = postFiles.filter((f) => f.endsWith(".ipynb")).length;
  console.log(`Found ${mdCount} Markdown files, ${nbCount} Notebook files\n`);

  if (postFiles.length === 0) {
    console.log("No posts found. Skipping index generation.");
    return;
  }

  // 2. Parse and chunk all posts
  const documents: Document[] = [];

  for (const file of postFiles) {
    const content = Deno.readTextFileSync(file);
    const isNotebook = file.endsWith(".ipynb");

    let parsed: ParsedPost | null;
    if (isNotebook) {
      parsed = parseNotebook(content, file);
    } else {
      parsed = parseMarkdown(content, file);
    }

    if (!parsed) {
      console.log(`  Skip: ${basename(file)} (no frontmatter)`);
      continue;
    }

    // Create chunks with metadata
    const chunks = chunkText(parsed.content, CONFIG.chunkSize, CONFIG.chunkOverlap);
    const tagsText = Array.isArray(parsed.tags) ? parsed.tags.join(" ") : "";

    chunks.forEach((chunk, idx) => {
      documents.push({
        id: `${parsed!.url}#${idx}`,
        title: parsed!.title,
        url: parsed!.url,
        date: parsed!.date,
        tags: tagsText, // Include tags for inverted index
        text: chunk,
        // Prepend title for better semantic matching
        embeddingText: `${parsed!.title}. ${chunk}`,
      });
    });

    const suffix = isNotebook ? " (notebook)" : "";
    console.log(`  OK ${parsed.title} (${chunks.length} chunks)${suffix}`);
  }

  console.log(`\nTotal: ${documents.length} chunks\n`);

  // 3. Get embeddings with caching
  console.log("Loading embedding cache...");
  const cache = loadEmbeddingCache();
  const embeddings: (number[] | null)[] = [];
  const toEmbed: { index: number; text: string; hash: string; id: string }[] = [];
  let cacheHits = 0;

  // Check cache for each document
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const hash = await contentHash(doc.embeddingText);

    if (cache[doc.id] && cache[doc.id].hash === hash) {
      // Cache hit
      embeddings[i] = cache[doc.id].embedding;
      cacheHits++;
    } else {
      // Need to embed
      toEmbed.push({ index: i, text: doc.embeddingText, hash, id: doc.id });
      embeddings[i] = null;
    }
  }

  console.log(`  Cache hits: ${cacheHits}/${documents.length}`);

  // Generate embeddings only for new/changed chunks
  if (toEmbed.length > 0) {
    console.log(`  Generating ${toEmbed.length} new embeddings...`);
    const newEmbeddings = await batchGetEmbeddings(toEmbed.map((t) => t.text));

    // Update embeddings array and cache
    for (let i = 0; i < toEmbed.length; i++) {
      const { index, hash, id } = toEmbed[i];
      embeddings[index] = newEmbeddings[i];
      cache[id] = { hash, embedding: newEmbeddings[i] };
    }

    // Clean up stale cache entries
    const currentIds = new Set(documents.map((d) => d.id));
    let removed = 0;
    for (const id of Object.keys(cache)) {
      if (!currentIds.has(id)) {
        delete cache[id];
        removed++;
      }
    }
    if (removed > 0) {
      console.log(`  Removed ${removed} stale cache entries`);
    }

    // Save updated cache
    saveEmbeddingCache(cache);
    console.log(`  Cache saved: ${Object.keys(cache).length} entries`);
  } else {
    console.log("  All embeddings from cache, no API calls needed");
  }

  // 4. Build Voy index
  console.log("\nBuilding Voy index...");

  const resource = {
    embeddings: documents.map((doc, i) => ({
      id: doc.id,
      title: doc.title,
      url: doc.url,
      date: doc.date,
      text: doc.text.slice(0, 200), // Store preview text
      embeddings: embeddings[i]!,
    })),
  };

  const index = new Voy(resource);
  const serialized = index.serialize();

  // 5. Write Voy index
  const outputDir = dirname(CONFIG.outputFile);
  if (!existsSync(outputDir)) {
    Deno.mkdirSync(outputDir, { recursive: true });
  }

  Deno.writeTextFileSync(CONFIG.outputFile, serialized);

  // 6. Write metadata JSON (for frontend rendering)
  const metadata: Record<string, { title: string; url: string; date: string; text: string }> = {};
  documents.forEach((doc) => {
    metadata[doc.id] = {
      title: doc.title,
      url: doc.url,
      date: doc.date,
      text: doc.text.slice(0, 150), // Preview text
    };
  });

  Deno.writeTextFileSync(CONFIG.metadataFile, JSON.stringify(metadata, null, 2));

  // 7. Build and write inverted index for keyword search
  console.log("Building inverted index...");
  const invertedIndex = buildInvertedIndex(documents);

  // Compress the inverted index for smaller file size
  const invertedData = {
    v: 1, // version
    avgDL: invertedIndex.avgDocLength,
    N: invertedIndex.docCount,
    dl: invertedIndex.docLengths,
    idx: invertedIndex.index,
  };

  Deno.writeTextFileSync(CONFIG.invertedIndexFile, JSON.stringify(invertedData));

  const stats = Deno.statSync(CONFIG.outputFile);
  const metaStats = Deno.statSync(CONFIG.metadataFile);
  const invertedStats = Deno.statSync(CONFIG.invertedIndexFile);
  console.log(`\nOK Vector index saved: ${CONFIG.outputFile}`);
  console.log(`  Size: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`OK Metadata saved: ${CONFIG.metadataFile}`);
  console.log(`  Size: ${(metaStats.size / 1024).toFixed(1)} KB`);
  console.log(`OK Inverted index saved: ${CONFIG.invertedIndexFile}`);
  console.log(`  Size: ${(invertedStats.size / 1024).toFixed(1)} KB`);
  console.log(`  Terms: ${Object.keys(invertedIndex.index).length}`);
  console.log(`  Documents: ${documents.length} chunks, ${invertedIndex.docCount} articles`);
  console.log(`  Dimensions: ${CONFIG.dimensions}`);
}

// Export main function
export async function main() {
  await buildIndex();
}

// Run if called directly
if (import.meta.main) {
  buildIndex().catch((err) => {
    console.error("\nError:", err.message);
    Deno.exit(1);
  });
}
