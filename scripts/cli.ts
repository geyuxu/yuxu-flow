#!/usr/bin/env -S deno run -A
/**
 * Static Flow CLI
 *
 * Main entry point for all build commands.
 * Can be compiled to a binary: deno compile -A scripts/cli.ts -o staticflow
 *
 * Usage:
 *   staticflow build            # Full build
 *   staticflow build --photos   # Process photos only
 *   staticflow build --static   # Static HTML only
 *   staticflow build --medium   # Medium export only
 *   staticflow serve            # Start dev server
 *   staticflow setup            # Check/install dependencies
 *   staticflow init             # Initialize new project
 *   staticflow clean            # Clean generated files
 */

import { join } from "@std/path";
import { getConfig, getProjectRoot } from "./config.ts";

// Import all build scripts for direct execution (required for compiled binary)
import { main as convertHeicMain } from "./convert-heic.ts";
import { main as compressPhotosMain } from "./compress-photos.ts";
import { main as generateDescriptionsMain } from "./generate-descriptions.ts";
import { main as buildOfficePdfMain } from "./build-office-pdf.ts";
import { main as buildTexPdfMain } from "./build-tex-pdf.ts";
import { main as buildPostsJsonMain } from "./build-posts-json.ts";
import { main as buildPhotosJsonMain } from "./build-photos-json.ts";
import { main as buildStaticMain } from "./build-static.ts";
import { main as buildMediumMain } from "./build-medium.ts";
import { main as indexBuilderMain } from "./index-builder.ts";
import { main as buildMain } from "./build.ts";

const PROJECT_ROOT = getProjectRoot();

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function existsSync(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

function commandExists(cmd: string): boolean {
  try {
    const result = new Deno.Command("which", {
      args: [cmd],
      stdout: "piped",
      stderr: "piped",
    }).outputSync();
    return result.success;
  } catch {
    return false;
  }
}

// ============================================================
// SETUP COMMAND
// ============================================================

function setup() {
  console.log("=== Static Flow Setup ===\n");

  // Detect OS
  const os = Deno.build.os;
  console.log(`OS: ${os}`);
  console.log("");

  // Check Deno version
  console.log("--- Checking Required Dependencies ---\n");

  const denoVersion = Deno.version.deno;
  const [major, minor] = denoVersion.split(".").map(Number);
  if (major < 1 || (major === 1 && minor < 40)) {
    console.log(`[FAIL] Deno version ${denoVersion} is too old. Requires >= 1.40`);
    console.log("  Install: curl -fsSL https://deno.land/x/install/install.sh | sh");
    Deno.exit(1);
  }
  console.log(`[OK] Deno ${denoVersion}`);

  console.log("");
  console.log("--- Checking Optional Dependencies ---\n");

  // LibreOffice
  const hasLibreOffice = existsSync("/Applications/LibreOffice.app/Contents/MacOS/soffice") ||
    commandExists("soffice") || commandExists("libreoffice");
  if (hasLibreOffice) {
    console.log("[OK] LibreOffice (Office to PDF conversion)");
  } else {
    console.log("[OPTIONAL] LibreOffice (Office to PDF conversion)");
    if (os === "darwin") {
      console.log("  Install: brew install --cask libreoffice");
    } else {
      console.log("  Install: sudo apt install libreoffice");
    }
  }

  // ImageMagick
  const hasImageMagick = commandExists("magick") || commandExists("convert");
  if (hasImageMagick) {
    console.log("[OK] ImageMagick (Photo compression)");
  } else {
    console.log("[OPTIONAL] ImageMagick (Photo compression)");
    if (os === "darwin") {
      console.log("  Install: brew install imagemagick");
    } else {
      console.log("  Install: sudo apt install imagemagick");
    }
  }

  // pdflatex
  const hasPdflatex = commandExists("pdflatex") || existsSync("/Library/TeX/texbin/pdflatex");
  if (hasPdflatex) {
    console.log("[OK] pdflatex (LaTeX to PDF conversion)");
  } else {
    console.log("[OPTIONAL] pdflatex (LaTeX to PDF conversion)");
    if (os === "darwin") {
      console.log("  Install: brew install --cask mactex-no-gui");
    } else {
      console.log("  Install: sudo apt install texlive-latex-base texlive-latex-extra");
    }
  }

  // Chrome (for table to image)
  const chromeExists = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].some(existsSync);
  if (chromeExists) {
    console.log("[OK] Chrome/Chromium (Table to image conversion)");
  } else {
    console.log("[OPTIONAL] Chrome/Chromium (Table to image conversion)");
    console.log("  Required for Medium export with tables");
  }

  console.log("");
  console.log("=== Setup Complete ===\n");
  console.log("Next steps:");
  console.log("  1. Edit staticflow.config.yaml to configure your site");
  console.log("  2. Add content to content/posts/ and content/photos/");
  console.log("  3. Run: deno task build");
  console.log("  4. Run: deno task serve");
  console.log("");
}

