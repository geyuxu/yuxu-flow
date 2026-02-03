#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env --allow-net
/**
 * Convert HTML tables to PNG images
 * Uses Puppeteer to render tables as images
 * Run: deno run --allow-all blog/table-to-image.ts
 */

import { join, dirname } from "@std/path";
import puppeteer from "npm:puppeteer@^23";

const __dirname = dirname(import.meta.filename!);
export const OUTPUT_DIR = join(__dirname, "images", "tables");

// Ensure output directory exists
function ensureDir(dir: string): void {
  try {
    Deno.mkdirSync(dir, { recursive: true });
  } catch {
    // Directory exists
  }
}

ensureDir(OUTPUT_DIR);

/**
 * Convert HTML table to PNG image
 * @param tableHtml - The HTML table string
 * @param filename - Output filename (without extension)
 * @returns Path to the generated image
 */
// Find system Chrome/Chromium
function findChrome(): string | undefined {
  const paths = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  for (const p of paths) {
    try {
      Deno.statSync(p);
      return p;
    } catch {
      // Continue
    }
  }
  return undefined;
}

export async function tableToImage(
  tableHtml: string,
  filename: string
): Promise<string> {
  const executablePath = findChrome();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
  });
  const page = await browser.newPage();

  // Set viewport for crisp rendering
  await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 2 });

  // Create styled HTML page with the table
  const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: white;
            padding: 16px;
        }
        table {
            border-collapse: collapse;
            font-size: 14px;
            width: 100%;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 10px 14px;
            text-align: left;
        }
        th {
            background: #f5f5f5;
            font-weight: 600;
            color: #333;
        }
        td {
            color: #444;
        }
        tr:nth-child(even) td {
            background: #fafafa;
        }
        strong { font-weight: 600; }
        code {
            font-family: "SF Mono", Monaco, monospace;
            font-size: 0.9em;
            background: #f0f0f0;
            padding: 2px 6px;
            border-radius: 3px;
        }
    </style>
</head>
<body>
    ${tableHtml}
</body>
</html>`;

  await page.setContent(html, { waitUntil: "networkidle0" });

  // Get the table element and take screenshot
  const table = await page.$("table");
  if (!table) {
    await browser.close();
    throw new Error("No table found in HTML");
  }

  const outputPath = join(OUTPUT_DIR, `${filename}.png`);
  await table.screenshot({ path: outputPath, omitBackground: false });

  await browser.close();

  return outputPath;
}

/**
 * Generate hash for table content (for caching)
 */
export async function hashTable(html: string): Promise<string> {
  const data = new TextEncoder().encode(html);
  const hashBuffer = await crypto.subtle.digest("MD5", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 8);
}

// CLI usage
if (import.meta.main) {
  const testTable = `
    <table>
        <tr><th>Layer</th><th>Problem</th><th>Solution</th></tr>
        <tr><td><strong>Data</strong></td><td>Coordinate system mismatch</td><td>CRS transformation + iterative inversion</td></tr>
        <tr><td><strong>Network</strong></td><td>Connection overhead, transient failures</td><td>Persistent pool + exponential backoff</td></tr>
        <tr><td><strong>System</strong></td><td>Quota exhaustion</td><td>Token bucket rate limiting</td></tr>
    </table>`;

  console.log("Testing table-to-image conversion...");
  try {
    const p = await tableToImage(testTable, "test-table");
    console.log(`✓ Image saved: ${p}`);
  } catch (e) {
    console.error(`✗ Error: ${(e as Error).message}`);
  }
}
