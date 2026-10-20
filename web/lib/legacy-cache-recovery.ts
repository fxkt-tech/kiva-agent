const legacyCachePrefix = "pi-web-";
const legacyWorkerPath = "/sw.js";

// This runs from network HTML rather than a Next chunk: the old Pi Web worker
// serves /_next/static/* cache-first, including development URLs reused by Kiva.
export const legacyCacheRecoveryScript = `
(async () => {
  const serviceWorker = navigator.serviceWorker;
  if (!serviceWorker) return;
  const isLegacyWorker = (worker) => {
    if (!worker) return false;
    const url = new URL(worker.scriptURL);
    return url.origin === location.origin && url.pathname === ${JSON.stringify(legacyWorkerPath)};
  };
  const controlledByLegacy = isLegacyWorker(serviceWorker.controller);
  const registrations = (await serviceWorker.getRegistrations()).filter((registration) =>
    [registration.active, registration.waiting, registration.installing].some(isLegacyWorker)
  );
  await Promise.all(registrations.map((registration) => registration.unregister()));
  if ("caches" in globalThis) {
    // A last in-flight request from the retired worker can recreate its cache.
    // Sweep orphaned Pi Web caches on the next document as well, without reload.
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(${JSON.stringify(legacyCachePrefix)})).map((key) => caches.delete(key)));
  }
  if (controlledByLegacy) location.reload();
})().catch(() => {});
`;

// Keep the historical URL available so existing registrations can update even
// before a page gets the new HTML. The replacement deliberately has no fetch
// handler and does not navigate clients, preserving any open unsent drafts.
export const legacyCacheRetirementWorker = `
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(${JSON.stringify(legacyCachePrefix)})).map((key) => caches.delete(key)));
    await self.clients.claim();
    await self.registration.unregister();
  })());
});
`;
