#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run
/**
 * Unified build script
 * Usage:
 *   deno run blog/build.ts           # Build both static and medium
 *   deno run blog/build.ts --static  # Build static only
 *   deno run blog/build.ts --medium  # Build medium only
 */

import { dirname } from "@std/path";

const args = Deno.args;
const buildStatic = args.length === 0 || args.includes("--static");
const buildMedium = args.length === 0 || args.includes("--medium");

const blogDir = dirname(import.meta.filename!);

if (buildStatic) {
  console.log("═══════════════════════════════════════");
  console.log("📄 Building static version (for crawlers)");
  console.log("═══════════════════════════════════════\n");
  try {
    const cmd = new Deno.Command("deno", {
      args: ["run", "--allow-read", "--allow-write", "build-static.ts", "--all"],
      cwd: blogDir,
      stdout: "inherit",
      stderr: "inherit",
    });
    const output = cmd.outputSync();
    if (!output.success) {
      console.error("Static build failed");
      Deno.exit(1);
    }
  } catch (err) {
    console.error("Static build failed:", (err as Error).message);
    Deno.exit(1);
  }
}

if (buildMedium) {
  if (buildStatic) console.log("\n");
  console.log("═══════════════════════════════════════");
  console.log("📰 Building medium version (for Medium)");
  console.log("═══════════════════════════════════════\n");
  try {
    const cmd = new Deno.Command("deno", {
      args: ["run", "-A", "build-medium.ts"],
      cwd: blogDir,
      stdout: "inherit",
      stderr: "inherit",
    });
    const output = cmd.outputSync();
    if (!output.success) {
      console.error("⚠ Medium build failed (non-blocking)");
      // Don't exit - medium build is optional
    }
  } catch {
    console.error("⚠ Medium build failed (non-blocking)");
    // Don't exit - medium build is optional
  }
}

console.log("\n═══════════════════════════════════════");
console.log("✅ Build complete!");
if (buildStatic) console.log("   Static: blog/static/");
if (buildMedium) console.log("   Medium: blog/medium/");
console.log("═══════════════════════════════════════");
