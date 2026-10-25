# Implementation Plan — Magic Photo (Flutter)

A living-photo app: a photo acts as a gateway to a linked video. Users upload a photo + video, see a play-button overlay on the photo, share it, and a second user can point their camera at the same printed/on-screen photo to recognize it on-device (perceptual hash) and play the linked video.

## Design decisions (made during planning, grounded in exploration)

- **Environment**: The project directory is empty and NO Flutter/Dart SDK is on PATH (verified: `flutter` and `dart` both unrecognized; directory item count = 0). Therefore platform folders cannot be generated here and `flutter analyze` cannot run. **Chosen approach for platform folders**: hand-author only the files the user must edit (AndroidManifest.xml, Info.plist, app-level build.gradle snippet) PLUS a `SETUP.md` instructing the user to run `flutter create .` first to generate the full `android/`, `ios/`, and other platform trees, then apply the documented permission edits. This yields a runnable project without hand-authoring the impractical full runner trees. Rationale: `flutter create .` on a directory that already contains `lib/` and `pubspec.yaml` preserves them and fills in the missing platform scaffolding.
- **Verification**: Since no SDK is present, verification is a **manual consistency pass** (imports resolve by path, class/method names match across files, routes wired, model fields used consistently). The plan notes where `flutter pub get` + `flutter analyze` would run if the SDK were available. Do NOT launch an emulator or `flutter run`.
- **Dependency versions**: Pin a known mutually-compatible FlutterFire generation (firebase_core ^3.6.0 / cloud_firestore ^5.4.3 / firebase_storage ^12.3.2 / firebase_auth ^5.3.1; Flutter >=3.3, Dart >=3.3). Rationale: the very newest FlutterFire BoM requires Flutter 3.27+/Dart 3.6+, which the user's unknown SDK may not meet; the pinned generation is broadly resolvable and still recent. Use caret ranges so `flutter pub get` can resolve patch/minor updates; SETUP.md tells the user to run `flutter pub upgrade` if their SDK needs newer versions.
- **Image matcher**: Perceptual hashing in pure Dart (dHash as primary, 64-bit, 9x8 grayscale difference hash — simple and robust to minor scaling/compression). Matching by Hamming distance with a configurable threshold (default 10 of 64 bits). Hidden behind an `ImageMatcher` interface so an OpenCV ORB matcher can replace it later without touching UI; a code comment marks ORB as the planned future enhancement. Rationale: dHash is cheaper and more tolerant than average-hash for photos; pure Dart keeps it open-source and on-device with no paid API / no ML Kit.
- **Scan throttling**: Process at most one camera frame every ~700ms (ignore frames while a comparison is in flight) to keep the UI responsive and avoid CPU thrash. Convert `CameraImage` (YUV420/BGRA) frames to an `image` package `Image`, downscale, then hash. Rationale: real-time per-frame hashing is wasteful; throttling is enough for a "hold steady on the photo" UX.
- **Auth**: Anonymous Firebase Auth → no login screen; `ownerId` = anonymous uid. Home gallery queries only the current uid's records. Rationale: matches the "free, no login" requirement.

## Firestore / Storage layout

- Firestore collection `magic_photos`, one document per magic photo:
  - `id` (string, = doc id, a uuid)
  - `photoUrl` (string, Storage download URL)
  - `videoUrl` (string, Storage download URL)
  - `perceptualHash` (string, 16 hex chars = 64-bit dHash)
  - `createdAt` (Firestore `Timestamp`)
  - `ownerId` (string, anonymous uid)
- Storage paths: `users/{uid}/photos/{uuid}.jpg` and `users/{uid}/videos/{uuid}.mp4`.
- Scan matching queries all `magic_photos` (across owners, so a second user can match) ordered/limited reasonably; compares each stored `perceptualHash` against the live frame hash by Hamming distance. (Note in README: a production app would narrow this or use a cheaper index; for the free-tier demo a full scan of the collection is acceptable.)

## pHash (dHash) algorithm steps (implemented in image_matcher.dart)

1. Decode image bytes with `img.decodeImage`.
2. Convert to grayscale (`img.grayscale`).
3. Resize to 9x8 (width 9, height 8) with `img.copyResize`.
4. For each of the 8 rows, compare each pixel to its right neighbor (9 cols → 8 comparisons): bit = 1 if left luminance > right luminance else 0. This yields 8x8 = 64 bits.
5. Pack the 64 bits into a 16-char hex string (the stored `perceptualHash`).
6. Hamming distance = count of differing bits between two 64-bit hashes; match if distance <= threshold (default 10).

