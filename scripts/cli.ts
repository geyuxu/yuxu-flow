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
// COPY THEME TO DIST
// ============================================================

async function copyThemeToDist() {
  const config = getConfig();
  const themeDir = join(PROJECT_ROOT, config.paths.theme);
  const distDir = join(PROJECT_ROOT, config.paths.output);

  // Ensure dist directory exists
  if (!existsSync(distDir)) {
    Deno.mkdirSync(distDir, { recursive: true });
  }

  // Copy directory recursively (skip .git)
  async function copyDir(src: string, dest: string) {
    if (!existsSync(dest)) {
      Deno.mkdirSync(dest, { recursive: true });
    }
    for await (const entry of Deno.readDir(src)) {
      if (entry.name === ".git") continue; // Skip .git
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);
      if (entry.isDirectory) {
        await copyDir(srcPath, destPath);
      } else {
        await Deno.copyFile(srcPath, destPath);
      }
    }
  }

  // 1. Copy theme files to dist
  await copyDir(themeDir, distDir);

  // 2. Copy user config files to dist
  const configFiles = ["sidebar-config.json", "home-config.json"];
  for (const file of configFiles) {
    const src = join(PROJECT_ROOT, file);
    const dest = join(distDir, file);
    if (existsSync(src)) {
      await Deno.copyFile(src, dest);
    }
  }

  // 3. Generate features.json from staticflow.config.yaml for frontend use
  const featuresJson = JSON.stringify(config.features, null, 2);
  await Deno.writeTextFile(join(distDir, "features.json"), featuresJson);

  // 4. Copy content directory to dist (for runtime content loading)
  const contentSrc = join(PROJECT_ROOT, config.paths.posts.split("/")[0]); // "content"
  const contentDest = join(distDir, config.paths.posts.split("/")[0]);
  if (existsSync(contentSrc)) {
    await copyDir(contentSrc, contentDest);
  }

  // 5. Copy static directory to dist root (favicon, CNAME, images, etc.)
  const staticSrc = join(PROJECT_ROOT, config.paths.static);
  if (existsSync(staticSrc)) {
    await copyDir(staticSrc, distDir);
    console.log(`Copied static/ to ${config.paths.output}/`);
  }

  console.log(`Copied theme to ${config.paths.output}/`);
}

// ============================================================
// SERVE COMMAND (Deno HTTP Server)
// ============================================================

function serve(port: number = 8080) {
  const config = getConfig();
  const distDir = join(PROJECT_ROOT, config.paths.output);

  console.log(`=== Static Flow Dev Server ===\n`);
  console.log(`Serving: ${distDir}`);
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

    const filePath = join(distDir, pathname);

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

  // Copy theme to dist first
  console.log("--- Copying Theme to Output ---");
  await copyThemeToDist();
  console.log("");

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
  // Medium export only if enabled in config AND requested (or full build with feature enabled)
  const buildMediumExport = config.features.mediumExport && (!options.static || options.medium);

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
// AI COMMIT MESSAGE GENERATOR
// ============================================================

async function generateCommitMessage(changes: string): Promise<string | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a git commit message generator. Generate a concise, meaningful commit message (max 72 chars for title, optional body). Use conventional commits format: type(scope): description. Types: feat, fix, docs, style, refactor, perf, test, chore, build, deploy. Output only the commit message, no explanation.",
          },
          {
            role: "user",
            content: `Generate a commit message for deploying a static site to GitHub Pages. Changes summary:\n${changes}`,
          },
        ],
        max_tokens: 150,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

// ============================================================
// DEPLOY TO GH-PAGES
// ============================================================

