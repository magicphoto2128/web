# Magic Photo — Flutter app, four-flow living-photo build

The app delivers all four required flows — upload a photo+video pair, play the linked video from a photo with an overlay, share via the OS share sheet, and scan a photo with the camera to recognize and play its video — on the fixed stack: Firebase free tier (Firestore + Storage + anonymous Auth via the official FlutterFire plugins) and open-source on-device perceptual hashing built on the `image` and `camera` packages, with no Google ML Kit, no paid API, and no proprietary SDK. Recognition sits behind an `ImageMatcher` interface with a pure-Dart `PerceptualHashMatcher` (dHash + Hamming distance + configurable threshold), and the ORB future-enhancement is noted in code. The review is a manual internal-consistency pass; per the task, builds were not re-run and `.agents/tasks/verification.md` supplies the evidence of what the coder could and could not execute.

Watch for: a Firestore `orderBy('createdAt')` on a server-timestamp field that briefly hides a just-uploaded photo from the owner's gallery until the timestamp resolves (likely, non-blocking); `flutter analyze` was never run because no Dart/Flutter SDK is present in the environment (confirmed, documented, accepted by the task). No blocking issues found.

**Verdict**: APPROVED

## High-level view

The code is internally consistent. Every relative import resolves to a file that exists, every package import maps to a declared `pubspec.yaml` dependency, and the `MagicPhoto` model's six fields (`id`, `photoUrl`, `videoUrl`, `perceptualHash`, `createdAt`, `ownerId`) are used with identical names across the model, the service, and all screens. Routing is centralized in `main.dart` via `onGenerateRoute`, and every named route the screens navigate to (`/`, `/upload`, `/scan`, `/detail`, `/video`) resolves to an existing screen with a matching argument type.

The matcher is the heart of the "open source, on-device" requirement and it holds up. `PerceptualHashMatcher` implements the `ImageMatcher` interface in pure Dart, importing only `dart:typed_data` and `package:image/image.dart`. It computes a 64-bit dHash (grayscale → 9×8 resize → left-vs-right luminance comparison → 16 hex chars), measures similarity by Hamming distance, and gates matches on a configurable threshold (default 10). The ORB-future-enhancement comment is present on the interface.

The scan→match→play path is coherent: the scan screen requests camera permission through `permission_handler`, fetches candidate records once at scan start, throttles frame processing to ~700ms, converts YUV420/BGRA8888 frames to an `image` Image, hashes them, picks the stored record with the smallest in-threshold Hamming distance, and on a match stops the stream, disposes the camera, and navigates to the video player. No-match keeps scanning, permission-denied offers an open-settings prompt, and a device-error state offers retry.

Firebase is wired correctly behind a thin service: anonymous sign-in sets `ownerId` from the uid, uploads write photo and video to `users/{uid}/...` Storage paths and persist a `magic_photos` Firestore document, the owner gallery streams the current uid's docs, and `fetchAllRecords()` reads across owners so a second user can match someone else's photo. `firebase_options.dart` is an unmistakable placeholder with `REPLACE_ME` values and no invented credentials.

Async, loading, and error states are handled across bootstrap, upload progress, scanning, no-match, and video init. Platform permission files (AndroidManifest, build.gradle snippet, Info.plist) and the SETUP/README docs with exact commands are all present. The one behavioral wrinkle worth a reviewer's eye is the gallery query ordering on a server timestamp; it is self-correcting and non-blocking.

<details>
<summary>Issues (2)</summary>

1. **Gallery ordering on server timestamp** — `streamMyPhotos()` uses `orderBy('createdAt', descending: true)` while `createdAt` is written as `FieldValue.serverTimestamp()`, so a just-uploaded doc carries a null `createdAt` locally until the server resolves it and can be briefly omitted from the ordered result. Self-correcting on the next snapshot; optionally order by a client-set field or tolerate the latency. Non-blocking.
2. **No static analysis run** — `flutter analyze` / `flutter pub get` were never executed because no Dart/Flutter SDK exists in the build environment. Documented in verification.md and SETUP.md; the user must run them after `flutter create .`. Accepted by the task constraints, not a defect in the code.

</details>

<details>
<summary>Details</summary>

### Matcher threshold symmetry

