#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env
/**
 * Convert LaTeX (.tex) files to PDF for browser preview
 *
 * Requires pdflatex (part of TeX distribution):
 *   macOS:  brew install --cask mactex-no-gui
 *   Linux:  sudo apt install texlive-latex-base texlive-latex-extra
 *
 * Run: deno task build:latex
 */

import { join, dirname, basename } from "@std/path";
import { getPostsDir } from "./config.ts";

const POSTS_DIR = getPostsDir();

// Check if file exists
function existsSync(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

// Find pdflatex executable
function findPdflatex(): string | null {
  const commands = ["pdflatex", "/Library/TeX/texbin/pdflatex"];

  for (const cmd of commands) {
    try {
      // Try which command
      const whichCmd = new Deno.Command("which", {
        args: [cmd],
        stdout: "piped",
        stderr: "piped",
      });
      const output = whichCmd.outputSync();
      if (output.success) {
        return cmd;
      }
    } catch {
      // Try direct path check for macOS
      if (cmd.startsWith("/") && existsSync(cmd)) {
        return cmd;
      }
    }
  }
  return null;
}

// Recursively find all .tex files
function findTexFiles(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;

  for (const entry of Deno.readDirSync(dir)) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory) {
      findTexFiles(fullPath, files);
    } else if (entry.name.endsWith(".tex")) {
      files.push(fullPath);
    }
  }

  return files;
}

// Convert a single .tex file to PDF
function convertToPdf(texPath: string, pdflatex: string): boolean {
  const dir = dirname(texPath);
  const baseName = basename(texPath, ".tex");
  const pdfPath = join(dir, `${baseName}.pdf`);

  // Skip if PDF already exists and is newer than TEX
  if (existsSync(pdfPath)) {
    const texStat = Deno.statSync(texPath);
    const pdfStat = Deno.statSync(pdfPath);
    if (pdfStat.mtime && texStat.mtime && pdfStat.mtime > texStat.mtime) {
      console.log(`  Skip (up to date): ${baseName}.tex`);
      return true;
    }
  }

  console.log(`  Converting: ${baseName}.tex`);

  // Run pdflatex twice for references (common practice)
  // Use -interaction=nonstopmode to avoid prompts
  // Use -output-directory to keep aux files in same dir
  const args = [
    "-interaction=nonstopmode",
    "-halt-on-error",
    `-output-directory=${dir}`,
    texPath,
  ];

  try {
    // First pass
    const cmd1 = new Deno.Command(pdflatex, {
      args,
      stdout: "piped",
      stderr: "piped",
      stdin: "null",
    });

    const result1 = cmd1.outputSync();

    if (!result1.success) {
      const stderr = new TextDecoder().decode(result1.stderr);
      const stdout = new TextDecoder().decode(result1.stdout);
      console.log(`  Warning: ${baseName}.tex may have errors`);
      // Check if PDF was still generated
      if (!existsSync(pdfPath)) {
        console.log(`    ${stderr || stdout.slice(-500)}`);
        return false;
      }
    }

    // Second pass for references
    const cmd2 = new Deno.Command(pdflatex, {
      args,
      stdout: "null",
      stderr: "null",
      stdin: "null",
    });
    cmd2.outputSync();

    // Clean up auxiliary files
    const auxExtensions = [".aux", ".log", ".out", ".toc", ".lof", ".lot"];
    for (const ext of auxExtensions) {
      const auxFile = join(dir, `${baseName}${ext}`);
      if (existsSync(auxFile)) {
        try {
          Deno.removeSync(auxFile);
        } catch {
          // Ignore removal errors
        }
      }
    }

    if (existsSync(pdfPath)) {
      console.log(`  OK Created: ${baseName}.pdf`);
      return true;
    } else {
      console.log(`  FAIL: ${baseName}.pdf not created`);
      return false;
    }
  } catch (err) {
    console.log(`  FAIL: ${(err as Error).message}`);
    return false;
  }
}

// Main
function main() {
  console.log("LaTeX to PDF Conversion\n");
  console.log(`Posts directory: ${POSTS_DIR}\n`);

  const pdflatex = findPdflatex();

  if (!pdflatex) {
    console.log("Warning: pdflatex not found - skipping LaTeX conversion");
    console.log("  Install to enable LaTeX to PDF conversion:");
    console.log("    macOS:  brew install --cask mactex-no-gui");
    console.log("    Linux:  sudo apt install texlive-latex-base texlive-latex-extra");
    return;
  }

  console.log(`Using: ${pdflatex}\n`);

  if (!existsSync(POSTS_DIR)) {
    console.log("No posts directory found");
    return;
  }

  const texFiles = findTexFiles(POSTS_DIR);

  if (texFiles.length === 0) {
    console.log("No .tex files found");
    return;
  }

  console.log(`Found ${texFiles.length} LaTeX file(s):\n`);

  let converted = 0;
  let failed = 0;

  for (const texFile of texFiles) {
    const result = convertToPdf(texFile, pdflatex);
    if (result) {
      converted++;
    } else {
      failed++;
    }
  }

  console.log(`\nDone: ${converted} converted, ${failed} failed`);
}

// Export main function
export { main };

// Run if called directly
if (import.meta.main) {
  main();
}
