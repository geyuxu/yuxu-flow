#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * Generate photos.json from folder structure
 *
 * Expected structure:
 *   photos/YYYY/YYYYMMDD-Location/image.jpg
 *
 * Example:
 *   photos/2026/20260120-Leeds/A7C00281.JPG
 *   -> { year: 2026, date: "2026-01-20", location: "Leeds", images: [...] }
 *
 * Run: deno task build:photos
 */

import { join, dirname, extname } from "@std/path";

const __dirname = dirname(import.meta.filename!);
const PHOTOS_DIR = join(__dirname, "..", "photos");
const OUTPUT_FILE = join(__dirname, "photos.json");

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
        console.log(`⚠ Skip: ${year}/${event} (invalid folder name format)`);
        continue;
      }

      // Find images
      const images = Array.from(Deno.readDirSync(eventPath))
        .filter((e) => e.isFile && isImage(e.name))
        .map((e) => e.name)
        .sort()
        .map((img) => `/photos/${year}/${event}/${img}`);

      if (images.length === 0) {
        console.log(`⚠ Skip: ${year}/${event} (no images found)`);
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

      console.log(`✓ ${year}/${event} (${images.length} images)`);
    }
  }

  // Write photos.json
  Deno.writeTextFileSync(OUTPUT_FILE, JSON.stringify(photos, null, 2) + "\n");
  const totalImages = photos.reduce((sum, p) => sum + p.images.length, 0);
  console.log(
    `\nGenerated: photos.json (${photos.length} albums, ${totalImages} images)`
  );
}

main();
