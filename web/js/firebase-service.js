// firebase-service.js
//
// Thin wrapper over Firebase Auth / Firestore / Storage using the modular
// (v10) Firebase JS SDK loaded from the gstatic CDN. Mirrors the Flutter app's
// FirebaseService: anonymous sign-in, upload a photo + video pair (or a video
// URL), stream the current user's photos, and fetch all records for scan
// matching.
//
// All four CDN imports are pinned to the same version (10.14.1).

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  onSnapshot,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';
import { matcher } from './image-matcher.js';
import { magicPhotoFromDoc, magicPhotoToMap, createMagicPhoto } from './models.js';

const COLLECTION = 'magic_photos';

let _app = null;
let _auth = null;
let _db = null;
let _storage = null;

/** Error thrown when Firebase has not been configured yet. The UI catches this. */
export class FirebaseNotConfiguredError extends Error {
  constructor(message = 'Firebase is not configured. Add your keys to firebase-config.js.') {
    super(message);
    this.name = 'FirebaseNotConfiguredError';
  }
}

function assertConfigured() {
  if (!isFirebaseConfigured()) throw new FirebaseNotConfiguredError();
}

/**
 * Initialize the Firebase app + Auth/Firestore/Storage handles. Guarded on
 * isFirebaseConfigured(); safe to call more than once.
 */
export function initFirebase() {
  assertConfigured();
  if (_app) return;
  _app = initializeApp(firebaseConfig);
  _auth = getAuth(_app);
  _db = getFirestore(_app);
  _storage = getStorage(_app);
}

/**
 * Ensure an anonymous user is signed in; resolves with the uid.
 * @returns {Promise<string>}
 */
export function signInAnon() {
  assertConfigured();
  if (!_auth) initFirebase();
  return new Promise((resolve, reject) => {
    if (_auth.currentUser) {
      resolve(_auth.currentUser.uid);
      return;
    }
    // Wait for the first auth state, then sign in if still anonymous-absent.
    const unsub = onAuthStateChanged(_auth, (user) => {
      if (user) {
        unsub();
        resolve(user.uid);
      }
    });
    signInAnonymously(_auth).catch((err) => {
      unsub();
      reject(err);
    });
  });
}

/** The current anonymous uid, or null if not signed in yet. */
export function currentUid() {
  return _auth && _auth.currentUser ? _auth.currentUser.uid : null;
}

/**
 * Upload a photo and link a video (uploaded file OR pasted URL), compute the
 * photo's perceptual hash, write a `magic_photos` document, and return the
 * created MagicPhoto.
 *
 * @param {object} args
 * @param {File} args.photoFile           the picked image file (required)
 * @param {File=} args.videoFile          a picked video file (optional)
 * @param {string=} args.videoUrl         a pasted video URL (used when no file)
 * @param {(progress:number)=>void=} args.onProgress  0..1 combined progress
 * @returns {Promise<object>} the created MagicPhoto
 */
export async function uploadPhotoAndVideo({ photoFile, videoFile, videoUrl, onProgress }) {
  assertConfigured();
  if (!_app) initFirebase();
  const uid = await signInAnon();
  if (!photoFile) throw new Error('A photo is required.');
  if (!videoFile && !videoUrl) throw new Error('Provide a video file or a video URL.');

  const id = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  // Compute the dHash from the photo before upload (used later for scan match).
  const hash = await computeHashFromFile(photoFile);

  const uploadingVideoFile = !!videoFile;
  // Progress weighting: when uploading both, split 50/50; photo only otherwise.
  let photoProgress = 0;
  let videoProgress = 0;
  const report = () => {
    if (!onProgress) return;
    onProgress(uploadingVideoFile ? (photoProgress + videoProgress) / 2 : photoProgress);
  };

  // Upload the photo.
  const photoRef = storageRef(_storage, `users/${uid}/photos/${id}.jpg`);
  const photoTask = uploadBytesResumable(photoRef, photoFile, {
    contentType: photoFile.type || 'image/jpeg',
  });
  await new Promise((resolve, reject) => {
    photoTask.on(
      'state_changed',
      (snap) => {
        if (snap.totalBytes > 0) {
          photoProgress = snap.bytesTransferred / snap.totalBytes;
          report();
        }
      },
      reject,
      resolve,
    );
  });
  const photoUrl = await getDownloadURL(photoRef);

  // Resolve the video URL: upload the file, or use the pasted URL as-is.
  let resolvedVideoUrl = videoUrl ? videoUrl.trim() : '';
  if (uploadingVideoFile) {
    const videoRef = storageRef(_storage, `users/${uid}/videos/${id}.mp4`);
    const videoTask = uploadBytesResumable(videoRef, videoFile, {
      contentType: videoFile.type || 'video/mp4',
    });
    await new Promise((resolve, reject) => {
      videoTask.on(
        'state_changed',
        (snap) => {
          if (snap.totalBytes > 0) {
            videoProgress = snap.bytesTransferred / snap.totalBytes;
            report();
          }
        },
        reject,
        resolve,
      );
    });
    resolvedVideoUrl = await getDownloadURL(videoRef);
  }

  const record = createMagicPhoto({
    id,
    photoUrl,
    videoUrl: resolvedVideoUrl,
    perceptualHash: hash,
    ownerId: uid,
  });
  await createRecord(record);
  return record;
}