## Scan → match → play control flow

1. `ScanScreen` requests camera permission (permission_handler), initializes `CameraController`, starts `startImageStream`.
2. On each throttled frame: convert `CameraImage` → `img.Image`, compute dHash via `PerceptualHashMatcher`.
3. Fetch candidate hashes once at scan start (and cache) via `FirebaseService.fetchAllRecords()`; for each frame hash, find the stored record with minimum Hamming distance <= threshold.
4. On first match: stop the image stream, dispose controller, `Navigator.push` to `VideoPlayerScreen(videoUrl, photoUrl)`. On back, return to scan or home.
5. States surfaced in UI: initializing camera, scanning (live preview + hint), no-match-yet (keep scanning), permission denied (prompt to open settings), match found (brief indicator then navigate).

## Routing map (main.dart)

- `WidgetsFlutterBinding.ensureInitialized()` → `Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform)` → anonymous sign-in if no current user.
- `MaterialApp` with named routes:
  - `/` → `HomeScreen`
  - `/upload` → `UploadScreen`
  - `/detail` → `PhotoDetailScreen` (arg: `MagicPhoto`)
  - `/video` → `VideoPlayerScreen` (args: videoUrl, photoUrl)
  - `/scan` → `ScanScreen`
- Use `onGenerateRoute` (or typed arguments via `ModalRoute.settings.arguments`) so model/string args pass cleanly.

---

# Implementation steps

- [ ] 1. Create `pubspec.yaml` with app metadata, SDK/environment constraints, and the pinned dependency set.
      Dependencies (caret ranges): `firebase_core: ^3.6.0`, `cloud_firestore: ^5.4.3`, `firebase_storage: ^12.3.2`, `firebase_auth: ^5.3.1`, `camera: ^0.11.0`, `image_picker: ^1.1.2`, `image: ^4.2.0`, `video_player: ^2.9.1`, `share_plus: ^10.0.2`, `permission_handler: ^11.3.1`, `uuid: ^4.5.0`, `path_provider: ^2.1.4`; plus `cupertino_icons`. `environment: sdk: '>=3.3.0 <4.0.0'`, `flutter: '>=3.3.0'`. Include `flutter_lints` under dev_dependencies and `uses-material-design: true`.
      Files: `pubspec.yaml`
      Verify: manual — confirm every required package is present and names/versions are valid caret ranges; if SDK available, `flutter pub get` resolves without conflict.

- [ ] 2. Create `analysis_options.yaml` including `package:flutter_lints/flutter.yaml`.
      Files: `analysis_options.yaml`
      Verify: manual — file includes the lints ruleset; if SDK available it is picked up by `flutter analyze`.

- [ ] 3. Create `lib/firebase_options.dart` as a clearly-marked PLACEHOLDER: a `DefaultFirebaseOptions` class with `currentPlatform` getter and stub `FirebaseOptions` for android/ios/web, every field set to obvious placeholder strings (e.g. `'REPLACE_ME'`) with a top-of-file TODO block telling the user to run `flutterfire configure` to overwrite this file. Do NOT invent real credentials.
      Files: `lib/firebase_options.dart`
      Verify: manual — class/getter names match what `main.dart` imports (`DefaultFirebaseOptions.currentPlatform`); placeholders clearly marked.

- [ ] 4. Create `lib/models/magic_photo.dart` — immutable model with fields `id, photoUrl, videoUrl, perceptualHash, createdAt (DateTime), ownerId`; `toMap()` (writes `createdAt` as `Timestamp`/`FieldValue.serverTimestamp` strategy documented) and `fromFirestore(DocumentSnapshot)` / `fromMap(Map, id)` factory. Handle null/absent `createdAt` gracefully.
      Files: `lib/models/magic_photo.dart`
      Verify: manual — field names match Firestore layout above and match usages in `firebase_service.dart` and screens.

- [ ] 5. Create `lib/services/image_matcher.dart` — abstract `ImageMatcher` with `String computeHash(Uint8List bytes)` / `computeHashFromImage(img.Image)`, `int hammingDistance(String a, String b)`, and `bool isMatch(String a, String b, {int threshold})`; and `PerceptualHashMatcher implements ImageMatcher` using the dHash steps above (default threshold 10). Add a code comment that ORB (OpenCV) is the planned future enhancement and that the interface exists so it can be swapped without UI changes. Add a concise comment block explaining the pHash algorithm.
      Files: `lib/services/image_matcher.dart`
      Verify: manual — pure Dart, only imports `dart:typed_data` and `package:image/image.dart`; method signatures used consistently by scan/upload.

