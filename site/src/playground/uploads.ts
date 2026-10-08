import type { UploadStore } from "./mock/backend.ts";

/** Must match public/playground/sw.js. */
const CACHE = "emvb-playground-uploads-v1";
const WORKER = "/playground/sw.js";
const SCOPE = "/playground/";

/**
 * Image uploads in the playground: the file goes to Cache Storage and the playground's service
 * worker serves it at its /playground/uploads/ path, to the editor canvas and the view page alike.
 * Null when the browser can't do that (no service workers, private modes): uploads are refused.
 */
export function browserUploads(): UploadStore | null {
  if (!("serviceWorker" in navigator) || typeof caches === "undefined") return null;
  const ready = navigator.serviceWorker
    .register(WORKER, { scope: SCOPE })
    .then(() => navigator.serviceWorker.ready)
    .catch(() => null);
  return {
    put: async (path, file) => {
      if (!(await ready)) throw new Error("No service worker");
      const cache = await caches.open(CACHE);
      await cache.put(
        new Request(new URL(path, window.location.origin)),
        new Response(file, { headers: { "content-type": file.type, "cache-control": "no-store" } }),
      );
    },
    clear: async () => {
      await caches.delete(CACHE);
    },
  };
}

/** Starts the service worker on pages that only show uploads (the view page). */
export function serveUploads(): void {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(WORKER, { scope: SCOPE }).catch(() => undefined);
  }
}
