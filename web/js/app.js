// app.js — application bootstrap (the module entry loaded by index.html).
//
// Responsibilities:
//   - If Firebase is configured, initialize it and sign in anonymously.
//   - Register the four routes with the hash router.
//   - Register the service worker (guarded, non-fatal on file://).

import { isFirebaseConfigured } from './firebase-config.js';
import { initFirebase, signInAnon } from './firebase-service.js';
import { initRouter } from './router.js';
import { showToast } from './ui.js';

import { renderHome } from './screens/home.js';
import { renderUpload } from './screens/upload.js';
import { renderDetail } from './screens/detail.js';
import { renderScan } from './screens/scan.js';

async function boot() {
  const root = document.getElementById('app');

  // Firebase init + anonymous sign-in. Never let a failure crash the UI; the
  // screens show a friendly banner when unconfigured, and a toast on error.
  if (isFirebaseConfigured()) {
    try {
      initFirebase();
      await signInAnon();
    } catch (err) {
      console.error('Firebase init/sign-in failed:', err);
      showToast('Could not connect to Firebase. Check your config and network.');
    }
  }

  // Routes: hash path -> screen render function.
  initRouter(root, {
    '#/home': renderHome,
    '#/upload': renderUpload,
    '#/detail/:id': renderDetail,
    '#/scan': renderScan,
  });

  registerServiceWorker();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // The service worker only works over a secure context; a file:// open throws.
  // Catch and log so it is never fatal.
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./service-worker.js')
      .catch((err) => console.warn('Service worker registration skipped/failed:', err));
  });
}

boot();
