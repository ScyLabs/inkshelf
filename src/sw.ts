/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import {
  Serwist,
  CacheFirst,
  StaleWhileRevalidate,
  ExpirationPlugin,
  CacheableResponsePlugin,
  type PrecacheEntry,
} from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[];
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  fallbacks: {
    entries: [
      {
        url: '/',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
  runtimeCaching: [
    // Custom rules FIRST — must match before defaultCache's generic /api/* handler
    {
      matcher: /\/api\/img\//,
      handler: new CacheFirst({
        cacheName: "proxy-images",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 50000,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          }),
          new CacheableResponsePlugin({ statuses: [200] }),
        ],
      }),
    },
    {
      matcher: /\/api\/manga(?:$|\/)/,
      handler: new StaleWhileRevalidate({
        cacheName: "manga-list",
        plugins: [
          new ExpirationPlugin({ maxAgeSeconds: 30 * 24 * 60 * 60 }),
          new CacheableResponsePlugin({ statuses: [200] }),
        ],
      }),
    },
    ...defaultCache,
  ],
});

self.addEventListener('push', (event) => {
  let title = 'New Chapter';
  let body = '';
  let data: Record<string, string> | undefined;

  if (event.data) {
    try {
      const payload = event.data.json();
      title = payload.title ?? title;
      body = payload.body ?? body;
      data = payload.data;
    } catch {
      // malformed payload — use defaults
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192x192.png',
      tag: data?.url ?? 'default',
      data,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const targetPath = new URL(url, self.location.origin).pathname;
      for (const client of clients) {
        if (new URL(client.url).pathname === targetPath && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

// Manual event registration instead of serwist.addEventListeners()
// so we can wrap the fetch handler with an offline navigation fallback.
self.addEventListener('install', serwist.handleInstall);
self.addEventListener('activate', serwist.handleActivate);
self.addEventListener('message', serwist.handleCache);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const responsePromise = serwist.handleRequest({ request, event });

  if (responsePromise) {
    event.respondWith(
      responsePromise.catch(async () => {
        // When a navigation fails (offline + cache miss), try offline-pages cache for reader routes
        if (request.mode === 'navigate') {
          const url = new URL(request.url);
          if (url.pathname.startsWith('/read/')) {
            const pageCache = await caches.open('offline-pages');
            const cached = await pageCache.match(url.pathname);
            if (cached) return cached;
          }
          const fallback = await serwist.matchPrecache('/');
          if (fallback) return fallback;
        }
        return Response.error();
      }),
    );
  } else if (request.mode === 'navigate') {
    // No route matched this navigation — try offline-pages cache for reader routes, then precached home
    event.respondWith(
      (async () => {
        const url = new URL(request.url);
        if (url.pathname.startsWith('/read/')) {
          const pageCache = await caches.open('offline-pages');
          const cached = await pageCache.match(url.pathname);
          if (cached) return cached;
        }
        return (await serwist.matchPrecache('/')) ?? Response.error();
      })(),
    );
  }
});
