#!/usr/bin/env node
/**
 * Legacy Blog Posts Migration Script
 *
 * Migrates old blog posts from __learning-notes/NOTES/topics/ to blog/posts/legacy/
 * Converts old header format to YAML frontmatter with legacy: true marker
 *
 * Usage: node scripts/migrate-legacy-posts.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
    sourceDir: path.join(__dirname, '..', '__learning-notes', 'NOTES', 'topics'),
    targetDir: path.join(__dirname, '..', 'blog', 'posts', 'legacy'),
    postsJsonPath: path.join(__dirname, '..', 'blog', 'posts.json'),
};

// Parse old header format
function parseOldFormat(content, filename) {
    const lines = content.split('\n');
    let title = '';
    let date = '';
    let tags = [];
    let description = '';
    let contentStartIndex = 0;

    for (let i = 0; i < Math.min(lines.length, 20); i++) {
        const line = lines[i];

        // Title from H1
        if (line.startsWith('# ') && !title) {
            title = line.slice(2).trim();
            contentStartIndex = i + 1;
            continue;
        }

        // Date
        if (line.toLowerCase().startsWith('last updated:')) {
            const dateStr = line.split(':').slice(1).join(':').trim();
            // Convert YYYY/MM/DD to YYYY-MM-DD
            date = dateStr.replace(/\//g, '-');
            // Ensure valid date format
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                // Try to extract date from filename
                const dateMatch = filename.match(/^(\d{8})/);
                if (dateMatch) {
                    const d = dateMatch[1];
                    date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
                } else {
                    date = '2024-01-01'; // Default date
                }
            }
            contentStartIndex = Math.max(contentStartIndex, i + 1);
            continue;
        }

        // Tags
        if (line.toLowerCase().startsWith('tags:')) {
            const tagsStr = line.split(':').slice(1).join(':').trim();
            // Parse array format ['tag1', 'tag2'] or comma separated
            if (tagsStr.startsWith('[')) {
                try {
                    tags = JSON.parse(tagsStr.replace(/'/g, '"'));
                } catch {
                    tags = tagsStr.slice(1, -1).split(',').map(t => t.trim().replace(/['"]/g, ''));
                }
            } else {
                tags = tagsStr.split(',').map(t => t.trim());
            }
            contentStartIndex = Math.max(contentStartIndex, i + 1);
            continue;
        }

        // TL;DR as description
        if (line.toLowerCase().startsWith('tl;dr:') || line.toLowerCase() === 'tl;dr:') {
            contentStartIndex = Math.max(contentStartIndex, i + 1);
            // Collect TL;DR bullet points
            const tldrLines = [];
            for (let j = i + 1; j < Math.min(lines.length, i + 10); j++) {
                if (lines[j].startsWith('- ') || lines[j].startsWith('* ')) {
                    tldrLines.push(lines[j].slice(2).trim());
                    contentStartIndex = j + 1;
                } else if (lines[j].trim() === '') {
                    continue;
                } else {
                    break;
                }
            }
            // Skip migration notes in TL;DR
            description = tldrLines
                .filter(l => !l.includes('Migrated from') && !l.includes('Original title:') && !l.includes('See notebook'))
                .join(' ');
            continue;
        }

        // Empty line after header section
        if (line.trim() === '' && contentStartIndex > 0) {
            contentStartIndex = Math.max(contentStartIndex, i + 1);
        }
    }

    // Extract date from filename if not found
    if (!date) {
        const dateMatch = filename.match(/^(\d{8})/);
        if (dateMatch) {
            const d = dateMatch[1];
            date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
        } else {
            date = '2024-01-01';
        }
    }

    // Get remaining content (skip old header)
    const remainingContent = lines.slice(contentStartIndex).join('\n').trim();

    return {
        title: title || filename.replace(/\.md$/, ''),
        date,
        tags: tags.filter(t => t && t !== 'blog'),
        description: description || '',
        content: remainingContent,
    };
}

// Generate slug from filename
function generateSlug(filename, category) {
    // Remove date prefix and extension
    let slug = filename
        .replace(/^\d{8}_?/, '')
        .replace(/\.md$/, '')
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
        .replace(/^-+|-+$/g, '');

    // If slug is too long or has Chinese, create a simpler one
    if (slug.length > 60 || /[\u4e00-\u9fff]/.test(slug)) {
        slug = slug.slice(0, 50).replace(/-+$/, '');
    }

    return slug;
}

// Build new frontmatter
function buildFrontmatter(meta) {
    const tagsStr = meta.tags.length > 0
        ? `[${meta.tags.map(t => t.toLowerCase()).join(', ')}]`
        : '[]';

    let frontmatter = `---
date: ${meta.date}
tags: ${tagsStr}
legacy: true`;

    if (meta.description) {
        frontmatter += `
description: "${meta.description.replace(/"/g, '\\"').slice(0, 200)}"`;
    }

    frontmatter += `
---

# ${meta.title}

`;

    return frontmatter;
}

// Find all markdown files recursively
function findMarkdownFiles(dir, files = []) {
    if (!fs.existsSync(dir)) return files;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            // Skip template directories
            if (entry.name.startsWith('_')) continue;
            findMarkdownFiles(fullPath, files);
        } else if (entry.name.endsWith('.md')) {
            files.push(fullPath);
        }
    }
    return files;
}

// Main migration
async function migrate() {
    console.log('=== Legacy Blog Migration ===\n');

    // Ensure target directory exists
    if (!fs.existsSync(CONFIG.targetDir)) {
        fs.mkdirSync(CONFIG.targetDir, { recursive: true });
    }

    // Find all markdown files
    const files = findMarkdownFiles(CONFIG.sourceDir);
    console.log(`Found ${files.length} markdown files\n`);

    // Load existing posts.json
    let posts = [];
    if (fs.existsSync(CONFIG.postsJsonPath)) {
        posts = JSON.parse(fs.readFileSync(CONFIG.postsJsonPath, 'utf-8'));
    }

    const existingSlugs = new Set(posts.map(p => p.slug));
    const migrated = [];
    const skipped = [];

    for (const filePath of files) {
        const filename = path.basename(filePath);
        const relativePath = path.relative(CONFIG.sourceDir, filePath);
        const category = path.dirname(relativePath).split(path.sep)[0];

        // Read file
        const content = fs.readFileSync(filePath, 'utf-8');

        // Parse old format
        const meta = parseOldFormat(content, filename);

        // Generate slug
        const slug = generateSlug(filename, category);
        const fullSlug = `posts/legacy/${slug}`;

        // Skip if already migrated
        if (existingSlugs.has(fullSlug)) {
            skipped.push({ filename, reason: 'already exists' });
            continue;
        }

        // Add category to tags if not present
        if (category && !meta.tags.includes(category)) {
            meta.tags.unshift(category);
        }

        // Build new content
        const newContent = buildFrontmatter(meta) + meta.content;

        // Write to target
        const targetPath = path.join(CONFIG.targetDir, `${slug}.md`);
        fs.writeFileSync(targetPath, newContent);

        // Add to posts.json
        posts.push({
            slug: fullSlug,
            title: meta.title,
            date: meta.date,
            tags: meta.tags.slice(0, 5), // Limit tags
            legacy: true,
        });

        migrated.push({
            from: relativePath,
            to: `legacy/${slug}.md`,
            title: meta.title,
        });

        console.log(`  ✓ ${meta.title.slice(0, 50)}...`);
    }

    // Sort posts by date (newest first)
    posts.sort((a, b) => b.date.localeCompare(a.date));

    // Write updated posts.json
    fs.writeFileSync(CONFIG.postsJsonPath, JSON.stringify(posts, null, 2) + '\n');

    console.log(`\n=== Migration Complete ===`);
    console.log(`Migrated: ${migrated.length} files`);
    console.log(`Skipped: ${skipped.length} files`);
    console.log(`Total posts: ${posts.length}`);
    console.log(`\nLegacy posts saved to: ${CONFIG.targetDir}`);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
