/**
 * Custom voy-search loader for deno compile compatibility.
 *
 * The npm package's entry (voy_search.js) does:
 *   import * as wasm from "./voy_search_bg.wasm"
 * which fails in deno compile (WASM ESM imports not supported).
 *
 * This loader bypasses that by:
 * 1. Importing only the JS bindings (voy_search_bg.js) - pure JS, no WASM
 * 2. Reading the .wasm file as raw bytes
 * 3. Instantiating via WebAssembly.instantiate()
 * 4. Wiring up with __wbg_set_wasm()
 */

// deno-lint-ignore-file no-explicit-any

// Import only the JS bindings (no WASM import involved)
import * as bg from "npm:voy-search@0.6.3/voy_search_bg.js";

// Resolve WASM file path relative to the JS bindings
const bgJsUrl = import.meta.resolve("npm:voy-search@0.6.3/voy_search_bg.js");
const wasmUrl = new URL("./voy_search_bg.wasm", bgJsUrl);

// Read WASM as raw bytes (works in both deno run and deno compile)
const wasmBytes = await Deno.readFile(wasmUrl);

// Instantiate WASM with the JS bindings as imports
const { instance } = await WebAssembly.instantiate(wasmBytes, {
  "./voy_search_bg.js": bg as unknown as Record<string, WebAssembly.ImportValue>,
});

// Wire up the WASM instance to the JS bindings
(bg as any).__wbg_set_wasm(instance.exports);

// Re-export the Voy class (now fully functional)
export const Voy = (bg as any).Voy;
