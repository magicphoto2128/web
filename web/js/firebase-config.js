// firebase-config.js
//
// PLACEHOLDER Firebase configuration. DO NOT commit real keys here.
// Replace every "REPLACE_ME" value with the config from your own free
// (Spark-tier) Firebase project. See web/README.md ("Firebase setup") for the
// exact steps: create the project, enable Firestore + Storage + Anonymous
// Auth, then copy the web app config object's values below.
//
// Until these values are replaced, the app shows a friendly "configure
// Firebase" banner instead of crashing.

export const firebaseConfig = {
  apiKey: 'AIzaSyCRMFkL32WGgo-fQQ_kHYeWp4ZU6LWiP8s',
  authDomain: 'magic-photo-video.firebaseapp.com',
  projectId: 'magic-photo-video',
  storageBucket: 'magic-photo-video.firebasestorage.app',
  messagingSenderId: '280570915299',
  appId: '1:280570915299:web:47254613711e13b73198d6',
  measurementId: 'G-DNTGRRRWC1',
};

/**
 * True only when every config value has been replaced (no "REPLACE_ME" left
 * and no empty values). Used to gate Firebase init and show the banner.
 * @returns {boolean}
 */
export function isFirebaseConfigured() {
  return Object.values(firebaseConfig).every(
    (v) => typeof v === 'string' && v.length > 0 && v !== 'REPLACE_ME',
  );
}
