#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run
/**
 * Convert HEIC/HIF/ARW images to JPG
 * Uses macOS sips (built-in) or ImageMagick
 * ARW (Sony RAW) requires ImageMagick with raw delegate
 *
 * Usage:
 *   deno run --allow-read --allow-write --allow-run scripts/convert-heic.ts
 *   deno run --allow-read --allow-write --allow-run scripts/convert-heic.ts --dry-run
 */

import { join, dirname, basename, extname } from "@std/path";
import { walk } from "@std/fs/walk";

const __dirname = dirname(import.meta.filename!);
const PHOTOS_DIR = join(__dirname, "..", "photos");

// Parse command line arguments
const DRY_RUN = Deno.args.includes("--dry-run");

if (DRY_RUN) {
  console.log("=== DRY RUN MODE ===");
}

// Check if file exists
function existsSync(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

// Check if command exists
function commandExists(cmd: string): boolean {
  try {
    const which = new Deno.Command("which", {
      args: [cmd],
      stdout: "piped",
      stderr: "piped",
    });
    const output = which.outputSync();
    return output.success;
  } catch {
    return false;
  }
}

// Find converter
type ConverterType = "sips" | "magick" | "convert" | null;

function findConverter(): ConverterType {
  if (commandExists("sips")) return "sips";
  if (commandExists("magick")) return "magick";
  if (commandExists("convert")) return "convert";
  return null;
}

const CONVERTER = findConverter();

if (!CONVERTER) {
  console.error("Error: No HEIC converter found. Need sips (macOS) or ImageMagick");
  Deno.exit(1);
}

console.log(`Using converter: ${CONVERTER}`);
console.log(`Scanning for HEIC/HIF/ARW files in: ${PHOTOS_DIR}`);
console.log("");

// Convert using sips (macOS)
function convertWithSips(heic: string, jpg: string): boolean {
  try {
    const cmd = new Deno.Command("sips", {
      args: ["-s", "format", "jpeg", heic, "--out", jpg],
      stdout: "null",
      stderr: "null",
    });
    const output = cmd.outputSync();
    return output.success;
  } catch {
    return false;
  }
}

// Convert using ImageMagick
function convertWithImageMagick(heic: string, jpg: string, withAutoOrient = true): boolean {
  try {
    const args = withAutoOrient
      ? [heic, "-auto-orient", "-quality", "95", jpg]
      : [heic, "-auto-orient", jpg];

    const cmd = new Deno.Command(CONVERTER!, {
      args,
      stdout: "piped",
      stderr: "piped",
    });
    const output = cmd.outputSync();
    return output.success;
  } catch {
    return false;
  }
}

// Main conversion function
function convertFile(heic: string, jpg: string): boolean {
  const ext = extname(heic).toLowerCase();
  const isARW = ext === ".arw";

  // ARW (Sony RAW) requires ImageMagick
  if (isARW) {
    if (CONVERTER === "sips") {
      // Try to use ImageMagick for ARW even if sips is preferred
      if (commandExists("magick")) {
        return convertWithImageMagick(heic, jpg, true);
      } else if (commandExists("convert")) {
        const cmd = new Deno.Command("convert", {
          args: [heic, "-auto-orient", "-quality", "95", jpg],
          stdout: "piped",
          stderr: "piped",
        });
        return cmd.outputSync().success;
      }
      console.log(`  ✗ Skip (ARW needs ImageMagick): ${basename(heic)}`);
      return false;
    }
    return convertWithImageMagick(heic, jpg, true);
  }

  // HEIC/HIF
  if (CONVERTER === "sips") {
    return convertWithSips(heic, jpg);
  }
  return convertWithImageMagick(heic, jpg);
}

// Main
async function main() {
  if (!existsSync(PHOTOS_DIR)) {
    console.log("No photos directory found");
    return;
  }

  let count = 0;

  // Find all HEIC/HIF/ARW files
  for await (const entry of walk(PHOTOS_DIR, {
    includeDirs: false,
  })) {
    const ext = extname(entry.name).toLowerCase();
    if (![".heic", ".hif", ".arw"].includes(ext)) {
      continue;
    }

    const heic = entry.path;
    const jpg = heic.replace(/\.(heic|hif|arw)$/i, ".jpg");

    // Skip if JPG already exists
    if (existsSync(jpg)) {
      console.log(`✓ Skip (JPG exists): ${basename(heic)}`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`Would convert: ${basename(heic)} → ${basename(jpg)}`);
      continue;
    }

    console.log(`Converting: ${basename(heic)}`);

    if (convertFile(heic, jpg)) {
      // Remove original HEIC after successful conversion
      if (existsSync(jpg)) {
        try {
          Deno.removeSync(heic);
          console.log(`✓ Converted: ${basename(heic)} → ${basename(jpg)}`);
          count++;
        } catch {
          console.log(`✗ Failed to remove original: ${basename(heic)}`);
        }
      } else {
        console.log(`✗ Failed: ${basename(heic)}`);
      }
    } else {
      console.log(`✗ Failed: ${basename(heic)}`);
    }
  }

  console.log("");
  console.log(`Done! Converted: ${count} files`);
}

main();
