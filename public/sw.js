/*
 * Development stub. The real service worker is generated into out/sw.js by scripts/build-sw.mjs
 * (that file overwrites this one in every production build).
 *
 * In `next dev` there is no service worker. A browser that still has an old one registered for this origin
 * (e.g. from a previous production run on the same port) asks for /sw.js: this stub makes it clean up after
 * itself (delete caches, unregister, reload) instead of failing the request.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) await caches.delete(key);
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url);
    })(),
  );
});
