// Bundles the challenge-generation Web Worker (engine + dataset) into public/workers/generate.worker.js.
// Next/Turbopack copies `new Worker(new URL("x.ts", import.meta.url))` as a raw .ts asset instead of bundling it,
// so the worker is built here with esbuild (same idea as the vendored MapLibre worker). The file is served by the
// static export and precached by the service worker. Generated: do not edit, not committed.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outfile = path.join(root, "public/workers/generate.worker.js");

const result = await build({
  entryPoints: [path.join(root, "src/workers/generate.worker.ts")],
  outfile,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
  legalComments: "none",
  tsconfig: path.join(root, "tsconfig.json"), // resolves the "@/..." alias
  logLevel: "warning",
  metafile: true,
});
const kb = Object.values(result.metafile.outputs)[0].bytes / 1024;
console.log(`generation worker built: public/workers/generate.worker.js (${kb.toFixed(0)} KB)`);
