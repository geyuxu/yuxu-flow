#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env
/**
 * Compress photos for web
 * Requires: ImageMagick (brew install imagemagick)
 *
 * Usage:
 *   deno task compress:photos
 *   deno task compress:photos --dry-run
 *   deno task compress:photos --force
 */

import { join, basename } from "@std/path";
import { walk } from "@std/fs/walk";
import { getConfig, getPhotosDir, getCacheDir } from "./config.ts";

const config = getConfig();
const PHOTOS_DIR = getPhotosDir();
const CACHE_FILE = join(PHOTOS_DIR, ".compress-cache");
const MAX_WIDTH = config.build.maxImageWidth;
const QUALITY = config.build.imageQuality;

// Check if file exists
function existsSync(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

// Parse command line arguments
const args = Deno.args;
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");

if (DRY_RUN) {
  console.log("=== DRY RUN MODE ===");
} else if (FORCE) {
  console.log("=== FORCE MODE (ignoring cache) ===");
}

// Note: image compression feature check moved to main() function

// Find ImageMagick command
function findImageMagick(): string | null {
  const commands = ["magick", "convert"];
  for (const cmd of commands) {
    try {
      const which = new Deno.Command("which", {
        args: [cmd],
        stdout: "piped",
        stderr: "piped",
      });
      const output = which.outputSync();
      if (output.success) {
        return cmd;
      }
    } catch {
      // Continue to next command
    }
  }
  return null;
}

const CONVERT = findImageMagick();
if (!CONVERT) {
  console.error("Error: ImageMagick not found. Install with: brew install imagemagick");
  Deno.exit(1);
}

// Load cache
function loadCache(): Set<string> {
  const cache = new Set<string>();
  if (!FORCE && existsSync(CACHE_FILE)) {
    try {
      const content = Deno.readTextFileSync(CACHE_FILE);
      for (const line of content.split("\n")) {
        if (line.trim()) {
          cache.add(line.trim());
        }
      }
    } catch {
      // Ignore cache read errors
    }
  }
  return cache;
}

// Save to cache
function appendToCache(path: string): void {
  if (!DRY_RUN) {
    try {
      Deno.writeTextFileSync(CACHE_FILE, path + "\n", { append: true });
    } catch {
      // Ignore cache write errors
    }
  }
}

// Get file size
function getFileSize(path: string): number {
  try {
    const stat = Deno.statSync(path);
    return stat.size;
  } catch {
    return 0;
  }
}

// Get image dimensions using ImageMagick
function getImageDimensions(path: string): { width: number; height: number } | null {
  try {
    const cmd = new Deno.Command(CONVERT!, {
      args: [path, "-format", "%wx%h", "info:"],
      stdout: "piped",
      stderr: "piped",
    });
    const output = cmd.outputSync();
    if (output.success) {
      const result = new TextDecoder().decode(output.stdout).trim();
      const [w, h] = result.split("x").map(Number);
      return { width: w, height: h };
    }
  } catch {
    // Ignore
  }
  return null;
}

// Compress a single image
function compressImage(imagePath: string, tmpPath: string): boolean {
  try {
    const cmd = new Deno.Command(CONVERT!, {
      args: [
        imagePath,
        "-auto-orient",
        "-resize", `${MAX_WIDTH}x>`,
        "-quality", String(QUALITY),
        "-strip",
        "-interlace", "Plane",
        tmpPath,
      ],
      stdout: "piped",
      stderr: "piped",
    });
    const output = cmd.outputSync();
    return output.success;
  } catch {
    return false;
  }
}

// Main
async function main() {
  // Skip if image compression is disabled
  if (!config.build.imageCompression) {
    console.log("Image compression is disabled in config. Skipping.");
    return;
  }

  console.log(`Photos directory: ${PHOTOS_DIR}`);
  console.log(`Settings: max ${MAX_WIDTH}px width, ${QUALITY}% quality`);
  console.log("");

  if (!existsSync(PHOTOS_DIR)) {
    console.log("No photos directory found");
    return;
  }

  // Ensure cache file exists
  if (!existsSync(CACHE_FILE)) {
    try {
      Deno.writeTextFileSync(CACHE_FILE, "");
    } catch {
      // Ignore
    }
  }

  const cache = loadCache();
  if (!FORCE) {
    console.log(`Loaded cache: ${cache.size} files`);
  }

  // Find all images
  const images: string[] = [];
  for await (const entry of walk(PHOTOS_DIR, {
    exts: ["jpg", "jpeg", "png", "JPG", "JPEG", "PNG"],
    includeDirs: false,
  })) {
    if (!entry.name.includes("-thumb") && !entry.name.includes("-compressed")) {
      images.push(entry.path);
    }
  }
  images.sort();

  const totalCount = images.length;

  // Filter out cached files
  const newImages = FORCE ? images : images.filter((img) => !cache.has(img));
  const newCount = newImages.length;

  console.log(`Total images: ${totalCount}, New/uncached: ${newCount}`);
  console.log("");

  if (newCount === 0) {
    console.log("No new images to process.");
    console.log("Done!");
    return;
  }

  // Process images
  for (const img of newImages) {
    const sizeBefore = getFileSize(img);
    const sizeBeforeKB = Math.floor(sizeBefore / 1024);

    const dimensions = getImageDimensions(img);
    const width = dimensions?.width || 0;

    // Skip if already small enough and well compressed
    if (width <= MAX_WIDTH && sizeBeforeKB < 500) {
      console.log(`OK Skip (optimized): ${basename(img)} (${sizeBeforeKB}KB)`);
      appendToCache(img);
      continue;
    }

    if (DRY_RUN) {
      console.log(
        `Would compress: ${basename(img)} (${sizeBeforeKB}KB, ${dimensions?.width}x${dimensions?.height})`
      );
      continue;
    }

    // Create temp file
    const tmpFile = img + ".tmp";

    // Compress
    if (!compressImage(img, tmpFile)) {
      console.log(`FAIL: ${basename(img)}`);
      continue;
    }

    // Get new size
    const sizeAfter = getFileSize(tmpFile);
    const sizeAfterKB = Math.floor(sizeAfter / 1024);

    // Only keep if smaller
    if (sizeAfter < sizeBefore) {
      try {
        Deno.renameSync(tmpFile, img);
        const saved = sizeBeforeKB - sizeAfterKB;
        console.log(
          `OK Compressed: ${basename(img)} ${sizeBeforeKB}KB -> ${sizeAfterKB}KB (-${saved}KB)`
        );
      } catch {
        Deno.removeSync(tmpFile);
        console.log(`FAIL to rename: ${basename(img)}`);
      }
    } else {
      Deno.removeSync(tmpFile);
      console.log(`OK Skip (optimal): ${basename(img)} (${sizeBeforeKB}KB)`);
    }

    // Add to cache
    appendToCache(img);
  }

  console.log("");
  console.log("Done!");
}

// Export main function
export { main };

// Run if called directly
if (import.meta.main) {
  main();
}
