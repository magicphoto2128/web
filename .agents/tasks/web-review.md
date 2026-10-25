# Static PWA port of Magic Photo under `web/`

The coder built a browser version of the Flutter Magic Photo app as a dependency-free static PWA: plain HTML/CSS and vanilla-JS ES modules, Firebase loaded from the gstatic CDN, no npm or bundler. The four flows from the plan are all present — upload (photo + video file or pasted URL), play (photo with a play overlay that swaps to a video player), share (Web Share API with a copy-link fallback), and scan (rear-camera frames hashed on-device and matched against stored records by Hamming distance). The design mirrors the Flutter app's backend shape (collection `magic_photos`, anonymous auth, same field set) so either client can match the other's photos. This was reviewed statically against the coder's `web-verification.md` evidence plus a direct read of every source file; the app itself cannot run in this headless environment.

Watch for: nothing blocking. One operational note — `streamMyPhotos` uses `where('ownerId') + orderBy('createdAt')`, which Firestore will reject at runtime until a composite index is created (likely). The home screen surfaces that as an error state rather than crashing, and the README's rules section is the natural place to mention it.

**Verdict**: APPROVED

## High-level view

The module graph is internally closed: every ES-module import resolves to a file that exists, and every imported name (`initFirebase`, `signInAnon`, `uploadPhotoAndVideo`, `createRecord`, `streamMyPhotos`, `fetchAllRecords`, `getRecordById`, `matcher`, `renderConfigBanner`, `el`, the four screen renderers) is exported where it is pulled from. The coder's verification report claimed this and the source read confirms it; no dangling reference was found.

The hash router maps `#/home`, `#/upload`, `#/detail/:id`, `#/scan` to the four screen renderers, extracts `:id` into `params.id` (which `renderDetail` reads), and redirects unknown or empty hashes to `#/home`. It honors a cleanup contract: a renderer may return a teardown function, and the router calls the previous route's teardown before rendering the next.

The scan screen's lifecycle is the one place a resource leak would hurt, and it is handled correctly: a single `cleanup` closure clears the interval and stops every camera track, is returned to the router for route-exit teardown, is called on a successful match before navigating away, and also covers the case where teardown happens while still awaiting the permission prompt.

The image matcher is a real pure-JS dHash (9×8 grid → 64 bits → 16 hex chars) behind an `ImageMatcher` interface, with BigInt math for the Hamming distance and the ORB-future comment the plan asked for. Upload and scan compute hashes through the same `matcher` instance, so stored and live hashes are directly comparable.

Firebase config is a clean `REPLACE_ME` placeholder with no invented credentials; `isFirebaseConfigured()` gates init and drives a friendly banner so every screen degrades instead of crashing. The service worker is a classic Cache-API worker (no Firebase import), its precache list matches the real files, and cross-origin requests pass through to the network. The manifest references three icons that all exist, and the two PNGs carry a valid PNG signature and IHDR chunk. Git status shows only `web/` and `.agents/` as untracked, so no Flutter file was touched.

<details>
<summary>Issues (2)</summary>

