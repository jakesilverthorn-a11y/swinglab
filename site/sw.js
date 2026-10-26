/*
  SwingLab service worker. After the first visit the app opens offline: the page and its files are cached as they
  are used, including the pose runtime and model (about 40 MB, downloaded once).
  Bump VERSION when the files in public/ change.
*/
const VERSION = 'swinglab-v4';
const SHELL = ['./', 'manifest.webmanifest', 'favicon.svg', 'apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).catch(() => undefined));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// `response` must be a clone made before the original is handed to the page, which would otherwise lock its body.
async function remember(request, response) {
  if (!response || !response.ok || response.type === 'opaque') return;
  try {
    const cache = await caches.open(VERSION);
    await cache.put(request, response);
  } catch {
    /* storage full or blocked: carry on without caching */
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const home = new URL('./', self.registration.scope).href;

  // Pages: try the network so updates arrive, fall back to the cached copy when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          event.waitUntil(remember(new Request(home), response.clone()));
          return response;
        } catch {
          return (await caches.match(home)) || Response.error();
        }
      })(),
    );
    return;
  }

  // Everything else: use the cached copy, and fill the cache the first time.
  event.respondWith(
    (async () => {
      const hit = await caches.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      event.waitUntil(remember(request, response.clone()));
      return response;
    })(),
  );
});
