/* Sponge Clock — PWA service worker (offline app shell).
   Only used when the app is hosted over http(s); the Chrome extension
   has its own background.js and never registers this. */
const CACHE = "sponge-clock-v3";
const ASSETS = [
  "timer.html", "timer.css", "timer.js",
  "engine.js", "sound.js", "voice.js", "cues.js",
  "manifest.webmanifest",
  "icons/icon192.png", "icons/icon512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first for app assets, fall back to network.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) =>
      hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("timer.html"))
    )
  );
});
