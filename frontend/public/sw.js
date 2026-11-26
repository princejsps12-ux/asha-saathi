// ASHA Saathi service worker: lets the app OPEN with no network (the visit flow then keeps
// what she says on the phone and syncs later). API calls are never cached.
const CACHE = 'asha-shell-v1'
const SHELL = ['/', '/favicon.svg', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  if (event.request.mode === 'navigate') {
    // Network first, so a new deploy is picked up; the cached page when offline.
    event.respondWith(fetch(event.request)
      .then((res) => { caches.open(CACHE).then((c) => c.put('/', res.clone())); return res })
      .catch(() => caches.match('/')))
    return
  }
  // Hashed build assets never change: cache first.
  event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(event.request, copy)) }
    return res
  })))
})
