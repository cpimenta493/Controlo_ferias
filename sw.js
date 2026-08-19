/* Service Worker — funcionamento offline
   Estratégia: REDE PRIMEIRO (quando há internet, mostra sempre a versão
   mais recente); a cache serve apenas de reserva quando estás offline. */
const CACHE = 'ferias-gastos-v11';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './firebase-config.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Só tratamos pedidos do próprio site. Tudo o resto (ex.: Firebase,
  // Google) passa direto para a rede sem passar pela cache.
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      // Guarda uma cópia atualizada para uso offline
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() =>
      // Sem rede: usa a versão em cache (ou o index como reserva)
      caches.match(e.request).then(c => c || caches.match('./index.html'))
    )
  );
});
