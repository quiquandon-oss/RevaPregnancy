// App-shell offline caching (constitution Principle V: offline-first). No Workbox — plain
// Cache API. Every page and shared CSS/JS file is precached on install (T062), so the whole
// app shell works offline from the very first launch, not just pages visited so far; anything
// not listed here (e.g. a future page) still gets covered at runtime via stale-while-revalidate.

const CACHE_NAME = "crave-and-care-v10";

const CORE_ASSETS = [
  // Pages
  "index.html",
  "dispatch.html",
  "comfort.html",
  "care.html",
  "appointment-edit.html",
  "timeline.html",
  "profile.html",
  "support-network.html",
  "partner.html",
  "onboarding.html",
  "manifest.webmanifest",
  "partner-manifest.webmanifest",
  // CSS
  "css/tokens.css",
  "css/base.css",
  "css/components.css",
  // Shared JS
  "js/app.js",
  "js/api-client.js",
  "js/identity.js",
  "js/db/local-store.js",
  "js/db/sync-queue.js",
  "js/db/profile-store.js",
  "js/db/dispatch-store.js",
  "js/db/comfort-store.js",
  "js/db/appointment-store.js",
  "js/db/support-store.js",
  "js/db/memory-store.js",
  "js/data/comfort-statuses.js",
  // Lib
  "js/lib/image-compress.js",
  // Models
  "js/models/dispatch.js",
  "js/models/comfort-entry.js",
  "js/models/appointment.js",
  "js/models/question.js",
  "js/models/support-member.js",
  "js/models/memory.js",
  // Views
  "js/views/home.js",
  "js/views/dispatch.js",
  "js/views/comfort.js",
  "js/views/care.js",
  "js/views/appointment-edit.js",
  "js/views/timeline.js",
  "js/views/profile.js",
  "js/views/support-network.js",
  "js/views/partner.js",
  "js/views/onboarding.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // cache.addAll() fails atomically — one bad path would silently break offline caching
        // for every asset, not just that one. Cache each asset independently instead, so a
        // single miss can't take down the whole app shell.
        Promise.all(
          CORE_ASSETS.map((asset) =>
            cache.add(asset).catch((error) => console.warn("service-worker: failed to precache", asset, error))
          )
        )
      )
      .then(() => self.skipWaiting())
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