1. **Composite-index requirement (likely)** — `streamMyPhotos` filters by `ownerId` and orders by `createdAt`, which Firestore rejects until a composite index exists. Non-blocking (the home screen shows the error, doesn't crash), but worth a one-line note in the README's Firestore section pointing users to the index link Firestore prints.
2. **Full-collection scan read (possible, by design)** — `fetchAllRecords` reads up to 500 docs across all owners for cross-user matching. Intended per the plan and acceptable for a free-tier demo, but it scales poorly and is public-readable under the provided rules. Flagged for awareness, not a change request.

</details>

<details>
<summary>Details</summary>

### Module graph and name resolution

Every importer points at a file that exists under `web/`, and every imported symbol is exported at its source. `app.js` pulls `isFirebaseConfigured` from `firebase-config.js`, `initFirebase`/`signInAnon` from `firebase-service.js`, `initRouter` from `router.js`, `showToast` from `ui.js`, and the four `render*` functions from `screens/*.js`. The screens import `el`/`renderConfigBanner`/`showToast` from `ui.js`, `navigate` from `router.js`, and the service methods they call. `firebase-service.js` imports `firebaseConfig`/`isFirebaseConfigured`, `matcher`, and the three model converters. No import names a missing file or an unexported symbol.

The firebase-service method names match their call sites exactly: `streamMyPhotos(cb)` is called with a `(list, error)` callback in `home.js`; `uploadPhotoAndVideo({ photoFile, videoFile, videoUrl, onProgress })` is called with that exact object shape in `upload.js`; `getRecordById(id)` in `detail.js`; `fetchAllRecords()` in `scan.js`. `createRecord` is used internally by `uploadPhotoAndVideo`. Both video paths are wired — a `videoFile` is uploaded to Storage and its download URL stored, otherwise the pasted `videoUrl` is stored as-is — which is the one deliberate superset over the Flutter app.

### Scan lifecycle and camera teardown

```
enter #/scan ─► renderScan ─► returns cleanup() ──► router stores as _activeCleanup
                   │
                   ├─ fetchAllRecords() (cached once)
                   ├─ getUserMedia({ facingMode: 'environment' })
                   └─ setInterval(700ms): hash frame ─► best Hamming match ≤ threshold
                                                           │
                              match ─► cleanup() ─► navigate('#/detail/:id')
leave #/scan (any route change) ─► router calls _activeCleanup() ─► cleanup()
```

`cleanup` sets a `stopped` flag, clears the interval, and stops every track via `stream.getTracks().forEach(t => t.stop())`. Three exit paths all funnel through it: a successful match calls it before navigating, a route change triggers it through the router's teardown contract, and the `stopped` check after the `getUserMedia` await stops a stream that arrived after teardown already ran. No path leaves the camera running. The scan screen also handles the states the plan required — not-configured (banner, no-op cleanup), empty record set, permission-denied/NotFound/insecure-context (distinct messages), and match-found.

### dHash matcher

`PerceptualHashMatcher` draws any drawable source onto a reusable 9×8 offscreen canvas, converts each pixel to luminance, compares 8 columns across 8 rows for 64 bits, and packs them to a 16-char hex string with `padStart(16, '0')`. `hammingDistance` XORs the two hashes as BigInts and counts set bits, which avoids the 32-bit overflow a naive numeric approach would hit on a 64-bit hash. `isMatch` guards empty hashes and compares against a default threshold of 10. The grid/bit/hex arithmetic is internally consistent (8×8 = 64 bits = 16 hex chars), and both upload and scan route through the exported `matcher` singleton so the hashes are comparable. The `ImageMatcher` base class and the ORB-as-future-enhancement comment are both present, matching the plan's swappable-interface intent.

### Firebase config gating and failure handling

`firebaseConfig` has all six keys set to `REPLACE_ME` with no invented values, and `isFirebaseConfigured()` returns true only when none remain and none are empty. `app.js` only calls `initFirebase()`/`signInAnon()` when configured, inside a try/catch that shows a toast rather than crashing. Every service method calls `assertConfigured()` and throws a typed `FirebaseNotConfiguredError` when unconfigured, and every screen renders the shared banner and returns early before touching the backend. The unconfigured path is handled consistently across all four screens.

The one runtime caveat is `streamMyPhotos`: the `where('ownerId','==',uid)` + `orderBy('createdAt','desc')` combination needs a Firestore composite index, which the console creates on first failure. The home screen's `(list, error)` callback renders the error as a status line instead of crashing, so this is a setup footnote rather than a defect — but the README's Firestore-rules section would be a good place to mention it so a first-time user isn't surprised by an empty grid plus a console error link.

### Service worker, manifest, icons

The service worker is a classic (non-module) worker with no `import` and no Firebase reference. Its precache list enumerates the real app-shell files — `./`, `index.html`, the stylesheet, all eleven JS modules including the four screens, the manifest, and all three icons — matching the files on disk. `fetch` serves same-origin cache-first, caches successful basic responses, falls back to the cached shell for navigations when offline, and lets cross-origin (gstatic/Storage) requests go straight to the network.

The manifest's `start_url` and `scope` are relative, and its three icon entries (`icon.svg` as `any`, plus 192 and 512 PNGs as `any maskable`) all reference files that exist. A byte check confirmed both PNGs begin with the PNG signature and an IHDR chunk, so the manifest references real images rather than stubs. `index.html`'s bottom-nav anchors (`#/home`, `#/upload`, `#/scan`) match registered routes.

### Scope containment

`git status --short` reports only `web/` and `.agents/` as untracked and no modified or deleted tracked files, confirming no existing Flutter source, config, or docs were changed — the hard guardrail from the plan holds.

### Verification evidence

The coder's report lives at `.agents/tasks/web-verification.md` (not the `web/VERIFICATION.md` the review prompt guessed; the plan's step 16 specifies the former, so this is correct, not missing). It records that Node is absent and the optional `node --check` was skipped as planned, that the gstatic base URL returned HTTP 200, and that the PNGs were generated via .NET `System.Drawing`. The per-item consistency tables in that report match what the source read independently confirmed, so no re-run of any check was needed.

</details>

<details>
<summary>File map</summary>

- `web/index.html` — app shell, bottom nav, module entry, manifest/icon/stylesheet links
- `web/manifest.webmanifest` — PWA manifest, three icons, standalone
- `web/service-worker.js` — classic Cache-API app-shell worker, no Firebase import
- `web/css/styles.css` — mobile-first styles (not individually audited; referenced correctly)
- `web/icons/icon.svg|icon-192.png|icon-512.png` — app icons, valid PNG signatures confirmed
- `web/js/app.js` — bootstrap: gated Firebase init + anon sign-in, router registration, SW register
- `web/js/router.js` — hash router with `:id` capture and previous-route cleanup contract
- `web/js/models.js` — `MagicPhoto` factory + Firestore converters (six-field shape)
- `web/js/firebase-config.js` — `REPLACE_ME` placeholder + `isFirebaseConfigured()`
- `web/js/firebase-service.js` — Auth/Firestore/Storage wrapper, pinned gstatic v10.14.1 imports
- `web/js/image-matcher.js` — `ImageMatcher` interface + dHash `PerceptualHashMatcher`, ORB comment
- `web/js/share.js` — `shareMagicPhoto` Web Share + clipboard fallback
- `web/js/ui.js` — shared `renderConfigBanner`, `showToast`, `el`
- `web/js/screens/home.js` — photo grid, loading/empty/error states, listener cleanup
- `web/js/screens/upload.js` — photo + video (file or URL) form, progress, validation
- `web/js/screens/detail.js` — play overlay → video player → back, share
- `web/js/screens/scan.js` — camera scan → hash → match → play, full teardown
- `web/README.md` — flows, secure-context requirement, localhost + hosted-https paths, Firebase rules

Verification evidence: `.agents/tasks/web-verification.md`. No full diff (all files are new under `web/`).

</details>
