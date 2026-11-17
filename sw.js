/* Un passo: service worker. Network-first con fallback sulla cache, più le Web Push dei promemoria.
   Ad ogni rilascio alza la versione di CACHE. */
const CACHE = 'un-passo-v11';
const PRECACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/core.js',
  '/oggi.js',
  '/inizia.js',
  '/timer.js',
  '/aiuto.js',
  '/altro.js',
  '/agenda.js',
  '/sistemi.js',
  '/emozioni.js',
  '/motivazione.js',
  '/progressi.js',
  '/avvisi.js',
  '/site.webmanifest',
  '/icons/apple-icon-180.png',
  '/icons/favicon-196.png',
  '/icons/manifest-icon-192.maskable.png',
  '/icons/manifest-icon-512.maskable.png'
];
const ICON = '/icons/manifest-icon-192.maskable.png';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' evita di precaricare copie vecchie dalla cache HTTP
      .then((cache) => Promise.all(PRECACHE.map((url) =>
        cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const home = (await cache.match('/index.html')) || (await cache.match('/'));
        if (home) return home;
      }
      return new Response('Sei offline e questa risorsa non è ancora salvata.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});

/* ---------- promemoria: testi in IndexedDB (unpasso-avvisi v2: store testi, chiave = id; store meta, {k, v}) ---------- */
const WORKER = 'https://avvisi-unpasso.070293.xyz';

function apriDb() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('unpasso-avvisi', 2);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains('testi')) open.result.createObjectStore('testi', { keyPath: 'id' });
      if (!open.result.objectStoreNames.contains('meta')) open.result.createObjectStore('meta', { keyPath: 'k' });
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => resolve(open.result);
  });
}
function leggi(store, chiave) {
  return apriDb().then((db) => new Promise((resolve) => {
    try {
      const req = db.transaction(store, 'readonly').objectStore(store).get(chiave);
      req.onsuccess = () => { db.close(); resolve(req.result || null); };
      req.onerror = () => { db.close(); resolve(null); };
    } catch (e) { db.close(); resolve(null); }
  })).catch(() => null);
}
const leggiTesto = (id) => leggi('testi', id);
const leggiMeta = (k) => leggi('meta', k).then((r) => (r ? r.v : null));

function b64ToU8(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

self.addEventListener('push', (event) => {
  let dati = {};
  try { dati = event.data ? event.data.json() : {}; } catch (e) { dati = {}; }
  const id = typeof dati.id === 'string' ? dati.id : '';
  // su iOS ogni push deve mostrare una notifica: showNotification si chiama sempre
  event.waitUntil(leggiTesto(id).then((x) => {
    // avviso «una»: se l'orario della push è lontano da quello del testo salvato (oltre 120 s), il testo è di un altro avviso
    if (x && typeof x.quando === 'number' && typeof dati.t === 'number' && Math.abs(dati.t - x.quando) > 120000) x = null;
    const titolo = (x && x.title) || 'Un passo';
    return self.registration.showNotification(titolo, {
      body: (x && x.body) || 'Hai un promemoria.',
      tag: id || 'promemoria',
      icon: ICON,
      data: { id: id, t: dati.t || null, go: (x && x.go) || '', taskId: (x && x.taskId) || '' }
    });
  }));
});

// L'iscrizione è cambiata o scaduta: se ci sono chiave e piano nel telefono, ci si riscrive da soli.
// Se qualcosa va storto non succede niente: ci pensa l'app alla prossima apertura.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const chiave = await leggiMeta('chiave');
      if (!chiave) return;
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(chiave) });
      const piano = await leggiMeta('piano');
      const j = sub.toJSON();
      if (!piano || !j.keys) return;
      await fetch(WORKER + '/piano', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth }, fuso: piano.fuso, avvisi: piano.avvisi })
      });
    } catch (e) { /* nessun errore */ }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const q = new URLSearchParams();
  if (d.go) q.set('go', d.go);
  if (d.taskId) q.set('taskId', d.taskId);
  const url = '/' + (q.toString() ? '?' + q.toString() : '');
  event.waitUntil((async () => {
    const lista = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const aperta = lista.find((c) => new URL(c.url).origin === self.location.origin);
    if (aperta) {
      // finestra già aperta: la si porta davanti e le si dice dove andare
      try { aperta.postMessage({ tipo: 'avvisi-apri', go: d.go || '', taskId: d.taskId || '' }); } catch (e) { /* ignora */ }
      try { await aperta.focus(); } catch (e) { /* ignora */ }
      return;
    }
    await self.clients.openWindow(url);
  })());
});