// ============================================================
// SERVE COMMAND (Deno HTTP Server)
// ============================================================

function serve(port: number = 8080) {
  console.log(`=== Static Flow Dev Server ===\n`);
  console.log(`Serving: ${PROJECT_ROOT}`);
  console.log(`URL: http://localhost:${port}`);
  console.log("");
  console.log("Press Ctrl+C to stop.\n");

  const mimeTypes: Record<string, string> = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".pdf": "application/pdf",
    ".md": "text/markdown",
    ".ipynb": "application/json",
    ".xml": "application/xml",
    ".txt": "text/plain",
    ".dat": "application/octet-stream",
    ".wasm": "application/wasm",
  };

  Deno.serve({ port }, async (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);

    // Default to index.html for directory requests
    if (pathname.endsWith("/")) {
      pathname += "index.html";
    }

    const filePath = join(PROJECT_ROOT, pathname);

    try {
      const stat = await Deno.stat(filePath);

      // If directory, try index.html
      if (stat.isDirectory) {
        const indexPath = join(filePath, "index.html");
        try {
          const indexStat = await Deno.stat(indexPath);
          if (indexStat.isFile) {
            const content = await Deno.readFile(indexPath);
            return new Response(content, {
              headers: { "Content-Type": "text/html" },
            });
          }
        } catch {
          // No index.html
        }
        return new Response("Not Found", { status: 404 });
      }

      // Serve file
      const content = await Deno.readFile(filePath);
      const ext = pathname.substring(pathname.lastIndexOf("."));
      const contentType = mimeTypes[ext] || "application/octet-stream";

      return new Response(content, {
        headers: { "Content-Type": contentType },
      });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  });
}

// ============================================================
// BUILD COMMAND
// ============================================================

async function build(options: {
  photos?: boolean;
  static?: boolean;
  medium?: boolean;
  push?: boolean;
  commitMessage?: string;
}) {
  const config = getConfig();

  console.log("=== Static Flow Build ===\n");

  // Photos only mode
  if (options.photos) {
    console.log("--- Processing Photos ---\n");

    console.log("Converting HEIC to JPG...");
    await convertHeicMain();
    console.log("");

    console.log("Compressing photos...");
    await compressPhotosMain();
    console.log("");

    if (config.features.gallery) {
      console.log("Generating descriptions...");
      await generateDescriptionsMain();
    }

    console.log("\n=== Photos Processing Complete ===");
    return;
  }

  // Full build or specific targets
  const buildPhotos = !options.static && !options.medium;
  const buildStaticHtml = !options.medium || options.static;
  const buildMediumExport = !options.static || options.medium;

  if (buildPhotos) {
    console.log("--- Converting HEIC to JPG ---");
    await convertHeicMain();
    console.log("");

    console.log("--- Compressing Photos ---");
    await compressPhotosMain();
    console.log("");

    if (config.features.gallery) {
      console.log("--- Generating Photo Descriptions ---");
      try {
        await generateDescriptionsMain();
      } catch {
        console.log("Warning: Description generation skipped or failed (non-blocking)");
      }
      console.log("");
    }
  }

  // Convert Office documents
  console.log("--- Converting Office Docs to PDF ---");
  await buildOfficePdfMain();
  console.log("");

  // Convert LaTeX
  console.log("--- Converting LaTeX to PDF ---");
  buildTexPdfMain();
  console.log("");

  // Build posts.json
  console.log("--- Building Blog ---");
  buildPostsJsonMain();
  console.log("");

  // Build photos.json
  if (config.features.gallery) {
    console.log("--- Building Gallery ---");
    buildPhotosJsonMain();
    console.log("");
  }

  // Build search index
  if (config.features.vectorSearch && Deno.env.get("OPENAI_API_KEY")) {
    console.log("--- Building Search Index ---");
    try {
      await indexBuilderMain();
    } catch (err) {
      console.log(`Warning: Search index build failed: ${(err as Error).message}`);
    }
    console.log("");
  } else if (config.features.vectorSearch) {
    console.log("--- Skipping Search Index (OPENAI_API_KEY not set) ---\n");
  }

  // Build static/medium HTML
  if (buildStaticHtml || buildMediumExport) {
    console.log("--- Building HTML ---");
    const buildArgs: string[] = [];
    if (options.static && !options.medium) buildArgs.push("--static");
    if (options.medium && !options.static) buildArgs.push("--medium");
    await buildMain(buildArgs);
    console.log("");
  }

  console.log("=== Build Complete ===\n");

  // Git push if requested
  if (options.push) {
    await gitPush(options.commitMessage);
  }
}

// ============================================================
// GIT PUSH
// ============================================================

