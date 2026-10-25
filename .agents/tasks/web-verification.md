# Web PWA — Verification Report

Manual consistency pass for the static PWA under `web/`. First iteration (no
`web-review.json` present). No browser or dev server was launched.

## Commands run

- `node --version` → **not recognized** (Node.js is absent from PATH). Per the
  plan, the optional `node --check` syntax pass is **skipped — no Node**. The
  manual consistency pass below stands as the verification.
- `Get-ChildItem -Recurse -File` under `web/` → confirmed all 20 files exist
  (listed below). Icon PNGs were generated with .NET `System.Drawing`:
  `icon-192.png` = 1941 bytes, `icon-512.png` = 6011 bytes (valid PNGs saved
  via `ImageFormat::Png`).
- Verified the Firebase CDN base resolves by fetching
  `https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js` (HTTP 200,
  Apache-2.0 Google LLC header, real module source).

## Files present (20)

```
css/styles.css          icons/icon.svg          icons/icon-192.png
icons/icon-512.png      index.html              js/app.js
js/firebase-config.js   js/firebase-service.js  js/image-matcher.js
js/models.js            js/router.js            js/screens/detail.js
js/screens/home.js      js/screens/scan.js      js/screens/upload.js
js/share.js             js/ui.js                manifest.webmanifest
README.md               service-worker.js
```

## 1. Import paths resolve to real files

| Importer                | Imports from                        | Resolves? |
| ----------------------- | ----------------------------------- | --------- |
| `index.html`            | `./js/app.js` (module script)       | PASS      |
| `app.js`                | `./firebase-config.js`              | PASS      |
| `app.js`                | `./firebase-service.js`             | PASS      |
| `app.js`                | `./router.js`                       | PASS      |
| `app.js`                | `./ui.js`                           | PASS      |
| `app.js`                | `./screens/home.js`                 | PASS      |
| `app.js`                | `./screens/upload.js`               | PASS      |
| `app.js`                | `./screens/detail.js`               | PASS      |
| `app.js`                | `./screens/scan.js`                 | PASS      |
| `firebase-service.js`   | `./firebase-config.js`              | PASS      |
| `firebase-service.js`   | `./image-matcher.js`                | PASS      |
| `firebase-service.js`   | `./models.js`                       | PASS      |
| `ui.js`                 | `./firebase-config.js`              | PASS      |
| `screens/home.js`       | `../firebase-service.js`, `../firebase-config.js`, `../router.js`, `../ui.js` | PASS |
| `screens/upload.js`     | `../firebase-service.js`, `../firebase-config.js`, `../router.js`, `../ui.js` | PASS |
| `screens/detail.js`     | `../firebase-service.js`, `../firebase-config.js`, `../share.js`, `../router.js`, `../ui.js` | PASS |
| `screens/scan.js`       | `../firebase-service.js`, `../firebase-config.js`, `../image-matcher.js`, `../router.js`, `../ui.js` | PASS |

No importer references a path that does not exist.

## 2. Imported names are exported where they come from

| Name(s) imported                                            | Source                | Exported? |
| ----------------------------------------------------------- | --------------------- | --------- |
| `firebaseConfig`, `isFirebaseConfigured`                    | `firebase-config.js`  | PASS      |
| `initFirebase`, `signInAnon`, `currentUid`, `uploadPhotoAndVideo`, `createRecord`, `streamMyPhotos`, `fetchAllRecords`, `getRecordById` | `firebase-service.js` | PASS |
| `initRouter`, `navigate`                                    | `router.js`           | PASS      |
| `renderConfigBanner`, `showToast`, `el`                     | `ui.js`               | PASS      |
| `matcher`, `PerceptualHashMatcher`, `ImageMatcher`          | `image-matcher.js`    | PASS      |
| `createMagicPhoto`, `magicPhotoFromDoc`, `magicPhotoToMap`  | `models.js`           | PASS      |
| `shareMagicPhoto`                                           | `share.js`            | PASS      |
| `renderHome`, `renderUpload`, `renderDetail`, `renderScan`  | `screens/*.js`        | PASS      |

## 3. Router routes ↔ screen render functions

`app.js` registers: `#/home`→`renderHome`, `#/upload`→`renderUpload`,
`#/detail/:id`→`renderDetail`, `#/scan`→`renderScan`. All four render functions
are defined/exported in their screen files. The router's `:id` capture is read
as `params.id` in `renderDetail(root, params)` — matches. Unknown/empty hashes
redirect to `#/home`. PASS.