/**
 * Write a MagicPhoto document (server timestamp for createdAt).
 * @param {object} record
 */
export async function createRecord(record) {
  assertConfigured();
  if (!_db) initFirebase();
  await setDoc(doc(_db, COLLECTION, record.id), {
    ...magicPhotoToMap(record),
    createdAt: serverTimestamp(),
  });
}

/**
 * Realtime listener for the current user's photos (newest first). Maps docs
 * via magicPhotoFromDoc and calls cb(list). Returns an unsubscribe function.
 * On error, cb is called with (null, error).
 * @param {(list:object[]|null, error?:Error)=>void} cb
 * @returns {() => void} unsubscribe
 */
export function streamMyPhotos(cb) {
  assertConfigured();
  if (!_db) initFirebase();
  const uid = currentUid();
  if (!uid) {
    cb([]);
    return () => {};
  }
  // NOTE: we intentionally do NOT add orderBy('createdAt') here. Combining a
  // where() filter with an orderBy() on a different field requires a Firestore
  // composite index. To keep setup zero-config, we filter by ownerId on the
  // server and sort by createdAt on the client (below). Fine for a per-user
  // list that is small.
  const q = query(
    collection(_db, COLLECTION),
    where('ownerId', '==', uid),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(magicPhotoFromDoc);
      // Newest first. createdAt may be null briefly for a just-written doc
      // (server timestamp not yet resolved); treat null as "now" so it sorts
      // to the top instead of the bottom.
      list.sort((a, b) => {
        const ta = a.createdAt ? a.createdAt.getTime() : Date.now();
        const tb = b.createdAt ? b.createdAt.getTime() : Date.now();
        return tb - ta;
      });
      cb(list);
    },
    (err) => cb(null, err),
  );
}

/**
 * One-shot read of all records (across owners) for cross-user scan matching.
 * A second user needs to match photos uploaded by someone else, so this is not
 * scoped by uid. A full read is acceptable for a free-tier demo.
 * @param {number} max
 * @returns {Promise<object[]>}
 */
export async function fetchAllRecords(max = 500) {
  assertConfigured();
  if (!_db) initFirebase();
  const q = query(collection(_db, COLLECTION), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map(magicPhotoFromDoc);
}

/**
 * Fetch a single record by id, or null if not found.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getRecordById(id) {
  assertConfigured();
  if (!_db) initFirebase();
  const snap = await getDoc(doc(_db, COLLECTION, id));
  if (!snap.exists()) return null;
  return magicPhotoFromDoc(snap);
}

/**
 * Decode an image File into a drawable bitmap and compute its dHash via the
 * active matcher. Falls back to an HTMLImageElement when createImageBitmap is
 * unavailable.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function computeHashFromFile(file) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    try {
      return matcher.computeHash(bitmap);
    } finally {
      if (bitmap.close) bitmap.close();
    }
  }
  // Fallback: load via an <img> element from an object URL.
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode image for hashing.'));
      el.src = url;
    });
    return matcher.computeHash(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}
