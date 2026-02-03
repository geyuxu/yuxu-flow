#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run
/**
 * Convert Office documents to PDF for preview
 *
 * Supported formats:
 *   - PPTX (PowerPoint)
 *   - RTF (Rich Text Format)
 *   - ODT (OpenDocument Text)
 *   - ODS (OpenDocument Spreadsheet)
 *   - ODP (OpenDocument Presentation)
 *
 * Requires LibreOffice installed:
 *   macOS: brew install --cask libreoffice
 *   Linux: sudo apt install libreoffice
 *
 * Run: deno task build:office
 */

import { join, dirname, basename, extname } from "@std/path";

const __dirname = dirname(import.meta.filename!);
const POSTS_DIR = join(__dirname, "posts");

// Supported extensions for LibreOffice conversion
const SUPPORTED_EXTENSIONS = [".pptx", ".rtf", ".odt", ".ods", ".odp"];

// Human-readable format names
const FORMAT_NAMES: Record<string, string> = {
  ".pptx": "PowerPoint",
  ".rtf": "RTF",
  ".odt": "OpenDocument Text",
  ".ods": "OpenDocument Spreadsheet",
  ".odp": "OpenDocument Presentation",
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

// Find LibreOffice executable
function findLibreOffice(): string | null {
  const paths = [
    "/Applications/LibreOffice.app/Contents/MacOS/soffice", // macOS
    "/usr/bin/soffice", // Linux
    "/usr/bin/libreoffice", // Linux alt
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe", // Windows
  ];

  for (const p of paths) {
    if (existsSync(p)) {
      return p;
    }
  }

  // Try to find in PATH using which command
  try {
    const cmd = new Deno.Command("sh", {
      args: ["-c", "which soffice 2>/dev/null || which libreoffice 2>/dev/null"],
      stdout: "piped",
      stderr: "piped",
    });
    const output = cmd.outputSync();
    if (output.success) {
      const result = new TextDecoder().decode(output.stdout).trim();
      if (result) return result;
    }
  } catch {
    // Ignore
  }

  return null;
}

// Recursively find all supported files
function findOfficeFiles(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;

  for (const entry of Deno.readDirSync(dir)) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory) {
      findOfficeFiles(fullPath, files);
    } else {
      const ext = extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

// Main
async function main() {
  console.log("=== Office to PDF Converter ===\n");
  console.log("Supported: PPTX, RTF, ODT, ODS, ODP\n");

  // Find LibreOffice
  const soffice = findLibreOffice();
  if (!soffice) {
    console.log("⚠ LibreOffice not found - skipping Office conversion");
    console.log("  Install to enable Office to PDF conversion:");
    console.log("    macOS:  brew install --cask libreoffice");
    console.log("    Linux:  sudo apt install libreoffice");
    return; // Gracefully skip
  }
  console.log(`Found LibreOffice: ${soffice}\n`);

  // Find office files
  const officeFiles = findOfficeFiles(POSTS_DIR);

  if (officeFiles.length === 0) {
    console.log("No office files to convert.");
    return;
  }

  // Group by extension for logging
  const byExt: Record<string, number> = {};
  for (const f of officeFiles) {
    const ext = extname(f).toLowerCase();
    byExt[ext] = (byExt[ext] || 0) + 1;
  }
  console.log("Found files:");
  for (const [ext, count] of Object.entries(byExt)) {
    console.log(`  ${FORMAT_NAMES[ext]}: ${count}`);
  }
  console.log("");

  let converted = 0;
  let skipped = 0;
  let failed = 0;

  for (const filePath of officeFiles) {
    const ext = extname(filePath).toLowerCase();
    const pdfPath = filePath.replace(new RegExp(`\\${ext}$`, "i"), ".pdf");
    const filename = basename(filePath);

    // Skip if PDF already exists and is newer than source
    if (existsSync(pdfPath)) {
      const srcStat = Deno.statSync(filePath);
      const pdfStat = Deno.statSync(pdfPath);

      if (pdfStat.mtime && srcStat.mtime && pdfStat.mtime >= srcStat.mtime) {
        console.log(`⏭ Skip: ${filename} (PDF up to date)`);
        skipped++;
        continue;
      }
    }

    // Convert to PDF using LibreOffice
    const outDir = dirname(filePath);
    console.log(`📄 Converting: ${filename}...`);

    try {
      const cmd = new Deno.Command(soffice, {
        args: ["--headless", "--convert-to", "pdf", "--outdir", outDir, filePath],
        stdout: "piped",
        stderr: "piped",
      });

      // Use spawn for timeout support
      const process = cmd.spawn();
      const timeoutId = setTimeout(() => {
        try {
          process.kill("SIGTERM");
        } catch {
          // Ignore kill errors
        }
      }, 120000); // 2 minute timeout

      const output = await process.output();
      clearTimeout(timeoutId);

      if (output.success) {
        console.log(`✓ Converted: ${filename} → ${basename(pdfPath)}`);
        converted++;
      } else {
        const stderr = new TextDecoder().decode(output.stderr);
        console.log(`✗ Error converting ${filename}: ${stderr}`);
        failed++;
      }
    } catch (err) {
      console.log(`✗ Error converting ${filename}: ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(
    `\nDone! Converted: ${converted}, Skipped: ${skipped}, Failed: ${failed}`
  );
}

// Run as async
main();
