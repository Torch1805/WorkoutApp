// Offline support: serve this app's own files from cache, refresh them in the
// background. Only same-origin GET requests are handled; nothing else is touched.
const CACHE = 'lift-v2';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './store.js', './recommend.js',
  './exercises.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const cache = caches.open(CACHE);
  const fresh = cache.then(c => fetch(e.request).then(res => {
    if (res.ok && res.type === 'basic') c.put(e.request, res.clone());
    return res;
  }));
  e.waitUntil(fresh.catch(() => {}));
  e.respondWith(cache.then(c => c.match(e.request, { ignoreSearch: true })).then(cached => cached || fresh));
});