The upload path (via `FirebaseService`'s injected matcher) and the scan screen (its own `const PerceptualHashMatcher()`) are two separate matcher instances but both use the default threshold of 10, so the fingerprint produced at upload and the distance gate applied at scan run the same algorithm with the same parameters. That symmetry is what makes stored hashes and live-frame hashes comparable; a threshold override passed to only one side would silently break matching, so it is worth keeping the default as the single source of truth.

### Scan frame handling and robustness

The YUV420 conversion derives the chroma pixel stride from `bytesPerPixel`, which handles the interleaved-chroma (NV21-like) layout rather than assuming planar; BGRA8888 (iOS) wraps plane 0 with `ChannelOrder.bgra`. A frame in an unexpected format returns null and is skipped rather than crashing the stream, a per-frame exception is swallowed so one bad frame does not end the scan, the `_navigated` / `_processing` guards prevent double-navigation and re-entrant hashing, and `didChangeAppLifecycleState` releases the camera on pause and restarts on resume.

### Firebase service surface and the ordering caveat

`fetchAllRecords()` deliberately does not scope by uid (default `limit` 500) so a second user can match another owner's photo, which is what makes the cross-user scan requirement work; `streamMyPhotos()` does scope to the current uid. The one behavioral caveat is that `streamMyPhotos()` orders by `createdAt` while `toMap()` writes `createdAt` as `FieldValue.serverTimestamp()`. A freshly written doc has a null `createdAt` locally until the server round-trips, so the `orderBy('createdAt')` query can transiently exclude the just-uploaded photo from the owner's gallery. The `StreamBuilder` re-emits once the timestamp resolves, so it is momentary UI latency, not data loss, and does not block.

### Routing and model consistency

`main.dart` centralizes routing in `onGenerateRoute`, casting `settings.arguments` to `MagicPhoto` for `/detail` and `VideoPlayerArgs` for `/video`. The navigation call sites agree with those argument types across `home_screen.dart`, `photo_detail_screen.dart`, and `scan_screen.dart`, and `MagicPhoto.fromMap` tolerates a missing or not-yet-resolved `createdAt` — the correct complement to the server-timestamp write above, and the reason the ordering caveat stays cosmetic rather than throwing.

### Permissions and auth posture

The scan flow requests `Permission.camera.request()` before initializing the controller and offers `openAppSettings()` when denied, satisfying runtime-permission-before-camera-use. The upload flow relies on `image_picker`'s own platform media access instead of a `permission_handler` call — the plan's documented decision, correct for gallery selection on modern Android/iOS, and worth flagging only because it means media permission is not requested through `permission_handler` the way camera is. Anonymous auth is established in `ensureSignedIn()` and the uid flows into `ownerId` on every upload, so the Firestore owner-only write rule in SETUP.md has a real value to check against. `firebase_options.dart` is a clearly marked placeholder (`REPLACE_ME` everywhere, `UnsupportedError` for unconfigured platforms, no invented credentials).

### pubspec and platform files

`pubspec.yaml` declares every package imported anywhere in `lib/` at the plan's pinned caret ranges. `path_provider` is declared but unused — harmless, not an analyzer error. The AndroidManifest carries INTERNET, CAMERA, READ_MEDIA_IMAGES, READ_MEDIA_VIDEO, and legacy READ_EXTERNAL_STORAGE (`maxSdkVersion="32"`); the build.gradle snippet notes minSdk 24 and multiDex; Info.plist carries all four usage-description keys. SETUP.md and README.md give the exact ordered commands — `flutter create .`, `flutterfire configure`, `flutter pub get`, `flutter run` — plus Firestore/Storage rules.

### Verification evidence

`.agents/tasks/verification.md` records that neither `flutter` nor `dart` is on PATH, so `flutter pub get` and `flutter analyze` could not run, and the coder performed a manual consistency pass instead (imports, names, routes, model fields, third-party API usage against the pinned versions). This matches the task's own instruction not to re-run the suites and to rely on the recorded evidence. The absence of a static-analysis run is therefore a known, documented environment limitation to be resolved by the user after `flutter create .`, not a code defect.

</details>

<details>
<summary>File map</summary>

- `lib/main.dart` — Firebase bootstrap, anonymous sign-in, `onGenerateRoute` routing table, loading/error bootstrap UI.
- `lib/firebase_options.dart` — clearly-marked `REPLACE_ME` placeholder; no real credentials.
- `lib/models/magic_photo.dart` — immutable model + `toMap`/`fromFirestore`/`fromMap`; server-timestamp `createdAt`.
- `lib/services/image_matcher.dart` — `ImageMatcher` interface + pure-Dart `PerceptualHashMatcher` (dHash, Hamming, threshold), ORB comment.
- `lib/services/firebase_service.dart` — anonymous auth, Storage upload, Firestore read/write, `streamMyPhotos`/`fetchAllRecords`.
- `lib/screens/home_screen.dart` — owner gallery grid, Upload/Scan actions, empty/loading/error states.
- `lib/screens/upload_screen.dart` — pick photo+video, upload with progress, SnackBar errors.
- `lib/screens/photo_detail_screen.dart` — photo + play overlay + `share_plus` share with deep-link text.
- `lib/screens/video_player_screen.dart` — `video_player` playback, back button, init-error state.
- `lib/screens/scan_screen.dart` — camera scan, frame conversion, hash match, navigate on match; permission/no-match/error states.
- `lib/widgets/play_button_overlay.dart`, `lib/widgets/loading_indicator.dart` — shared UI widgets.
- `android/app/src/main/AndroidManifest.xml`, `android/app/build.gradle.snippet`, `ios/Runner/Info.plist` — permission/platform edits.
- `pubspec.yaml`, `analysis_options.yaml`, `SETUP.md`, `README.md`, `.gitignore` — deps, lints, setup/run docs.

Full source reviewed directly in `lib/` and the platform files listed above.

</details>
