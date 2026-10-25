# Implementation Plan — Magic Photo (Static PWA, `web/` subfolder)

A browser version of the existing Flutter "Magic Photo" app: a photo is a gateway to a linked video. Four flows — **Upload** (pick a photo + link a video by file upload or URL, store a perceptual-hash fingerprint), **Play** (play-button overlay over the photo → video player → back), **Share** (Web Share API with copy-link fallback), **Scan** (point the camera at the same photo, hash live frames on-device, match by Hamming distance, open the linked video). Built as plain static HTML/CSS/vanilla-JS ES modules — no build tooling, no npm, no bundler — all third-party libs from public CDNs.

This plan mirrors the app concept and pHash design decisions from the existing Flutter `README.md`, `SETUP.md`, and `.agents/tasks/plan.md`, re-expressed for the web.

## Scope and guardrails (read first)

- **Everything new lives under** `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\web\`. Do NOT create, delete, move, or modify any existing Flutter file: `lib/`, `android/`, `ios/`, `pubspec.yaml`, `analysis_options.yaml`, `README.md`, `SETUP.md`, `.gitignore`, `.agents/`. The web app must coexist only inside `web/`.
- The repo already has git initialized (verified: `.agents/` shows as untracked, Flutter files are tracked). The final step commits only `web/` files.
- **No Node.js on PATH** (verified: `node` is absent). No bundler, no npm, no SDK. The coder MUST NOT run npm, a bundler, a browser, or a long-running dev server. Verification is a manual consistency pass plus (only if a JS runtime appears later) an optional syntax check — see step 17.

## Environment facts (verified during exploration)

- Repo root: `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app`.
- Existing Flutter files present: `lib/` (main.dart, models/magic_photo.dart, services/image_matcher.dart, services/firebase_service.dart, screens/*, widgets/*), `android/`, `ios/`, `pubspec.yaml`, `analysis_options.yaml`, `README.md`, `SETUP.md`, `.gitignore`.
- `.agents/tasks/` contains `plan.md`, `review.json`, `review.md`, `verification.md` (Flutter artifacts — leave untouched).
- Node.js: ABSENT. Git: present, `.agents/` currently untracked.

## Design decisions (made during planning, grounded in the existing codebase)

- **Pure static SPA, ES modules.** `web/index.html` loads `web/js/app.js` via `<script type="module">`; all other JS files are ES modules imported with **relative paths** (`./router.js`, `./screens/home.js`, etc.). Rationale: the task fixes this stack; relative paths work from `file://` and from any static server with zero config.
- **Firebase via gstatic CDN, pinned to v10.14.1.** Modular ESM imports from `https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js`, `.../firebase-auth.js`, `.../firebase-firestore.js`, `.../firebase-storage.js`. Rationale: v10.14.1 is a concrete, widely-deployed v10 generation; pinning an exact version (not "10.x.x") removes ambiguity for the coder and keeps the imports valid. All four URLs resolve on the gstatic CDN.
- **Service worker is a PLAIN (non-module) worker using only the Cache API.** It MUST NOT import Firebase ESM modules. Rationale: ES-module service workers are not broadly supported across mobile browsers (confirmed via Firebase web docs); a classic worker caching the app shell is the portable choice and is all the task requires (offline app-shell load + Add to Home Screen). Content was rephrased for compliance with licensing restrictions. Source: [Firebase — Receive messages in Web apps](https://firebase.google.com/docs/cloud-messaging/js/receive).
- **Perceptual hash = dHash, pure JS, identical algorithm to the Flutter app.** Downscale each frame to 9×8 grayscale on an offscreen `<canvas>`, compare each pixel to its right neighbour (8 cols × 8 rows = 64 bits), pack to a 16-char hex string. Match by Hamming distance, default threshold 10 of 64. Hidden behind an `ImageMatcher` object so an OpenCV.js ORB matcher can be dropped in later; a code comment marks ORB as the planned future enhancement. Rationale: mirrors `lib/services/image_matcher.dart` exactly so the two apps behave the same.
- **Firestore/Storage/Auth shape is identical to the Flutter app** (collection `magic_photos`, same fields, same storage paths, anonymous auth, `ownerId` = anon uid). Rationale: consistency with the existing design; a photo uploaded from either client could match from either client against the same backend.
- **Video can be an uploaded file OR a pasted URL.** When a URL is supplied, store it in `videoUrl` and skip the Storage upload; when a file is supplied, upload to Storage and store the download URL. Rationale: explicit task requirement (support BOTH); this is the one deliberate behavioural superset over the Flutter version.
- **Firebase config is a clearly-marked placeholder.** `web/js/firebase-config.js` exports a `firebaseConfig` object with every field = `"REPLACE_ME"` and an `isFirebaseConfigured()` helper. When unconfigured, the UI shows a friendly banner instead of crashing. Rationale: task requirement; never invent real credentials.
- **Hash-based router** with routes `#/home`, `#/upload`, `#/detail/:id`, `#/scan`. Rationale: fixed by the task; hash routing needs no server rewrite rules and works from `file://`.

## Firestore / Storage layout (same as the Flutter app)

Firestore collection `magic_photos`, one document per magic photo:

| field            | type                | notes                                   |
| ---------------- | ------------------- | --------------------------------------- |
| `id`             | string              | == document id                          |
| `photoUrl`       | string              | Storage download URL                    |
| `videoUrl`       | string              | Storage download URL OR user-pasted URL |
| `perceptualHash` | string              | 16 hex chars (64-bit dHash)             |
| `createdAt`      | Firestore Timestamp | server timestamp                        |
| `ownerId`        | string              | anonymous uid                           |

Storage paths: `users/{uid}/photos/{id}.jpg` and `users/{uid}/videos/{id}.mp4` (video path only used when a file is uploaded). Scan matching reads all `magic_photos` across owners (so a second user can match someone else's photo) and compares each stored hash to the live frame hash — acceptable for a free-tier demo, as noted in the Flutter README.

## dHash algorithm (implemented in `web/js/image-matcher.js`)

1. Draw the source (`HTMLImageElement`, `HTMLVideoElement`, `ImageBitmap`, or `canvas`) onto an offscreen 9×8 `<canvas>` via `drawImage` (the browser downscales).
2. `getImageData(0,0,9,8)` → RGBA bytes; convert each pixel to luminance (`0.299R + 0.587G + 0.114B`).
3. For each of the 8 rows, compare each pixel to its right neighbour (9 cols → 8 comparisons): bit = 1 if left luma > right luma else 0 → 64 bits.
4. Pack the 64 bits into a 16-char hex string (the stored `perceptualHash`).
5. Hamming distance = count of differing bits between two hex hashes; match if distance ≤ threshold (default 10).

## Scan → match → play control flow (implemented in `web/js/screens/scan.js`)

1. On entering `#/scan`, request camera via `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })`; stream into a `<video>` element.
2. Fetch candidate records once at scan start via `fetchAllRecords()` and cache them.
3. On a throttled interval (~700 ms), draw the current `<video>` frame to the offscreen canvas, compute its dHash, and find the cached record with minimum Hamming distance ≤ threshold.
4. On first match: stop the interval, stop all camera tracks, and navigate to `#/detail/:id` (which offers the play overlay).
5. UI states: initializing camera, scanning (live preview + hint), no-match-yet (keep scanning), permission-denied (friendly prompt), Firebase-not-configured (banner), match-found (brief indicator then navigate).
6. **Always** stop the camera stream when leaving the scan screen (route change or navigation) — the router calls each screen's teardown/cleanup hook.

## Router map (implemented in `web/js/router.js`)

- `#/home` (and empty hash) → `renderHome(root)`
- `#/upload` → `renderUpload(root)`
- `#/detail/:id` → `renderDetail(root, id)`
- `#/scan` → `renderScan(root)` (with a cleanup hook that stops the camera on exit)
- Unknown hash → redirect to `#/home`.

---

# Implementation steps

Each step leaves `web/` in a self-consistent state. All paths are absolute. The coder creates files ONLY under `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\web\`.

- [ ] 1. Create the data model.
      Create `web/js/models.js` exporting the `MagicPhoto` shape and helpers: a factory `createMagicPhoto({ id, photoUrl, videoUrl, perceptualHash, createdAt, ownerId })`, `magicPhotoFromDoc(docSnap)` (reads a Firestore doc, converts a `Timestamp` `createdAt` to a JS `Date`, tolerates missing `createdAt`), and `magicPhotoToMap(obj)` for writes. Field names MUST be exactly `id, photoUrl, videoUrl, perceptualHash, createdAt, ownerId`.
      Files: `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\web\js\models.js`
      Verify: manual — field names match the Firestore layout table above; `magicPhotoFromDoc`/`magicPhotoToMap`/`createMagicPhoto` are exported and will match call sites in `firebase-service.js` and the screens.

- [ ] 2. Create the Firebase config placeholder.
      Create `web/js/firebase-config.js` exporting a `firebaseConfig` object with `apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId` ALL set to `"REPLACE_ME"`, and an exported `isFirebaseConfigured()` returning `true` only when no value is still `"REPLACE_ME"`. Add a header comment: do not commit real keys; see `web/README.md` for creating a free Firebase project and pasting real values.
      Files: `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\web\js\firebase-config.js`
      Verify: manual — object has all six keys = `"REPLACE_ME"`; `isFirebaseConfigured` and `firebaseConfig` are exported and used by `app.js`/`firebase-service.js`.

- [ ] 3. Create the image matcher.
      Create `web/js/image-matcher.js` defining an `ImageMatcher` base object/class with methods `computeHash(source)`, `hammingDistance(a, b)`, `isMatch(a, b, threshold)`, and a `PerceptualHashMatcher` implementing the dHash steps from the algorithm section (default threshold 10). `computeHash` accepts a drawable source (`HTMLImageElement`/`HTMLVideoElement`/`ImageBitmap`/`HTMLCanvasElement`), uses a reusable offscreen 9×8 canvas, returns a 16-char hex string. Export a ready `matcher` instance plus the classes. Add a comment block explaining dHash and a comment noting OpenCV.js ORB (loaded from CDN) is the planned future enhancement, swappable without touching the UI.
      Files: `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\web\js\image-matcher.js`
      Verify: manual — pure browser APIs only (canvas/ImageData), no CDN import needed; exported names (`matcher`, `PerceptualHashMatcher`) match usage in `upload.js` and `scan.js`; 9×8 → 64-bit → 16 hex chars is internally consistent.

- [ ] 4. Create the Firebase service wrapper.
      Create `web/js/firebase-service.js` importing the Firebase modular SDK from the pinned gstatic CDN URLs (`https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js`, `firebase-auth.js`, `firebase-firestore.js`, `firebase-storage.js`), importing `firebaseConfig`/`isFirebaseConfigured` from `./firebase-config.js`, the matcher from `./image-matcher.js`, and model helpers from `./models.js`. Export: `initFirebase()` (guard on `isFirebaseConfigured()`; `initializeApp`; get Auth/Firestore/Storage), `signInAnon()` (anonymous sign-in, returns uid), `currentUid()`, `uploadPhotoAndVideo({ photoFile, videoFile, videoUrl, onProgress })` (computes the photo dHash via the matcher, uploads the photo to `users/{uid}/photos/{id}.jpg`; if `videoFile` given, uploads to `users/{uid}/videos/{id}.mp4` and uses its download URL, else uses the pasted `videoUrl`; writes a `magic_photos` doc via `magicPhotoToMap`; returns the created `MagicPhoto`), `createRecord(record)`, `streamMyPhotos(cb)` (realtime listener filtered by `ownerId == currentUid()`, maps docs via `magicPhotoFromDoc`, returns an unsubscribe fn), `fetchAllRecords()` (one-shot read of all `magic_photos` for cross-user scan matching), `getRecordById(id)`. Every method must fail gracefully (throw a clearly-typed "not configured" error the UI catches) when Firebase is unconfigured.
      Files: `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\web\js\firebase-service.js`
      Verify: manual — all four CDN URLs use version 10.14.1 and the `firebase-*.js` module names; every exported method name here matches its call site in `app.js`, `home.js`, `upload.js`, `detail.js`, `scan.js`; collection name `magic_photos` and storage paths match the layout section.

- [ ] 5. Create the Web Share helper.
      Create `web/js/share.js` exporting `shareMagicPhoto({ title, text, url })` that uses `navigator.share` when available and falls back to copying the link to the clipboard (`navigator.clipboard.writeText`) with a returned status so the caller can show a toast. The caller builds the deep link as `${location.origin}${location.pathname}#/detail/${id}`.
      Files: `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\web\js\share.js`
      Verify: manual — `shareMagicPhoto` exported; no undefined globals; call site in `detail.js` matches.

- [ ] 6. Create the hash router.
      Create `web/js/router.js` exporting `initRouter(root, routes)` and `navigate(hash)`. It parses `location.hash`, matches `#/home`, `#/upload`, `#/detail/:id`, `#/scan` (extracting `:id`), invokes the matched render function with `(root, params)`, redirects unknown/empty hashes to `#/home`, and invokes the PREVIOUS route's cleanup function (if the render returned one) before rendering the next — this is how the scan screen's camera gets stopped on exit. Listen to `hashchange` and initial load.
      Files: `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\web\js\router.js`
      Verify: manual — the four route patterns exactly match the keys/paths the screens register in `app.js`; the cleanup-hook contract (render functions may return a cleanup fn) is documented in a comment and honored by `scan.js`.

- [ ] 7. Create the Home screen.
      Create `web/js/screens/home.js` exporting `renderHome(root)` that subscribes via `streamMyPhotos` and renders a touch-friendly grid of the current user's photos (thumbnail from `photoUrl`, tap → `navigate('#/detail/'+id)`); shows loading, empty-state ("No magic photos yet — tap Upload"), and error states; shows the Firebase-not-configured banner (shared helper) when unconfigured. Return a cleanup function that detaches the Firestore listener.
      Files: `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\web\js\screens\home.js`
      Verify: manual — uses `MagicPhoto` fields and `firebase-service` methods as defined in steps 1 and 4; navigation hashes match the router patterns in step 6.

- [ ] 8. Create the Upload screen.
      Create `web/js/screens/upload.js` exporting `renderUpload(root)` with: a photo `<input type="file" accept="image/*">` (with preview), a video source toggle offering EITHER a video `<input type="file" accept="video/*">` OR a text input for a video URL, and a submit button disabled until a photo plus one video source are provided. On submit, call `uploadPhotoAndVideo({ photoFile, videoFile, videoUrl, onProgress })` with a progress indicator; on success `navigate('#/home')`; surface upload/validation errors inline; show the not-configured banner when unconfigured.
      Files: `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\web\js\screens\upload.js`
      Verify: manual — the `uploadPhotoAndVideo` argument shape matches step 4; both video paths (file and URL) are wired; progress/empty/error states handled.

- [ ] 9. Create the Detail screen (Play + Share).
      Create `web/js/screens/detail.js` exporting `renderDetail(root, id)` that loads the record via `getRecordById(id)`, shows the photo full-bleed with a tappable play-button overlay; tapping play swaps in a `<video controls autoplay>` for `videoUrl` with a Back control that returns to the photo view; a Share button calls `shareMagicPhoto(...)` from `share.js` with the photo URL, video URL, and the `#/detail/:id` deep link. Handle not-found, loading, and not-configured states.
      Files: `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\web\js\screens\detail.js`
      Verify: manual — `getRecordById` and `shareMagicPhoto` call sites match steps 4 and 5; play/back toggling works without leaving the route; uses `MagicPhoto` fields.

- [ ] 10. Create the Scan screen.
      Create `web/js/screens/scan.js` exporting `renderScan(root)` implementing the scan→match→play control flow: `getUserMedia({ video: { facingMode: 'environment' } })` into a `<video>`, `fetchAllRecords()` cached at start, a ~700 ms throttled loop that draws the frame to the matcher's canvas, computes the dHash, and finds the best Hamming match ≤ threshold; on match stop the loop and all tracks and `navigate('#/detail/'+id)`. Render scanning hint, no-match-yet, permission-denied (friendly), and not-configured states. **Return a cleanup function** that stops the interval and all camera tracks; the router calls it on exit. Add a comment explaining the scan→match→play path.
      Files: `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\web\js\screens\scan.js`
      Verify: manual — `fetchAllRecords` and matcher APIs match steps 3 and 4; the cleanup function stops every track (no camera left running); navigation hash matches the router.

- [ ] 11. Create the app bootstrap and shared UI helper.
      Create `web/js/app.js` (the module entry loaded by `index.html`): import `initFirebase`/`signInAnon`/`isFirebaseConfigured`, the router (`initRouter`), and all four screen render functions; on load, if configured call `initFirebase()` then `await signInAnon()` inside a try/catch that shows a friendly error/banner rather than crashing; register the routes map (`#/home`→`renderHome`, `#/upload`→`renderUpload`, `#/detail/:id`→`renderDetail`, `#/scan`→`renderScan`) with `initRouter`; register the service worker via `navigator.serviceWorker.register('./service-worker.js')` guarded by `'serviceWorker' in navigator` and wrapped so a `file://` failure is caught and logged, not fatal. Also create `web/js/ui.js` exporting a shared `renderConfigBanner(root)` / `showToast(msg)` helper used by the screens for the "Firebase not configured" banner and transient messages.
      Files: `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\web\js\app.js`, `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\web\js\ui.js`
      Verify: manual — every imported path resolves to a file created in steps 1–10; route keys match the router; service-worker path matches the file in step 13; every screen that shows the banner imports `ui.js` consistently.

- [ ] 12. Create the app shell HTML and styles.
      Create `web/index.html`: `<!DOCTYPE html>` with `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `<link rel="manifest" href="./manifest.webmanifest">`, `<meta name="theme-color">`, `<link rel="icon" href="./icons/icon.svg">`, a `#app` mount root, a bottom nav / buttons for Home / Upload / Scan (anchors to `#/home`, `#/upload`, `#/scan`), `<link rel="stylesheet" href="./css/styles.css">`, and `<script type="module" src="./js/app.js"></script>`. Create `web/css/styles.css`: mobile-first responsive layout, touch-friendly targets, styles for the photo grid, play overlay, scanner preview, banner/toast, buttons, and bottom nav.
      Files: `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\web\index.html`, `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\web\css\styles.css`
      Verify: manual — manifest href, stylesheet href, icon href, and the module script src all point at files created by this plan; nav anchors match router hashes.

- [ ] 13. Create the PWA manifest and service worker.
      Create `web/manifest.webmanifest` with `name`, `short_name`, `start_url: "./index.html"`, `scope: "./"`, `display: "standalone"`, `theme_color`, `background_color`, and an `icons` array referencing `./icons/icon-192.png` (192×192), `./icons/icon-512.png` (512×512), and `./icons/icon.svg` (`"any"`). Create `web/service-worker.js` as a PLAIN (non-module) worker: on `install`, `caches.open` an app-shell cache and `addAll` the shell paths — `./`, `./index.html`, `./css/styles.css`, `./js/app.js`, `./js/ui.js`, `./js/router.js`, `./js/models.js`, `./js/firebase-config.js`, `./js/firebase-service.js`, `./js/image-matcher.js`, `./js/share.js`, `./js/screens/home.js`, `./js/screens/upload.js`, `./js/screens/detail.js`, `./js/screens/scan.js`, `./manifest.webmanifest`, `./icons/icon.svg`, `./icons/icon-192.png`, `./icons/icon-512.png`; `activate` cleans old caches; `fetch` serves cache-first for same-origin shell requests and falls through to network for cross-origin (gstatic/Firebase) and other requests. Do NOT import Firebase ESM in the worker. Use `self.skipWaiting()` / `clients.claim()`.
      Files: `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\web\manifest.webmanifest`, `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\web\service-worker.js`
      Verify: manual — every path in the service-worker precache list and every icon in the manifest corresponds to a real file produced by this plan; `start_url`/`scope` are relative; the worker contains no `import`/Firebase references; the cached JS list exactly matches the files created in steps 1–11.

- [ ] 14. Create the icons.
      Create `web/icons/icon.svg` — a simple, valid SVG app icon (a photo+play glyph on the theme color). Create `web/icons/icon-192.png` and `web/icons/icon-512.png` as valid PNGs so the manifest is installable. Because no image tooling is available, if the environment offers no way to emit real PNG bytes, write minimal valid PNG files (correct 8-byte PNG signature + a valid IHDR/IDAT/IEND of the nominal size) and note in `web/README.md` that these are placeholders to be swapped. The manifest MUST reference files that actually exist and are valid images.
      Files: `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\web\icons\icon.svg`, `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\web\icons\icon-192.png`, `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\web\icons\icon-512.png`
      Verify: manual — the three icon files exist at the exact paths the manifest and index.html reference; the SVG is well-formed; the PNGs are non-empty valid PNG files (correct PNG signature). Note any placeholder status in the README.

- [ ] 15. Create the web README.
      Create `web/README.md` covering: the four flows and the file layout; **how to run** — (a) quick local test via a static server on `http://localhost` (give zero-install options such as the VS Code "Live Server" extension, or `python -m http.server` if Python exists — do NOT assume Node), and (b) the primary phone-camera path over **https** using a free static host (Firebase Hosting free tier or GitHub Pages drag-and-drop), emphasized because the org may block CLIs. Explicitly state that `getUserMedia` (camera) and the service worker require a **secure context** — they work on `http://localhost` and `https://` but NOT from a plain `file://` open or a bare LAN IP over http, and that opening `index.html` as a file lets you browse the UI but camera + service worker won't function. Document **Firebase setup**: create a free (Spark) project, enable Firestore, Storage, and Anonymous Auth, paste real keys into `web/js/firebase-config.js` (replace the `REPLACE_ME` values), and include the Firestore and Storage starter security rules mirroring the Flutter `SETUP.md` (signed-in read on `magic_photos`, owner-only create/update/delete; Storage read for signed-in, write scoped to `users/{uid}`). Note the pHash framing limitation and that OpenCV.js ORB is the planned future improvement. If the PNG icons are placeholders, say so and how to swap them.
      Files: `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\web\README.md`
      Verify: manual — README names only files that exist under `web/`; the secure-context explanation and both run paths are present; Firebase rules snippets included; no reference to npm/bundler as a required step.

- [ ] 16. Write the manual consistency report.
      Create `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\.agents\tasks\web-verification.md` recording the full consistency pass: a checklist confirming every `<script>`/`import` path resolves to an existing file; every exported function/variable is defined where imported and names match across modules; the router's four routes all have matching screen render functions; `firebase-service` method names match their call sites in the screens; the manifest references icons that exist; the service worker precaches only paths that exist; the four Firebase gstatic import URLs use version 10.14.1 and valid `firebase-*.js` names; the `MagicPhoto` field set is identical everywhere. Record pass/fail per item with the resolved file path.
      Files: `c:\Users\SaiAkula\OneDrive - SoftClouds LLC\Desktop\Project\magic_photo_app\.agents\tasks\web-verification.md`
      Verify: manual — the checklist covers import paths, exported-name matches, route↔screen matches, service↔call-site matches, manifest↔icons, service-worker↔files, CDN URL validity, and model-field consistency; any discrepancy found is fixed in the relevant `web/` file before the report is marked complete.

- [ ] 17. Optional syntax check (only if a JS runtime appears).
      Node is ABSENT now, so skip by default. If and only if `node --version` succeeds later, you MAY run `node --check` on each `web/js/**/*.js` file to catch syntax errors. Do NOT launch a browser, a dev server, npm, or the app. Record the result (or "skipped — no Node") in `web-verification.md`.
      Files: (check only — no new files)
      Verify: each JS module passes `node --check` if Node is available; otherwise the report states Node was absent and the manual pass stands.

- [ ] 18. Commit only the new `web/` files.
      Stage ONLY paths under `web/` (e.g. `git add web`) — do not stage or modify any Flutter file or anything in `.agents/`. Commit with a clear message such as `Add static PWA web/ version of Magic Photo (upload, play, share, camera pHash scan)`. Do NOT push unless asked.
      Files: (git only — commits the files created in steps 1–15)
      Verify: `git status --short` shows only `web/` files staged/committed and no Flutter file changed; `git show --stat HEAD` lists only `web/...` paths.

## Notes / assumptions

- The service worker is deliberately a classic (non-module) Cache-API worker and does NOT touch Firebase; this keeps it portable across mobile browsers and is sufficient for offline app-shell load and Add to Home Screen.
- Firebase is pinned to gstatic v10.14.1 to remove version ambiguity; if the coder confirms a newer valid v10 patch, it may be substituted as long as all four `firebase-*.js` URLs share the same version.
- `web/js/ui.js` is introduced to hold the shared not-configured banner and toast so every screen renders them consistently; if the coder inlines these into `app.js` instead, the service-worker precache list and all imports must be updated to match — the plan's default is a separate `ui.js`.
- The app will not connect to Firebase until the user replaces the `REPLACE_ME` values; until then the UI shows a friendly banner rather than crashing (task requirement).
- Camera and service worker require a secure context; this is documented in `web/README.md`, which steers the user to a free https host for real phone testing.
