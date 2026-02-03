#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env
/**
 * Generate photos.json from folder structure
 *
 * Expected structure:
 *   content/photos/YYYY/YYYYMMDD-Location/image.jpg
 *
 * Example:
 *   content/photos/2026/20260120-Leeds/A7C00281.JPG
 *   -> { year: 2026, date: "2026-01-20", location: "Leeds", images: [...] }
 *
 * Run: deno task build:photos
 */

import { join, extname } from "@std/path";
import { getConfig, getPhotosDir, getProjectRoot } from "./config.ts";

const config = getConfig();
const PHOTOS_DIR = getPhotosDir();
const PROJECT_ROOT = getProjectRoot();
const OUTPUT_DIR = join(PROJECT_ROOT, config.paths.output);
const OUTPUT_FILE = join(OUTPUT_DIR, "gallery", "photos.json");

// Check if file exists
function existsSync(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

// Read description from folder (description.md or description.txt)
function readDescription(folderPath: string): string {
  const mdPath = join(folderPath, "description.md");
  const txtPath = join(folderPath, "description.txt");

  if (existsSync(mdPath)) {
    return Deno.readTextFileSync(mdPath).trim();
  }
  if (existsSync(txtPath)) {
    return Deno.readTextFileSync(txtPath).trim();
  }
  return "";
}

// Supported image extensions
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

// Parse folder name: "20260120-Leeds" -> { date: "2026-01-20", location: "Leeds" }
function parseFolderName(
  folderName: string
): { date: string; location: string } | null {
  const match = folderName.match(/^(\d{4})(\d{2})(\d{2})-(.+)$/);
  if (!match) return null;

  const [, year, month, day, location] = match;
  return {
    date: `${year}-${month}-${day}`,
    location: location
      .replace(/_/g, " ") // Convert underscores to spaces
      .replace(/ Part \d+$/i, ""), // Remove "Part N" suffix
  };
}

// Check if file is an image
function isImage(filename: string): boolean {
  const ext = extname(filename).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

interface PhotoAlbum {
  year: number;
  date: string;
  location: string;
  folder: string;
  images: string[];
  description: string;
}

// Main
function main() {
  console.log(`Photos directory: ${PHOTOS_DIR}`);
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log("");

  // Skip if gallery feature is disabled
  if (!config.features.gallery) {
    console.log("Gallery feature is disabled in config. Skipping.");
    return;
  }

  if (!existsSync(PHOTOS_DIR)) {
    console.log("No photos directory found");
    Deno.writeTextFileSync(OUTPUT_FILE, "[]\n");
    return;
  }

  const photos: PhotoAlbum[] = [];

  // Scan year directories
  const years = Array.from(Deno.readDirSync(PHOTOS_DIR))
    .filter((d) => d.isDirectory && /^\d{4}$/.test(d.name))
    .map((d) => d.name)
    .sort()
    .reverse(); // Newest first

  for (const year of years) {
    const yearPath = join(PHOTOS_DIR, year);

    // Scan event directories
    const events = Array.from(Deno.readDirSync(yearPath))
      .filter((d) => d.isDirectory)
      .map((d) => d.name)
      .sort()
      .reverse(); // Newest first

    for (const event of events) {
      const eventPath = join(yearPath, event);
      const parsed = parseFolderName(event);

      if (!parsed) {
        console.log(`Warning: Skip: ${year}/${event} (invalid folder name format)`);
        continue;
      }

      // Find images
      const images = Array.from(Deno.readDirSync(eventPath))
        .filter((e) => e.isFile && isImage(e.name))
        .map((e) => e.name)
        .sort()
        .map((img) => `/content/photos/${year}/${event}/${img}`);

      if (images.length === 0) {
        console.log(`Warning: Skip: ${year}/${event} (no images found)`);
        continue;
      }

      photos.push({
        year: parseInt(year),
        date: parsed.date,
        location: parsed.location,
        folder: event,
        images: images,
        description: readDescription(eventPath),
      });

      console.log(`OK ${year}/${event} (${images.length} images)`);
    }
  }

  // Ensure output directory exists
  const outputDir = join(PROJECT_ROOT, "gallery");
  if (!existsSync(outputDir)) {
    Deno.mkdirSync(outputDir, { recursive: true });
  }

  // Write photos.json
  Deno.writeTextFileSync(OUTPUT_FILE, JSON.stringify(photos, null, 2) + "\n");
  const totalImages = photos.reduce((sum, p) => sum + p.images.length, 0);
  console.log(
    `\nGenerated: ${OUTPUT_FILE} (${photos.length} albums, ${totalImages} images)`
  );
}

// Export main function
export { main };

// Run if called directly
if (import.meta.main) {
  main();
}