Navigation call sites all use registered hashes:
- `home.js` → `#/detail/<id>` (PASS)
- `upload.js` → `#/home` (PASS)
- `detail.js` → `#/home` (PASS)
- `scan.js` → `#/detail/<id>` (PASS)

Bottom-nav anchors in `index.html` (`#/home`, `#/upload`, `#/scan`) match
registered routes. PASS.

## 4. firebase-service method names ↔ call sites

| Method                | Called from                | Signature match |
| --------------------- | -------------------------- | --------------- |
| `initFirebase`        | `app.js`                   | PASS            |
| `signInAnon`          | `app.js`, `uploadPhotoAndVideo` | PASS       |
| `streamMyPhotos(cb)`  | `home.js` (cb(list,error)) | PASS            |
| `uploadPhotoAndVideo({photoFile,videoFile,videoUrl,onProgress})` | `upload.js` (same shape) | PASS |
| `getRecordById(id)`   | `detail.js`                | PASS            |
| `fetchAllRecords()`   | `scan.js`                  | PASS            |
| `createRecord(record)`| internal (uploadPhotoAndVideo) | PASS       |

## 5. Cleanup/teardown contract

Router calls the previous route's returned cleanup before rendering the next.
- `home.js` returns a cleanup that calls the Firestore `unsubscribe()`. PASS.
- `scan.js` returns a cleanup that clears the interval and stops **every**
  camera track (`stream.getTracks().forEach(t => t.stop())`); it also handles
  teardown mid-await (stops the stream if `stopped` became true while awaiting
  permission). No camera left running on exit. PASS.
- `upload.js` / `detail.js` return nothing (no resources to release). PASS.

## 6. MagicPhoto field consistency

Field set `{ id, photoUrl, videoUrl, perceptualHash, createdAt, ownerId }` is
identical across `models.js` (factory + converters), `firebase-service.js`
(reads/writes via `magicPhotoFromDoc`/`magicPhotoToMap`, server timestamp for
`createdAt`), and all screens (`photo.photoUrl`, `record.videoUrl`,
`rec.perceptualHash`, `photo.id`). Collection name `magic_photos` and storage
paths `users/{uid}/photos/{id}.jpg` + `users/{uid}/videos/{id}.mp4` match the
plan and the Flutter app. PASS.

## 7. Manifest ↔ icons

`manifest.webmanifest` references `./icons/icon.svg`, `./icons/icon-192.png`,
`./icons/icon-512.png` — all three exist. `start_url: "./index.html"` and
`scope: "./"` are relative. `index.html` links the manifest, `icon.svg` favicon,
and `icon-192.png` apple-touch-icon — all exist. PASS.

## 8. Service worker precache ↔ real files

`service-worker.js` is a classic (non-module) worker — contains **no** `import`
and **no** Firebase reference (grep-confirmed). Every precache path corresponds
to a real file: `./`, `./index.html`, `./css/styles.css`, `./js/app.js`,
`./js/ui.js`, `./js/router.js`, `./js/models.js`, `./js/firebase-config.js`,
`./js/firebase-service.js`, `./js/image-matcher.js`, `./js/share.js`,
`./js/screens/{home,upload,detail,scan}.js`, `./manifest.webmanifest`,
`./icons/{icon.svg,icon-192.png,icon-512.png}`. The cached JS list exactly
matches the created modules. `fetch` serves same-origin cache-first and lets
cross-origin (gstatic/Firebase) go to network. PASS.

## 9. Firebase CDN import URLs

All four imports use version `10.14.1` with valid module names:
`firebase-app.js`, `firebase-auth.js`, `firebase-firestore.js`,
`firebase-storage.js`. The base URL was fetched and returns the real SDK
(HTTP 200). PASS.

## 10. dHash internal consistency

9×8 grid → 8 rows × 8 comparisons = 64 bits → packed as 16 hex chars
(`padStart(16,'0')`). Matcher uses BigInt to avoid 32-bit overflow. Default
threshold 10. Upload path hashes the photo (`computeHashFromFile` → bitmap →
`matcher.computeHash`); scan path hashes the live `<video>` frame with the same
`matcher`, so the two hashes are directly comparable by `hammingDistance`.
Mirrors the Flutter `PerceptualHashMatcher`. PASS.

## Result

All consistency checks PASS. No discrepancies found; no fixes were required.
Node is absent, so the optional `node --check` was skipped as planned; the
manual pass is the verification of record. Not committed in this step (a later
finalize step performs the scoped git commit).
