// =========================================================
// sw.js — service worker : fait marcher l'app sans réseau
// Stratégie « réseau d'abord » :
//   1. on demande chaque fichier au serveur (= toujours la dernière version) ;
//   2. on range une copie dans le cache du téléphone ;
//   3. pas de réseau (ou réseau trop lent) -> on sert la copie du cache.
// Ce fichier est à la racine du site pour que son champ d'action couvre tout /lexique/.
// =========================================================

// Change ce numéro si tu ajoutes un fichier à la liste ci-dessous.
const CACHE = 'lexique-v1';

// Au-delà de ce délai sans réponse du serveur, on se rabat sur le cache.
const NETWORK_TIMEOUT_MS = 4000;

// Fichiers de l'app, téléchargés dès l'installation (chemins relatifs à sw.js).
const APP_FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/store.js',
  './js/srs.js',
  './js/import.js',
  './vendor/ts-fsrs/index.mjs',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Installation : on remplit le cache, puis on prend la place de l'ancienne version sans attendre.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' : on veut les fichiers du serveur, pas ceux du cache HTTP du navigateur
      .then((cache) => cache.addAll(APP_FILES.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

// Activation : on supprime les caches des anciennes versions et on contrôle tout de suite la page.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('lexique-') && key !== CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Chaque requête de la page passe par ici.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  // On ne s'occupe que des lectures (GET) de notre propre site
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);

  // cache: 'no-cache' : on demande toujours au serveur s'il y a du nouveau
  // (sinon le navigateur pourrait resservir une copie de GitHub Pages vieille de 10 min).
  const fromNetwork = fetch(request, { cache: 'no-cache' }).then((response) => {
    if (response.ok) cache.put(request, response.clone());   // copie pour le hors ligne
    return response;
  });
  fromNetwork.catch(() => {});   // évite une erreur « non gérée » si le cache a déjà répondu

  try {
    return await withTimeout(fromNetwork, NETWORK_TIMEOUT_MS);
  } catch {
    // Hors ligne ou trop lent : la copie du cache. Pour une page, on retombe sur index.html.
    const cached = await cache.match(request, { ignoreSearch: true })
      || (request.mode === 'navigate' && await cache.match('./index.html'));
    return cached || fromNetwork;   // rien en cache : on attend quand même le réseau
  }
}

// Rejette la promesse si elle n'a pas répondu à temps.
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Délai réseau dépassé')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}
