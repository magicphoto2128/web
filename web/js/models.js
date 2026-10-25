// models.js
//
// The `MagicPhoto` data shape plus small helpers for converting to/from
// Firestore. Mirrors the Flutter app's `MagicPhoto` model so both clients
// share one backend.
//
// Firestore document shape (collection `magic_photos`):
//   id              -> string  (== document id, a uuid)
//   photoUrl        -> string  (Storage download URL)
//   videoUrl        -> string  (Storage download URL OR user-pasted URL)
//   perceptualHash  -> string  (16 hex chars == 64-bit dHash)
//   createdAt       -> Firestore Timestamp (server timestamp on write)
//   ownerId         -> string  (anonymous uid)

/**
 * Build a plain MagicPhoto object. `createdAt` is a JS `Date | null`.
 * @param {object} fields
 * @returns {{id:string, photoUrl:string, videoUrl:string, perceptualHash:string, createdAt:(Date|null), ownerId:string}}
 */
export function createMagicPhoto({
  id = '',
  photoUrl = '',
  videoUrl = '',
  perceptualHash = '',
  createdAt = null,
  ownerId = '',
} = {}) {
  return { id, photoUrl, videoUrl, perceptualHash, createdAt, ownerId };
}

/**
 * Convert a Firestore DocumentSnapshot into a MagicPhoto. Tolerates a missing
 * or not-yet-resolved (`null`) `createdAt` (server-timestamp round-trip).
 * @param {{ id:string, data:Function }} docSnap  a Firestore QueryDocumentSnapshot/DocumentSnapshot
 */
export function magicPhotoFromDoc(docSnap) {
  const data = (docSnap && typeof docSnap.data === 'function' ? docSnap.data() : null) || {};
  const rawCreatedAt = data.createdAt;
  let createdAt = null;
  // Firestore Timestamp exposes a toDate() method.
  if (rawCreatedAt && typeof rawCreatedAt.toDate === 'function') {
    createdAt = rawCreatedAt.toDate();
  } else if (rawCreatedAt instanceof Date) {
    createdAt = rawCreatedAt;
  }
  return createMagicPhoto({
    id: data.id || docSnap.id,
    photoUrl: data.photoUrl || '',
    videoUrl: data.videoUrl || '',
    perceptualHash: data.perceptualHash || '',
    createdAt,
    ownerId: data.ownerId || '',
  });
}

/**
 * Convert a MagicPhoto into the map written to Firestore. `createdAt` is left
 * to the caller (firebase-service writes a server timestamp).
 */
export function magicPhotoToMap(obj) {
  return {
    id: obj.id,
    photoUrl: obj.photoUrl,
    videoUrl: obj.videoUrl,
    perceptualHash: obj.perceptualHash,
    ownerId: obj.ownerId,
  };
}
