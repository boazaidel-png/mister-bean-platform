const CACHE_NAME = "mister-bean-shell-v7";
const APP_ROOT = "/mister-bean-platform/";
const STATIC_ASSETS = [
  APP_ROOT,
  `${APP_ROOT}manifest.webmanifest`,
  `${APP_ROOT}app-icon-192.png`,
  `${APP_ROOT}app-icon-512.png`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(APP_ROOT)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      caches.match(APP_ROOT).then((cached) => {
        const network = fetch(request).then((response) => {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(APP_ROOT, copy));
          return response;
        });
        if (!cached) return network;

        // On weak mobile reception, show the saved app shell quickly while
        // the fresh version keeps downloading for the next navigation.
        const quickFallback = new Promise((resolve) => {
          setTimeout(() => resolve(cached), 2500);
        });
        return Promise.race([network, quickFallback]).catch(() => cached);
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const refreshed = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || refreshed;
    }),
  );
});
const CACHE_NAME = "mister-bean-shell-v6";
const APP_ROOT = "/mister-bean-platform/";
const STATIC_ASSETS = [
  APP_ROOT,
  `${APP_ROOT}manifest.webmanifest`,
  `${APP_ROOT}app-icon-192.png`,
  `${APP_ROOT}app-icon-512.png`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(APP_ROOT)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      caches.match(APP_ROOT).then((cached) => {
        const network = fetch(request).then((response) => {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(APP_ROOT, copy));
          return response;
        });
        if (!cached) return network;

        // On weak mobile reception, show the saved app shell quickly while
        // the fresh version keeps downloading for the next navigation.
        const quickFallback = new Promise((resolve) => {
          setTimeout(() => resolve(cached), 2500);
        });
        return Promise.race([network, quickFallback]).catch(() => cached);
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const refreshed = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || refreshed;
    }),
  );
});
