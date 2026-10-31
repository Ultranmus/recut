// Recut service worker: makes the app installable and lets the shell and the demo open offline.
// Pages are network-first (so a new deploy shows up immediately) with the last copy as a fallback.
// Hashed build assets are cache-first. API calls and media (range requests) always go to the network.
const VERSION = "recut-v1";
const SHELL = ["/", "/studio/demo", "/offline.html", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || request.headers.has("range")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("/offline.html")))
    );
    return;
  }

  const immutable = url.pathname.startsWith("/_next/static/");
  const small = /\.(?:svg|png|jpg|jpeg|webp|ico|woff2?)$/.test(url.pathname) || url.pathname.startsWith("/pwa-icon/");
  if (!immutable && !small) return;

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res.ok && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return res;
        })
    )
  );
});
