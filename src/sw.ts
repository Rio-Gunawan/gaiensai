/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{
    revision: string | null;
    url: string;
  }>;
};

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

const adminNavigationHandler = createHandlerBoundToURL('/admin/index.html');
registerRoute(
  new NavigationRoute(adminNavigationHandler, {
    allowlist: [/^\/admin(?:\/|$)/],
  }),
);

const mainNavigationHandler = createHandlerBoundToURL('/index.html');
registerRoute(
  new NavigationRoute(mainNavigationHandler, {
    denylist: [/^\/admin(?:\/|$)/],
  }),
);

registerRoute(
  /^https:\/\/.*supabase\.co\/.*/,
  new NetworkFirst({
    cacheName: 'supabase-api',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60,
      }),
    ],
  }),
  'GET',
);
