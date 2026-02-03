/**
 * Voy WASM Loader for Browser
 * Handles WASM initialization properly in browser environment
 */

let Voy = null;

export async function initVoy() {
    if (Voy) return Voy;

    // Import the JS bindings first
    const bg = await import('/public/lib/voy_search_bg.js');

    // Load and instantiate WASM with streaming
    const wasmResponse = await fetch('/public/lib/voy_search_bg.wasm');
    const wasmModule = await WebAssembly.instantiateStreaming(wasmResponse, {
        './voy_search_bg.js': bg
    });

    // Initialize the module with WASM exports
    bg.__wbg_set_wasm(wasmModule.instance.exports);

    Voy = bg.Voy;
    return Voy;
}

export async function getVoy() {
    return await initVoy();
}
