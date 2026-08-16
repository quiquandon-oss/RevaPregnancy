// App-shell offline caching (constitution Principle V: offline-first). No Workbox — plain
// Cache API. Core shell assets are precached on install; everything else same-origin is cached
// as it's visited (stale-while-revalidate), so pages built in later phases get covered
// automatically without editing this file every time (T062 in Polish revisits the precache list).

const CACHE_NAME = "crave-and-care-v1";

const CORE_ASSETS = [
  "index.html",
  "manifest.webmanifest",
  "css/tokens.css",
  "css/base.css",
  "css/components.css",
  "js/app.js",
  "js/api-client.js",
  "js/db/local-store.js",
  "js/db/sync-queue.js",
  "js/db/profile-store.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never cache Supabase/CDN calls
  if (url.pathname.startsWith("/supabase") ) return;

  event.respondWith(staleWhileRevalidate(request));
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    networkFetch; // update the cache in the background, don't block the response
    return cached;
  }

  const networkResponse = await networkFetch;
  if (networkResponse) return networkResponse;

  // Last resort for a navigation with nothing cached and no network: the app shell.
  if (request.mode === "navigate") {
    const shell = await cache.match("index.html");
    if (shell) return shell;
  }

  return new Response("Offline and this page hasn't been visited before.", {
    status: 503,
    headers: { "Content-Type": "text/plain" },
  });
}
