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
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME',
  projectId: 'REPLACE_ME',
  storageBucket: 'REPLACE_ME',
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME',
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
