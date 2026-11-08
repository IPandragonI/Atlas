// Which exported files the service worker precaches (pure, tested in sw-manifest.test.ts).
//  - the app shell, JS/CSS, geometry, data, workers, flags and icons: always;
//  - daily challenge files: only a window around today (they are also cached the first time they are fetched, and the app
//    prefetches the next days while online), so installing never means downloading a whole year;
//  - source maps and Next.js "RSC payload" .txt files are skipped (a navigation falls back to the cached HTML page).

const DAY_MS = 86400000;

/** "fr/index.html" -> "/fr/", "daily/x.json" -> "/daily/x.json". */
export function toUrl(file) {
  if (file === "index.html") return "/";
  if (file.endsWith("/index.html")) return "/" + file.slice(0, -"index.html".length);
  return "/" + file;
}

export function selectPrecache(files, todayISO, { ahead = 30, behind = 1 } = {}) {
  const today = Date.parse(`${todayISO}T00:00:00Z`);
  const keep = files.filter((f) => {
    if (f === "sw.js" || f.endsWith(".map") || f.endsWith(".txt")) return false;
    const m = /^daily\/(\d{4}-\d{2}-\d{2})\.json$/.exec(f);
    if (m) {
      const offset = (Date.parse(`${m[1]}T00:00:00Z`) - today) / DAY_MS;
      return offset >= -behind && offset <= ahead;
    }
    return true;
  });
  return [...new Set(keep.map(toUrl))].sort();
}
