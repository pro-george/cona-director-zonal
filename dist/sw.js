// Service worker minimal: face aplicația instalabilă. Nu ține date în cache, ca cifrele să fie mereu cele de pe server.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
