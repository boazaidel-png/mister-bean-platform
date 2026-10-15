const CACHE_NAME = "mister-bean-shell-v26";
const APP_ROOT = "/";
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

  // Other pages (such as the public tasting survey) must never be served
  // from, or saved as, the cached management app shell.
  if (request.mode === "navigate" && url.pathname !== APP_ROOT) return;

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

// Push notifications from the server (functions/src/push.ts). Messages are
// data-only, so this is the one place that shows them.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    const message = event.data ? event.data.json() : {};
    payload = message.data || message;
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Mister Bean", {
      body: payload.body || "",
      tag: payload.tag || undefined,
      renotify: Boolean(payload.tag),
      dir: "rtl",
      lang: "he",
      icon: `${APP_ROOT}app-icon-192.png`,
      badge: `${APP_ROOT}app-icon-192.png`,
      data: { link: payload.link || APP_ROOT },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = new URL(event.notification.data?.link || APP_ROOT, self.location.origin);
  if (link.origin !== self.location.origin || !link.pathname.startsWith(APP_ROOT)) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).pathname === APP_ROOT);
      if (open) {
        open.postMessage({ type: "open-view", view: link.searchParams.get("view") || "" });
        return open.focus();
      }
      return self.clients.openWindow(link.href);
    }),
  );
});
