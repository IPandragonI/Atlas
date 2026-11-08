// MapLibre 6 ships its web worker as a separate ES module that bundlers cannot resolve.
// We vendor it into public/ (served + precached by the service worker) and point MapLibre at it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs");
const dest = path.join(root, "public/vendor/maplibre-gl-worker.mjs");
if (!fs.existsSync(src)) {
  console.warn("maplibre-gl not installed yet; skipping worker copy");
  process.exit(0);
}
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log("copied maplibre worker ->", path.relative(root, dest));