async function deploy(options: { build?: boolean; message?: string; skipSource?: boolean } = {}) {
  const config = getConfig();
  const distDir = join(PROJECT_ROOT, config.paths.output);

  console.log("=== Deploy to GitHub Pages ===\n");

  // Check if dist directory exists and is a gh-pages worktree (before build)
  const distGitFile = join(distDir, ".git");
  let needSetup = false;

  if (!existsSync(distDir)) {
    needSetup = true;
  } else if (!existsSync(distGitFile)) {
    needSetup = true;
  } else {
    // Check if it's a gh-pages worktree
    try {
      const content = await Deno.readTextFile(distGitFile);
      if (!content.includes("gitdir:")) {
        needSetup = true;
      }
    } catch {
      needSetup = true;
    }
  }

  if (needSetup) {
    console.log("Setting up dist/ as gh-pages worktree...\n");
    await setupDeploy();
    console.log("");
  }

  // Build after setup (so build outputs to worktree)
  if (options.build) {
    console.log("--- Building Site ---\n");
    await build({ static: true });
  }

  // Check if dist has content
  if (!existsSync(distDir) || !existsSync(join(distDir, "index.html"))) {
    console.error("Error: No content in dist/. Run 'staticflow build' first.");
    Deno.exit(1);
  }

  // Get remote URL
  const remoteCmd = new Deno.Command("git", {
    args: ["remote", "get-url", "origin"],
    cwd: PROJECT_ROOT,
    stdout: "piped",
    stderr: "piped",
  });
  const remoteResult = await remoteCmd.output();
  if (!remoteResult.success) {
    console.error("Error: No git remote 'origin' found.");
    console.error("Please set up a remote: git remote add origin <url>");
    Deno.exit(1);
  }
  const remoteUrl = new TextDecoder().decode(remoteResult.stdout).trim();
  console.log(`Remote: ${remoteUrl}`);

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 16).replace("T", " ");
  const siteName = config.site.name;

  // Generate commit message
  let message = options.message;
  if (!message) {
    const changesSummary = `Site: ${siteName}\nDeployed: ${dateStr}`;
    const aiMessage = await generateCommitMessage(changesSummary);
    if (aiMessage) {
      console.log("Generated commit message with AI");
      message = aiMessage;
    } else {
      message = `deploy: update ${siteName} ${dateStr}`;
    }
  }

  // ============================================================
  // Deploy dist to gh-pages branch
  // ============================================================
  console.log("\n--- Deploying dist/ to gh-pages ---");

  // Check if dist is a gh-pages worktree (should be after auto-setup)
  let distIsWorktree = false;
  let deployDir = distDir;
  let tempDir = "";
  let useTempWorktree = false;

  if (existsSync(distGitFile)) {
    try {
      const gitFileContent = await Deno.readTextFile(distGitFile);
      if (gitFileContent.includes("gitdir:")) {
        // It's a worktree, check if it's gh-pages
        const branchCmd = new Deno.Command("git", {
          args: ["branch", "--show-current"],
          cwd: distDir,
          stdout: "piped",
          stderr: "piped",
        });
        const branchResult = await branchCmd.output();
        const branch = new TextDecoder().decode(branchResult.stdout).trim();
        if (branch === "gh-pages") {
          distIsWorktree = true;
          console.log("dist/ is already gh-pages worktree, deploying directly...");

          // Pull latest to sync
          const pullCmd = new Deno.Command("git", {
            args: ["pull", "--rebase", "origin", "gh-pages"],
            cwd: distDir,
            stdout: "piped",
            stderr: "piped",
          });
          await pullCmd.output();
        }
      }
    } catch { /* not a worktree */ }
  }

  if (!distIsWorktree) {
    // Use temp directory for deployment
    tempDir = await Deno.makeTempDir({ prefix: "staticflow-deploy-" });
    deployDir = tempDir;

    // Check if local gh-pages branch exists
    const localBranchCmd = new Deno.Command("git", {
      args: ["rev-parse", "--verify", "gh-pages"],
      cwd: PROJECT_ROOT,
      stdout: "piped",
      stderr: "piped",
    });
    const localBranchExists = (await localBranchCmd.output()).success;

    if (localBranchExists) {
      console.log("Using local gh-pages branch (worktree)...");
      // Prune stale worktrees first
      const pruneCmd = new Deno.Command("git", {
        args: ["worktree", "prune"],
        cwd: PROJECT_ROOT,
        stdout: "piped",
        stderr: "piped",
      });
      await pruneCmd.output();

      const worktreeCmd = new Deno.Command("git", {
        args: ["worktree", "add", tempDir, "gh-pages"],
        cwd: PROJECT_ROOT,
        stdout: "piped",
        stderr: "piped",
      });
      useTempWorktree = (await worktreeCmd.output()).success;

      if (useTempWorktree) {
        const pullCmd = new Deno.Command("git", {
          args: ["pull", "--rebase", "origin", "gh-pages"],
          cwd: tempDir,
          stdout: "piped",
          stderr: "piped",
        });
        await pullCmd.output();
      }
    }

    if (!useTempWorktree) {
      // Check if remote gh-pages exists
      const lsRemoteCmd = new Deno.Command("git", {
        args: ["ls-remote", "--heads", "origin", "gh-pages"],
        cwd: PROJECT_ROOT,
        stdout: "piped",
        stderr: "piped",
      });
      const lsRemoteResult = await lsRemoteCmd.output();
      const remoteExists = new TextDecoder().decode(lsRemoteResult.stdout).trim().length > 0;

      if (remoteExists) {
        console.log("Fetching gh-pages from remote...");
        const fetchCmd = new Deno.Command("git", {
          args: ["fetch", "origin", "gh-pages:gh-pages"],
          cwd: PROJECT_ROOT,
          stdout: "piped",
          stderr: "piped",
        });
        await fetchCmd.output();

        const worktreeCmd = new Deno.Command("git", {
          args: ["worktree", "add", tempDir, "gh-pages"],
          cwd: PROJECT_ROOT,
          stdout: "piped",
          stderr: "piped",
        });
        useTempWorktree = (await worktreeCmd.output()).success;
      }

      if (!useTempWorktree) {
        console.log("Creating new gh-pages branch...");
        const initCmd = new Deno.Command("git", {
          args: ["init"],
          cwd: tempDir,
          stdout: "piped",
          stderr: "piped",
        });
        await initCmd.output();

        const checkoutCmd = new Deno.Command("git", {
          args: ["checkout", "--orphan", "gh-pages"],
          cwd: tempDir,
          stdout: "piped",
          stderr: "piped",
        });
        await checkoutCmd.output();

        const addRemoteCmd = new Deno.Command("git", {
          args: ["remote", "add", "origin", remoteUrl],
          cwd: tempDir,
          stdout: "piped",
          stderr: "piped",
        });
        await addRemoteCmd.output();
      }
    }

    // Clear existing files (except .git)
    console.log("Clearing old files...");
    for await (const entry of Deno.readDir(deployDir)) {
      if (entry.name !== ".git") {
        await Deno.remove(join(deployDir, entry.name), { recursive: true });
      }
    }

    // Copy dist contents to deploy dir
    console.log("Copying dist/ to gh-pages...");
    async function copyDir(src: string, dest: string) {
      if (!existsSync(dest)) {
        Deno.mkdirSync(dest, { recursive: true });
      }
      for await (const entry of Deno.readDir(src)) {
        if (entry.name === ".git") continue; // Skip .git
        const srcPath = join(src, entry.name);
        const destPath = join(dest, entry.name);
        if (entry.isDirectory) {
          await copyDir(srcPath, destPath);
        } else {
          await Deno.copyFile(srcPath, destPath);
        }
      }
    }
    await copyDir(distDir, deployDir);
  }

  // Add .nojekyll file
  const nojekyllPath = join(deployDir, ".nojekyll");
  if (!existsSync(nojekyllPath)) {
    await Deno.writeTextFile(nojekyllPath, "");
  }

  try {
    // Check if there are changes
    const statusCmd = new Deno.Command("git", {
      args: ["status", "--porcelain"],
      cwd: deployDir,
      stdout: "piped",
      stderr: "piped",
    });
    const statusResult = await statusCmd.output();
    const hasChanges = new TextDecoder().decode(statusResult.stdout).trim().length > 0;

    if (!hasChanges) {
      console.log("\nNo changes to deploy.");
      return;
    }

    // Commit
    console.log("Committing...");
    const addGhCmd = new Deno.Command("git", {
      args: ["add", "-A"],
      cwd: deployDir,
      stdout: "piped",
      stderr: "piped",
    });
    await addGhCmd.output();

    const commitGhCmd = new Deno.Command("git", {
      args: ["commit", "-m", `deploy(gh-pages): ${message}`],
      cwd: deployDir,
      stdout: "piped",
      stderr: "piped",
    });
    await commitGhCmd.output();

    // Try normal push first
    console.log("Pushing to gh-pages...");
    const pushGhCmd = new Deno.Command("git", {
      args: ["push", "-u", "origin", "gh-pages"],
      cwd: deployDir,
      stdout: "inherit",
      stderr: "inherit",
    });
    const pushGhResult = await pushGhCmd.output();

    if (!pushGhResult.success) {
      // Push failed, ask user if force push
      console.log("\nPush failed (conflict with remote).");
      console.log("Do you want to force push? This will overwrite remote gh-pages. [y/N]");

      const buf = new Uint8Array(10);
      await Deno.stdin.read(buf);
      const answer = new TextDecoder().decode(buf).trim().toLowerCase();

      if (answer === "y" || answer === "yes") {
        console.log("Force pushing...");
        const forcePushCmd = new Deno.Command("git", {
          args: ["push", "-u", "origin", "gh-pages", "--force"],
          cwd: deployDir,
          stdout: "inherit",
          stderr: "inherit",
        });
        const forceResult = await forcePushCmd.output();

        if (!forceResult.success) {
          console.error("\nError: Force push also failed");
          Deno.exit(1);
        }
      } else {
        console.log("Aborted.");
        Deno.exit(1);
      }
    }

    console.log("\n=== Deployment Complete ===");
    console.log(`\n  Site deployed to gh-pages branch`);

    // GitHub Pages URL
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (match) {
      const [, owner, repo] = match;
      console.log(`\n  URL: https://${owner}.github.io/${repo}/`);
    }

  } finally {
    // Cleanup temp worktree and directory (only if we used temp dir)
    if (tempDir) {
      if (useTempWorktree) {
        const removeWorktreeCmd = new Deno.Command("git", {
          args: ["worktree", "remove", tempDir, "--force"],
          cwd: PROJECT_ROOT,
          stdout: "piped",
          stderr: "piped",
        });
        await removeWorktreeCmd.output();
      }

      try {
        await Deno.remove(tempDir, { recursive: true });
      } catch { /* ignore */ }
    }
  }
}