- [ ] 6. Create `lib/services/firebase_service.dart` — wraps Auth/Firestore/Storage: `ensureSignedIn()` (anonymous), `uploadMagicPhoto({File photo, File video})` → uploads both to Storage under the uid, computes hash via `PerceptualHashMatcher` on the photo bytes, writes a `magic_photos` doc, returns the `MagicPhoto`; `streamMyPhotos()` → `Stream<List<MagicPhoto>>` for the current uid; `fetchAllRecords()` → `Future<List<MagicPhoto>>` for scan matching; expose `currentUid`. Handle upload progress/errors.
      Files: `lib/services/firebase_service.dart`
      Verify: manual — imports resolve (`cloud_firestore`, `firebase_storage`, `firebase_auth`, model, matcher); method names match screen call sites; collection/paths match the layout section.

- [ ] 7. Create shared widgets in `lib/widgets/`: `play_button_overlay.dart` (a tappable circular play icon centered over a child) and `loading_indicator.dart` (centered spinner with optional label). Keep them stateless and reusable.
      Files: `lib/widgets/play_button_overlay.dart`, `lib/widgets/loading_indicator.dart`
      Verify: manual — widget class names match imports in detail/upload/scan screens.

- [ ] 8. Create `lib/main.dart` — `main()` ensures binding, initializes Firebase with `DefaultFirebaseOptions.currentPlatform`, performs anonymous sign-in, then `runApp`. `MagicPhotoApp` is a `MaterialApp` with the routing map above (via `onGenerateRoute` for typed args). Show a bootstrap loading screen while Firebase init / sign-in completes and an error screen on init failure.
      Files: `lib/main.dart`
      Verify: manual — every route target class exists and is imported; arg types match each screen's expected arguments.

- [ ] 9. Create `lib/screens/home_screen.dart` — `StreamBuilder` over `FirebaseService.streamMyPhotos()` showing a grid/list of the user's magic photos (thumbnail from `photoUrl`, tap → `/detail`); AppBar/FAB actions for Upload (`/upload`) and Scan (`/scan`); empty-state message when no photos; loading and error states.
      Files: `lib/screens/home_screen.dart`
      Verify: manual — uses `MagicPhoto` fields and `FirebaseService` methods as defined; navigation route names match main.dart.

- [ ] 10. Create `lib/screens/upload_screen.dart` — pick a photo and a video via `image_picker` (`pickImage`/`pickVideo`); request media permission via `permission_handler` where needed; preview selections; on submit call `FirebaseService.uploadMagicPhoto(...)` showing an uploading indicator; on success pop back to home; surface errors via SnackBar. Disable submit until both are picked.
      Files: `lib/screens/upload_screen.dart`
      Verify: manual — `image_picker`/`permission_handler` APIs used correctly; service call signature matches step 6; uses `loading_indicator` widget.

- [ ] 11. Create `lib/screens/photo_detail_screen.dart` — receives a `MagicPhoto`; shows the photo full-bleed with `PlayButtonOverlay`; tapping play navigates to `/video` with `videoUrl` + `photoUrl`; a Share action (`share_plus`) shares the photo URL, the video URL, and a deep-link-style text that references the photo id (document the deep-link scheme as a note/TODO since full deep-link routing is out of scope for this build); back returns to home.
      Files: `lib/screens/photo_detail_screen.dart`
      Verify: manual — overlay widget + model used; share_plus `Share.share`/`SharePlus` API used per the pinned version; route args to `/video` match VideoPlayerScreen.

- [ ] 12. Create `lib/screens/video_player_screen.dart` — receives `videoUrl` (+ `photoUrl` for back context); uses `video_player` `VideoPlayerController.networkUrl`; init with loading state, play/pause control, and an AppBar back button that disposes the controller and returns to the photo. Handle init error.
      Files: `lib/screens/video_player_screen.dart`
      Verify: manual — `video_player` controller lifecycle (init/dispose) correct; back navigation returns to detail/photo.

- [ ] 13. Create `lib/screens/scan_screen.dart` — implement the scan→match→play flow from the control-flow section: request camera permission, init `CameraController`, `startImageStream` with ~700ms throttle, convert frames to `img.Image`, compute dHash, match against `FirebaseService.fetchAllRecords()` by Hamming distance (threshold from matcher), on match stop stream/dispose and navigate to `/video`. Show scanning hint, no-match-yet state, permission-denied state (open-settings prompt), and handle `didChangeAppLifecycleState` to release/re-init the camera. Add a concise comment explaining the scan→match→play path.
      Files: `lib/screens/scan_screen.dart`
      Verify: manual — `camera`/`permission_handler`/matcher/service APIs used consistently; YUV420→Image conversion handles plane strides; navigation args match VideoPlayerScreen.

