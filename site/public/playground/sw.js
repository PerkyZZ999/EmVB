// The EmVB playground's service worker: it serves images uploaded in the playground, which the
// browser keeps in Cache Storage, at /playground/uploads/… (EmVB renders only http(s) and
// same-origin image URLs, never data: URLs). Nothing else is intercepted or cached.
const CACHE = "emvb-playground-uploads-v1";
const PREFIX = "/playground/uploads/";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(PREFIX)) return;
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(url.origin + url.pathname))
      .then((hit) => hit ?? new Response("Not found", { status: 404 })),
  );
});