// ============================================================
// SETUP DEPLOY (Configure dist as gh-pages worktree)
// ============================================================

async function setupDeploy() {
  const config = getConfig();
  const distDir = join(PROJECT_ROOT, config.paths.output);

  console.log("=== Setup Deploy (gh-pages worktree) ===\n");

  // Get remote URL
  const remoteCmd = new Deno.Command("git", {
    args: ["remote", "get-url", "origin"],
    cwd: PROJECT_ROOT,
    stdout: "piped",
    stderr: "piped",
  });
  const remoteResult = await remoteCmd.output();
  if (!remoteResult.success) {
    console.error("Error: No git remote 'origin' found.");
    Deno.exit(1);
  }
  const remoteUrl = new TextDecoder().decode(remoteResult.stdout).trim();

  // Check if dist already exists and is a worktree
  const distGitFile = join(distDir, ".git");
  if (existsSync(distGitFile)) {
    try {
      const content = await Deno.readTextFile(distGitFile);
      if (content.includes("gitdir:")) {
        console.log("dist/ is already a git worktree.");
        return;
      }
    } catch { /* not a worktree */ }
  }

  // Remove existing dist directory
  if (existsSync(distDir)) {
    console.log("Removing existing dist/ directory...");
    await Deno.remove(distDir, { recursive: true });
  }

  // Prune stale worktrees
  const pruneCmd = new Deno.Command("git", {
    args: ["worktree", "prune"],
    cwd: PROJECT_ROOT,
    stdout: "piped",
    stderr: "piped",
  });
  await pruneCmd.output();

  // Check if local gh-pages branch exists
  const localBranchCmd = new Deno.Command("git", {
    args: ["rev-parse", "--verify", "gh-pages"],
    cwd: PROJECT_ROOT,
    stdout: "piped",
    stderr: "piped",
  });
  let branchExists = (await localBranchCmd.output()).success;

  if (!branchExists) {
    // Check remote
    const lsRemoteCmd = new Deno.Command("git", {
      args: ["ls-remote", "--heads", "origin", "gh-pages"],
      cwd: PROJECT_ROOT,
      stdout: "piped",
      stderr: "piped",
    });
    const lsRemoteResult = await lsRemoteCmd.output();
    const remoteExists = new TextDecoder().decode(lsRemoteResult.stdout).trim().length > 0;

    if (remoteExists) {
      console.log("Fetching gh-pages from remote...");
      const fetchCmd = new Deno.Command("git", {
        args: ["fetch", "origin", "gh-pages:gh-pages"],
        cwd: PROJECT_ROOT,
        stdout: "piped",
        stderr: "piped",
      });
      await fetchCmd.output();
      branchExists = true;
    } else {
      // Create orphan branch
      console.log("Creating gh-pages orphan branch...");
      const tempDir = await Deno.makeTempDir({ prefix: "gh-pages-init-" });
      try {
        const initCmd = new Deno.Command("git", {
          args: ["init"],
          cwd: tempDir,
          stdout: "piped",
          stderr: "piped",
        });
        await initCmd.output();

        const checkoutCmd = new Deno.Command("git", {
          args: ["checkout", "--orphan", "gh-pages"],
          cwd: tempDir,
          stdout: "piped",
          stderr: "piped",
        });
        await checkoutCmd.output();

        await Deno.writeTextFile(join(tempDir, ".nojekyll"), "");

        const addCmd = new Deno.Command("git", {
          args: ["add", ".nojekyll"],
          cwd: tempDir,
          stdout: "piped",
          stderr: "piped",
        });
        await addCmd.output();

        const commitCmd = new Deno.Command("git", {
          args: ["commit", "-m", "Initial gh-pages"],
          cwd: tempDir,
          stdout: "piped",
          stderr: "piped",
        });
        await commitCmd.output();

        const addRemoteCmd = new Deno.Command("git", {
          args: ["remote", "add", "origin", remoteUrl],
          cwd: tempDir,
          stdout: "piped",
          stderr: "piped",
        });
        await addRemoteCmd.output();

        const pushCmd = new Deno.Command("git", {
          args: ["push", "-u", "origin", "gh-pages"],
          cwd: tempDir,
          stdout: "inherit",
          stderr: "inherit",
        });
        await pushCmd.output();

        // Fetch into main repo
        const fetchCmd = new Deno.Command("git", {
          args: ["fetch", "origin", "gh-pages:gh-pages"],
          cwd: PROJECT_ROOT,
          stdout: "piped",
          stderr: "piped",
        });
        await fetchCmd.output();
        branchExists = true;
      } finally {
        await Deno.remove(tempDir, { recursive: true });
      }
    }
  }

  // Create worktree
  console.log("Setting up dist/ as gh-pages worktree...");
  const worktreeCmd = new Deno.Command("git", {
    args: ["worktree", "add", distDir, "gh-pages"],
    cwd: PROJECT_ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  const result = await worktreeCmd.output();

  if (result.success) {
    console.log("\n=== Setup Complete ===");
    console.log("\nNow you can:");
    console.log("  1. Run 'staticflow build' to build into dist/");
    console.log("  2. Run 'staticflow deploy' to commit and push (no copy needed!)");
  } else {
    console.error("\nFailed to create worktree.");
    Deno.exit(1);
  }
}

// ============================================================
// CLEAN COMMAND
// ============================================================

function clean(all: boolean = false) {
  const config = getConfig();
  const distDir = join(PROJECT_ROOT, config.paths.output);

  console.log("=== Cleaning Generated Files ===\n");

  const dirsToRemove = [
    join(distDir, "blog", "static"),
    join(distDir, "blog", "medium"),
    join(distDir, "blog", "images", "tables"),
  ];

  const filesToRemove = [
    join(distDir, "blog", ".table-cache.json"),
  ];

  // Add gist cache only with --all flag
  if (all) {
    filesToRemove.push(join(distDir, "blog", ".gist-cache.json"));
    // Also remove entire dist directory
    dirsToRemove.push(distDir);
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

  case "deploy": {
    const options = {
      build: args.includes("--build"),
      message: args.find((a, i) => args[i - 1] === "-m" && !a.startsWith("-")),
    };
    await deploy(options);
    break;
  }

  case "setup-deploy":
    await setupDeploy();
    break;

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
  staticflow deploy             Deploy dist/ to gh-pages branch
  staticflow deploy --build     Build first, then deploy
  staticflow deploy -m "msg"    Deploy with custom commit message
  staticflow setup-deploy       Setup dist/ as gh-pages worktree (faster deploy)
  staticflow setup              Check dependencies
  staticflow init               Initialize project
  staticflow clean              Clean generated files
  staticflow clean --all        Clean everything including caches

Examples:
  ./staticflow build            # Build everything
  ./staticflow build --static   # Static HTML only
  ./staticflow serve            # Start server at :8080
  ./staticflow deploy --build   # Build and deploy to GitHub Pages
`);
}
