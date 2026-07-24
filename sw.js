/* GearUp service worker — makes repeat visits fast and low-data.
   Bump CACHE_V whenever you want every device to refresh cached media. */
const CACHE_V = 'gearup-v1';
const CORE = [
  '/', '/index.html', '/portal.html', '/login.html', '/reset.html', '/reader.html',
  '/favicon.svg', '/favicon-32.png', '/apple-touch-icon.png',
  '/fan_web.png', '/portal_banner.jpg', '/og-image.jpg',
  '/covers/design.jpg', '/covers/fea.jpg', '/covers/cfd.jpg',
  '/covers/biw.jpg', '/covers/plastics.jpg', '/covers/sjh.jpg'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_V)
      .then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))) // per-file, one miss won't break the rest
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function netFirst(req) {
  return fetch(req).then(r => {
    if (r && r.ok) { const cp = r.clone(); caches.open(CACHE_V).then(c => c.put(req, cp)); }
    return r;
  }).catch(() => caches.match(req).then(m => m || (req.mode === 'navigate' ? caches.match('/index.html') : undefined)));
}
function cacheFirst(req) {
  return caches.match(req).then(m => m || fetch(req).then(r => {
    if (r && (r.ok || r.type === 'opaque')) { const cp = r.clone(); caches.open(CACHE_V).then(c => c.put(req, cp)); }
    return r;
  }).catch(() => undefined));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Never touch the API or the gated book data / auth calls — always go to network.
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase.co')) return;

  const isMedia = /\.(jpg|jpeg|png|svg|webp|gif|ico|woff2?|ttf)$/i.test(url.pathname)
    || url.hostname.includes('fonts.gstatic') || url.hostname.includes('fonts.googleapis');
  const isLib = url.hostname.includes('jsdelivr') || url.hostname.includes('cdnjs');

  // Media, fonts and CDN libraries: serve from cache first (instant, no data).
  if (isMedia || isLib) { e.respondWith(cacheFirst(req)); return; }

  // Pages and same-origin scripts: network first so updates always arrive, cache as fallback (offline).
  if (req.mode === 'navigate' || (url.origin === location.origin && url.pathname.endsWith('.js'))) {
    e.respondWith(netFirst(req)); return;
  }
});
