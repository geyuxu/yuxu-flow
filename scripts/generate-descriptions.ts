#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env --allow-net
/**
 * Generate description.md for photo albums without one
 * Uses: Claude CLI > Gemini CLI > OpenAI API (in order of preference)
 * With timeout and error handling for graceful fallback
 *
 * Usage:
 *   deno run --allow-read --allow-write --allow-run --allow-env --allow-net scripts/generate-descriptions.ts
 */

import { join, dirname, basename } from "@std/path";

const __dirname = dirname(import.meta.filename!);
const PHOTOS_DIR = join(__dirname, "..", "photos");
const TIMEOUT_MS = 60000; // 60 seconds

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

// Available AI tools
const hasClaude = commandExists("claude");
const hasGemini = commandExists("gemini");
const hasOpenAI = !!Deno.env.get("OPENAI_API_KEY");

// Check if output looks like an error
function isErrorResponse(output: string): boolean {
  // Empty or null
  if (!output || output === "null") return true;

  // Common error patterns
  if (/error|rate.?limit|quota|exceeded|unauthorized|invalid|failed|timeout|exception/i.test(output)) {
    return true;
  }

  // Too short to be a valid description
  if (output.length < 20) return true;

  return false;
}

// Run command with timeout
async function runWithTimeout(
  cmd: Deno.Command,
  timeoutMs: number
): Promise<{ success: boolean; stdout: string; stderr: string; timedOut: boolean }> {
  const process = cmd.spawn();

  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    try {
      process.kill("SIGTERM");
    } catch {
      // Ignore kill errors
    }
  }, timeoutMs);

  try {
    const output = await process.output();
    clearTimeout(timeoutId);

    return {
      success: output.success && !timedOut,
      stdout: new TextDecoder().decode(output.stdout),
      stderr: new TextDecoder().decode(output.stderr),
      timedOut,
    };
  } catch {
    clearTimeout(timeoutId);
    return {
      success: false,
      stdout: "",
      stderr: "",
      timedOut,
    };
  }
}

// Generate description using Claude CLI
async function generateWithClaude(location: string, date: string): Promise<string | null> {
  const prompt = `Generate a short, evocative 1-2 sentence description for a photo album titled '${location}' taken on ${date}. The description should be poetic yet informative, suitable for a photography portfolio. Output only the description text, no quotes or extra formatting.`;

  const cmd = new Deno.Command("claude", {
    args: ["-p", prompt, "--dangerously-skip-permissions"],
    stdout: "piped",
    stderr: "piped",
  });

  const result = await runWithTimeout(cmd, TIMEOUT_MS);

  if (result.timedOut) {
    console.error(`  [Claude CLI timeout after ${TIMEOUT_MS / 1000}s]`);
    return null;
  }

  if (!result.success || isErrorResponse(result.stdout)) {
    console.error("  [Claude CLI error or invalid response]");
    return null;
  }

  return result.stdout.trim();
}

// Generate description using Gemini CLI
async function generateWithGemini(location: string, date: string): Promise<string | null> {
  const prompt = `Generate a short, evocative 1-2 sentence description for a photo album titled '${location}' taken on ${date}. The description should be poetic yet informative, suitable for a photography portfolio. Output only the description text, no quotes or extra formatting.`;

  const cmd = new Deno.Command("gemini", {
    args: [prompt, "-y"],
    stdout: "piped",
    stderr: "piped",
  });

  const result = await runWithTimeout(cmd, TIMEOUT_MS);

  if (result.timedOut) {
    console.error(`  [Gemini CLI timeout after ${TIMEOUT_MS / 1000}s]`);
    return null;
  }

  if (!result.success || isErrorResponse(result.stdout)) {
    console.error("  [Gemini CLI error or invalid response]");
    return null;
  }

  return result.stdout.trim();
}