async function gitPush(customMessage?: string) {
  console.log("--- Git Status ---");
  const statusCmd = new Deno.Command("git", {
    args: ["status", "--short"],
    cwd: PROJECT_ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  await statusCmd.output();

  // Check if there are changes
  const diffCmd = new Deno.Command("git", {
    args: ["diff", "--quiet"],
    cwd: PROJECT_ROOT,
    stdout: "piped",
    stderr: "piped",
  });
  const diffResult = await diffCmd.output();

  const diffCachedCmd = new Deno.Command("git", {
    args: ["diff", "--cached", "--quiet"],
    cwd: PROJECT_ROOT,
    stdout: "piped",
    stderr: "piped",
  });
  const diffCachedResult = await diffCachedCmd.output();

  if (diffResult.success && diffCachedResult.success) {
    console.log("\nNo changes to commit.");
    return;
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 16).replace("T", " ");
  const message = customMessage || `build: update site ${dateStr}`;

  console.log("\n--- Committing ---");
  const addCmd = new Deno.Command("git", {
    args: ["add", "-A"],
    cwd: PROJECT_ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  await addCmd.output();

  const commitCmd = new Deno.Command("git", {
    args: ["commit", "-m", message],
    cwd: PROJECT_ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  await commitCmd.output();

  console.log("\n--- Pushing ---");
  const pushCmd = new Deno.Command("git", {
    args: ["push"],
    cwd: PROJECT_ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  await pushCmd.output();

  console.log("\nDone!");
}

// ============================================================
// CLEAN COMMAND
// ============================================================

function clean(all: boolean = false) {
  console.log("=== Cleaning Generated Files ===\n");

  const dirsToRemove = [
    join(PROJECT_ROOT, "blog", "static"),
    join(PROJECT_ROOT, "blog", "medium"),
    join(PROJECT_ROOT, "blog", "images", "tables"),
  ];

  const filesToRemove = [
    join(PROJECT_ROOT, "blog", ".table-cache.json"),
  ];

  // Add gist cache only with --all flag
  if (all) {
    filesToRemove.push(join(PROJECT_ROOT, "blog", ".gist-cache.json"));
  }

  for (const dir of dirsToRemove) {
    if (existsSync(dir)) {
      try {
        Deno.removeSync(dir, { recursive: true });
        console.log(`Removed: ${dir.replace(PROJECT_ROOT + "/", "")}`);
      } catch (err) {
        console.log(`Failed to remove ${dir}: ${(err as Error).message}`);
      }
    }
  }

  for (const file of filesToRemove) {
    if (existsSync(file)) {
      try {
        Deno.removeSync(file);
        console.log(`Removed: ${file.replace(PROJECT_ROOT + "/", "")}`);
      } catch (err) {
        console.log(`Failed to remove ${file}: ${(err as Error).message}`);
      }
    }
  }

  console.log("\n=== Clean Complete ===");
}

// ============================================================
// INIT COMMAND
// ============================================================

function init() {
  console.log("=== Initializing Static Flow Project ===\n");

  // Create directories
  const dirs = [
    "content/posts",
    "content/photos",
    "themes/default/blog",
    "themes/default/gallery",
    "themes/default/components",
    "dist",
    ".cache",
  ];

  for (const dir of dirs) {
    const path = join(PROJECT_ROOT, dir);
    if (!existsSync(path)) {
      Deno.mkdirSync(path, { recursive: true });
      console.log(`Created: ${dir}/`);
    }
  }

  // Create config if missing
  const configPath = join(PROJECT_ROOT, "staticflow.config.yaml");
  if (!existsSync(configPath)) {
    console.log("\nConfig file already exists: staticflow.config.yaml");
  }

  console.log("\n=== Initialization Complete ===");
  console.log("\nNext steps:");
  console.log("  1. Edit staticflow.config.yaml");
  console.log("  2. Add your content to content/posts/");
  console.log("  3. Run: deno task build");
}

// ============================================================
// MAIN CLI
// ============================================================

const args = Deno.args;
const command = args[0];

switch (command) {
  case "build": {
    const options = {
      photos: args.includes("--photos"),
      static: args.includes("--static"),
      medium: args.includes("--medium"),
      push: args.includes("--push"),
      commitMessage: args.find((a, i) => args[i - 1] === "--push" && !a.startsWith("--")),
    };
    await build(options);
    break;
  }

  case "serve": {
    const portArg = args.find((a) => a.startsWith("--port="));
    const port = portArg ? parseInt(portArg.split("=")[1]) : 8080;
    serve(port);
    break;
  }

  case "setup":
    setup();
    break;

  case "init":
    init();
    break;

  case "clean": {
    const all = args.includes("--all");
    clean(all);
    break;
  }

  default:
    console.log(`Static Flow - Static Site Generator

Usage:
  staticflow build              Full build
  staticflow build --photos     Process photos only
  staticflow build --static     Build static HTML only
  staticflow build --medium     Build Medium export only
  staticflow build --push       Build and push to git
  staticflow serve              Start dev server
  staticflow serve --port=3000  Custom port
  staticflow setup              Check dependencies
  staticflow init               Initialize project
  staticflow clean              Clean generated files
  staticflow clean --all        Clean everything including caches

Examples:
  ./staticflow build            # Build everything
  ./staticflow build --static   # Static HTML only
  ./staticflow serve            # Start server at :8080
`);
}
