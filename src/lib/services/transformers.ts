const CDN_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

let loadPromise: Promise<any> | null = null;

export function ensureTransformers(): Promise<any> {
  if ((window as any).transformersPipeline) {
    return Promise.resolve((window as any).transformersPipeline);
  }
  if (!loadPromise) {
    loadPromise = import(/* @vite-ignore */ CDN_URL)
      .then((mod: any) => {
        mod.env.allowLocalModels = false;
        mod.env.useBrowserCache = true;
        if (mod.env.backends?.onnx?.wasm) {
          mod.env.backends.onnx.wasm.wasmPaths = CDN_URL.replace('@huggingface/transformers@3.8.1', '@huggingface/transformers@3.8.1') + '/dist/';
        }
        (window as any).transformersPipeline = mod.pipeline;
        return mod.pipeline;
      })
      .catch((err) => {
        loadPromise = null;
        throw err;
      });
  }
  return loadPromise;
}