// Generate description using OpenAI API
async function generateWithOpenAI(location: string, date: string): Promise<string | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return null;

  const prompt = `Generate a short, evocative 1-2 sentence description for a photo album titled '${location}' taken on ${date}. The description should be poetic yet informative, suitable for a photography portfolio. Output only the description text, no quotes or extra formatting.`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`  [OpenAI API error: ${response.status}]`);
      return null;
    }

    const data = await response.json();

    // Check for API error in response
    if (data.error) {
      console.error(`  [OpenAI API error: ${data.error.message || data.error.type}]`);
      return null;
    }

    const output = data.choices?.[0]?.message?.content;

    if (isErrorResponse(output)) {
      console.error("  [OpenAI API invalid response]");
      return null;
    }

    return output.trim();
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      console.error(`  [OpenAI API timeout after ${TIMEOUT_MS / 1000}s]`);
    } else {
      console.error(`  [OpenAI API error: ${(err as Error).message}]`);
    }
    return null;
  }
}

// Generate description with fallback
async function generateDescription(location: string, date: string): Promise<string | null> {
  if (hasClaude) {
    console.error("  Trying Claude CLI...");
    const result = await generateWithClaude(location, date);
    if (result) return result;
    console.error("  Fallback from Claude CLI...");
  }

  if (hasGemini) {
    console.error("  Trying Gemini CLI...");
    const result = await generateWithGemini(location, date);
    if (result) return result;
    console.error("  Fallback from Gemini CLI...");
  }

  if (hasOpenAI) {
    console.error("  Trying OpenAI API...");
    const result = await generateWithOpenAI(location, date);
    if (result) return result;
    console.error("  Fallback from OpenAI API...");
  }

  console.error("  All AI tools failed");
  return null;
}

// Parse folder name: "20260120-Leeds" -> { date, location }
function parseFolderName(folder: string): { date: string; location: string } | null {
  const match = folder.match(/^(\d{4})(\d{2})(\d{2})-(.+)$/);
  if (!match) return null;

  const [, year, month, day, location] = match;
  // Remove "Part N" suffix for cleaner location
  const cleanLocation = location.replace(/ Part \d+$/i, "").replace(/_/g, " ");

  return {
    date: `${year}-${month}-${day}`,
    location: cleanLocation,
  };
}

// Main
async function main() {
  console.log("=== Generating Missing Descriptions ===");

  if (!hasClaude && !hasGemini && !hasOpenAI) {
    console.log("No AI tools available (need claude CLI, gemini CLI, or OPENAI_API_KEY)");
    return;
  }

  const available: string[] = [];
  if (hasClaude) available.push("Claude CLI");
  if (hasGemini) available.push("Gemini CLI");
  if (hasOpenAI) available.push("OpenAI API");

  console.log(`Available: ${available.join(", ")}`);
  console.log(`Timeout: ${TIMEOUT_MS / 1000}s per request`);
  console.log("");

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  if (!existsSync(PHOTOS_DIR)) {
    console.log("No photos directory found");
    return;
  }

  // Scan year directories
  for (const yearEntry of Deno.readDirSync(PHOTOS_DIR)) {
    if (!yearEntry.isDirectory || !/^\d{4}$/.test(yearEntry.name)) {
      continue;
    }

    const yearDir = join(PHOTOS_DIR, yearEntry.name);
    const year = yearEntry.name;

    // Scan album directories
    for (const albumEntry of Deno.readDirSync(yearDir)) {
      if (!albumEntry.isDirectory) continue;

      const albumDir = join(yearDir, albumEntry.name);
      const album = albumEntry.name;

      // Skip if description already exists
      if (
        existsSync(join(albumDir, "description.md")) ||
        existsSync(join(albumDir, "description.txt"))
      ) {
        skipped++;
        continue;
      }

      // Parse folder name
      const parsed = parseFolderName(album);
      if (!parsed) {
        console.log(`⚠ Skip: ${year}/${album} (invalid format)`);
        continue;
      }

      console.log(`Generating: ${year}/${album}`);

      const description = await generateDescription(parsed.location, parsed.date);
      if (description) {
        Deno.writeTextFileSync(join(albumDir, "description.md"), description);
        console.log(`✓ Created: ${albumDir}/description.md`);
        generated++;
      } else {
        console.log(`✗ Failed: ${year}/${album} (all tools failed)`);
        failed++;
      }
      console.log("");
    }
  }

  console.log(`Done! Generated: ${generated}, Skipped: ${skipped}, Failed: ${failed}`);
}

main();
