// Service Worker minimal
// Ce fichier évite l'erreur 404 pour les requêtes automatiques de service worker

self.addEventListener('install', (event) => {
  // Installation immédiate sans mise en cache
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Activation immédiate
  event.waitUntil(self.clients.claim());
});

// Pas de gestion de fetch - service worker inactif
