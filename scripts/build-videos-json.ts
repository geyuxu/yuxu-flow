#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env
/**
 * Generate videos.json from individual video JSON files
 *
 * Expected structure:
 *   videos/YYYY/video-name.json
 *
 * Each JSON file:
 *   { name, date, publish: [{ platform, url, script }] }
 *
 * Output: dist/videos/videos.json (sorted newest first)
 */

import { join, extname } from "@std/path";
import { getConfig, getProjectRoot } from "./config.ts";

const config = getConfig();
const PROJECT_ROOT = getProjectRoot();
const VIDEOS_DIR = join(PROJECT_ROOT, "videos");
const OUTPUT_DIR = join(PROJECT_ROOT, config.paths.output);
const OUTPUT_FILE = join(OUTPUT_DIR, "videos", "videos.json");

function existsSync(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

interface VideoPublish {
  platform: string;
  url: string;
  script: string;
}

interface VideoEntry {
  name: string;
  date: string;
  publish: VideoPublish[];
}

function main() {
  console.log(`Videos directory: ${VIDEOS_DIR}`);
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log("");

  if (!existsSync(VIDEOS_DIR)) {
    console.log("No videos directory found. Skipping.");
    return;
  }

  const videos: VideoEntry[] = [];

  // Scan year directories
  const years = Array.from(Deno.readDirSync(VIDEOS_DIR))
    .filter((d) => d.isDirectory && /^\d{4}$/.test(d.name))
    .map((d) => d.name)
    .sort()
    .reverse();

  for (const year of years) {
    const yearPath = join(VIDEOS_DIR, year);

    // Scan JSON files
    const jsonFiles = Array.from(Deno.readDirSync(yearPath))
      .filter((e) => e.isFile && extname(e.name).toLowerCase() === ".json")
      .map((e) => e.name)
      .sort();

    for (const file of jsonFiles) {
      const filePath = join(yearPath, file);
      try {
        const content = Deno.readTextFileSync(filePath);
        const data = JSON.parse(content) as VideoEntry;

        if (!data.name || !data.date || !Array.isArray(data.publish)) {
          console.log(`Warning: Skip: ${year}/${file} (invalid format)`);
          continue;
        }

        videos.push(data);
        console.log(`OK ${year}/${file} (${data.publish.length} platforms)`);
      } catch (err) {
        console.log(`Warning: Skip: ${year}/${file} (${(err as Error).message})`);
      }
    }
  }

  // Sort newest first
  videos.sort((a, b) => b.date.localeCompare(a.date));

  // Ensure output directory exists
  const outputDir = join(OUTPUT_DIR, "videos");
  if (!existsSync(outputDir)) {
    Deno.mkdirSync(outputDir, { recursive: true });
  }

  Deno.writeTextFileSync(OUTPUT_FILE, JSON.stringify(videos, null, 2) + "\n");
  console.log(`\nGenerated: ${OUTPUT_FILE} (${videos.length} videos)`);
}

export { main };

if (import.meta.main) {
  main();
}
