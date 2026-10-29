/* Move service worker.
 * - Makes the app installable as a real app (Android Chrome installs it as an app, not a browser shortcut).
 * - Keeps the app's own files so it opens fast and the shell opens with no connection.
 * - Never touches anything that is not Move's own GET files: Firebase, tiles, maps and APIs always go to the network.
 * Bump VERSION to drop old caches. */
const VERSION = "move-v3";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll([OFFLINE, "/move-mark.png", "/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isStaticAsset = (url) => url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/images/routes/") || /\.(?:png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url.pathname) || url.pathname.startsWith("/geo/");

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Firebase, map tiles, fonts: always the network
  if (url.pathname === "/sw.js") return;

  // Move's own files (hashed build files, photos, icons, boundaries): cache first, filled on first use
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // pages: the network first (so the app is never stale), the last copy of that page if offline, then the offline page
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // the copy has to be taken now, before the page starts using the response
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req, { ignoreVary: true })) || (await caches.match(OFFLINE)) || Response.error()),
    );
  }
});
