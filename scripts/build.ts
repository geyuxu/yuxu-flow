#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env --allow-net
/**
 * Unified build script
 * Usage:
 *   deno task build:all           # Build both static and medium
 *   deno task build:all --static  # Build static only
 *   deno task build:all --medium  # Build medium only
 */

import { getConfig } from "./config.ts";
import { main as buildStaticMain } from "./build-static.ts";
import { main as buildMediumMain } from "./build-medium.ts";

const config = getConfig();

export async function main(argsOverride?: string[]) {
  const args = argsOverride || Deno.args;
  const buildStatic = args.length === 0 || args.includes("--static");
  const buildMedium = args.length === 0 || args.includes("--medium");

  if (buildStatic && config.build.staticHtml) {
    console.log("═══════════════════════════════════════");
    console.log("Building static version (for crawlers)");
    console.log("═══════════════════════════════════════\n");
    try {
      buildStaticMain(["--all"]);
    } catch (err) {
      console.error("Static build failed:", (err as Error).message);
      return;
    }
  }

  if (buildMedium && config.features.mediumExport) {
    if (buildStatic) console.log("\n");
    console.log("═══════════════════════════════════════");
    console.log("Building medium version (for Medium)");
    console.log("═══════════════════════════════════════\n");
    try {
      await buildMediumMain();
    } catch {
      console.error("Warning: Medium build failed (non-blocking)");
      // Don't exit - medium build is optional
    }
  }

  console.log("\n═══════════════════════════════════════");
  console.log("Build complete!");
  if (buildStatic && config.build.staticHtml) console.log(`   Static: ${config.paths.output}/blog/static/`);
  if (buildMedium && config.features.mediumExport) console.log(`   Medium: ${config.paths.output}/blog/medium/`);
  console.log("═══════════════════════════════════════");
}

// Run if called directly
if (import.meta.main) {
  main().catch((err) => {
    console.error("Build failed:", err);
    Deno.exit(1);
  });
}