- [ ] 14. Create `android/app/src/main/AndroidManifest.xml` (hand-authored, the file the user must edit) with `<uses-permission>` for `INTERNET`, `CAMERA`, and media/storage (`READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, and legacy `READ_EXTERNAL_STORAGE` with `maxSdkVersion` for older APIs), plus the standard `<application>`/`<activity>` block for a Flutter app. Also create an `android/app/build.gradle` snippet file (or documented block in SETUP.md) noting `minSdkVersion 24` (camera plugin requires SDK 24+) and `multiDexEnabled true`.
      Files: `android/app/src/main/AndroidManifest.xml`, `android/app/build.gradle` (snippet) — final merge happens after `flutter create .`
      Verify: manual — permission entries present and spelled correctly; minSdk note matches camera plugin requirement (24+).

- [ ] 15. Create `ios/Runner/Info.plist` (hand-authored) containing `NSCameraUsageDescription`, `NSMicrophoneUsageDescription` (camera plugin records/streams), `NSPhotoLibraryUsageDescription`, and `NSPhotoLibraryAddUsageDescription`, each with a human-readable reason, inside the standard Info.plist dict. Note iOS 13+ deployment target in SETUP.md (camera plugin requirement).
      Files: `ios/Runner/Info.plist`
      Verify: manual — all four usage-description keys present with non-empty strings.

- [ ] 16. Create top-level `SETUP.md` — exact commands and ordered steps: (1) install Flutter + confirm `flutter doctor`; (2) run `flutter create .` in the project root to generate platform folders (preserving existing `lib/`, `pubspec.yaml`); (3) re-apply the documented AndroidManifest/Info.plist/build.gradle permission edits (or confirm they merged); (4) create a free Firebase (Spark) project, enable Firestore, Storage, and Anonymous Auth; (5) `dart pub global activate flutterfire_cli` and run `flutterfire configure` to overwrite `lib/firebase_options.dart`; (6) `flutter pub get` (and `flutter pub upgrade` if version conflicts); (7) `flutter run`. Include the Firestore security-rules starting point and a Storage rules starting point (authenticated read/write, scoped by uid for writes). Note the pHash framing limitation and ORB as the future improvement.
      Files: `SETUP.md`
      Verify: manual — commands are exact and ordered; covers Firebase enablement, flutterfire configure, pub get, run; includes rules snippets.

- [ ] 17. Create top-level `README.md` — architecture overview (the four flows, the layered structure models/services/screens/widgets, the `ImageMatcher`/pHash design and ORB future plan), the Firestore/Storage data layout, how matching works and its known limitation (best when the scanned photo is framed similarly to the original), and a pointer to SETUP.md for setup/run commands. Add a short `.gitignore` note (or create `.gitignore`) excluding build artifacts and `firebase_options.dart`-style secrets guidance.
      Files: `README.md`, `.gitignore`
      Verify: manual — README accurately reflects the files and design actually created; links to SETUP.md.

- [ ] 18. Final consistency pass across all files (the project-wide verification step, since no Flutter SDK is available here): confirm every `import` path points at a file that exists; every class/method referenced across files is defined with matching signatures; all `MaterialApp` routes resolve to existing screens with matching argument types; `MagicPhoto` field names are identical everywhere; dependency names in `pubspec.yaml` match the packages imported in code. Record findings.
      Files: (review only — no new files)
      Verify: manual — produce a checklist result confirming imports resolve, names match, and routes are wired. If a Flutter SDK is later available, the equivalent automated check is `flutter pub get` then `flutter analyze` (expected: no errors). Do NOT run an emulator or `flutter run`.

## Notes / assumptions

- `firebase_options.dart` is intentionally a placeholder; the app will not connect to Firebase until the user runs `flutterfire configure`. This is expected and documented in SETUP.md.
- Deep-link "open in app" sharing is implemented as shareable text/URLs referencing the photo id; full custom-scheme deep-link routing (e.g. `app_links`) is noted as a follow-up and not required for this build, since the task lists deep link "or" the content via the OS share sheet.
- If specific pinned versions fail to resolve against the user's installed Flutter SDK, SETUP.md directs them to `flutter pub upgrade`; the caret ranges are chosen from a known mutually-compatible FlutterFire generation to minimize this.
