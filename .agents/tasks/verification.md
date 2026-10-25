# Verification — Magic Photo (first iteration)

## Flutter SDK availability

The Flutter/Dart SDK is **NOT available** in this environment. Both checks
returned no command:

```powershell
Get-Command flutter   # -> not found
Get-Command dart      # -> not found
```

Therefore `flutter pub get` and `flutter analyze` could not be run. Per the
task instructions, verification was done as a **thorough manual consistency
pass** instead. The equivalent automated check, once a Flutter SDK is present,
is: `flutter pub get` then `flutter analyze` (expected: no errors; warnings
about missing platform folders are acceptable until `flutter create .` is run,
as documented in SETUP.md).

## What was checked

### 1. Every import points at a file/package that exists

All `lib/**/*.dart` imports were enumerated. Package imports map to declared
pubspec dependencies:

| Package import            | pubspec dependency   |
| ------------------------- | -------------------- |
| firebase_core             | firebase_core        |
| cloud_firestore           | cloud_firestore      |
| firebase_auth             | firebase_auth        |
| firebase_storage          | firebase_storage     |
| camera                    | camera               |
| image_picker              | image_picker         |
| image                     | image                |
| video_player              | video_player         |
| share_plus                | share_plus           |
| permission_handler        | permission_handler   |
| uuid                      | uuid                 |
| flutter / flutter_test    | sdk: flutter         |

Relative imports resolve to existing files:
- `firebase_options.dart`, `models/magic_photo.dart`,
  `services/firebase_service.dart`, `services/image_matcher.dart`,
  `screens/{home,upload,photo_detail,video_player,scan}_screen.dart`,
  `widgets/{loading_indicator,play_button_overlay}.dart`, `main.dart`
  — all present on disk.

Note: `path_provider` is declared in pubspec (per plan) but not imported by any
current source file; a declared-but-unused dependency is not an analyzer error.

### 2. Class / method names match across files

- `FirebaseService` call sites all resolve to defined methods:
  - `ensureSignedIn()` (main.dart) ✓
  - `streamMyPhotos()` (home_screen.dart) ✓
  - `uploadMagicPhoto({required File photo, required File video, void Function(double)? onProgress})` (upload_screen.dart) ✓
  - `fetchAllRecords()` (scan_screen.dart) ✓
- `ImageMatcher` / `PerceptualHashMatcher`:
  - `computeHash(Uint8List)` used by `FirebaseService.uploadMagicPhoto`.
  - `computeHashFromImage(img.Image)`, `hammingDistance(String,String)`,
    `threshold` used by `ScanScreen`.
  - `isMatch` signature `{int? threshold}` matches between interface and impl.
- Widgets: `LoadingIndicator`, `PlayButtonOverlay` match their imports/usages.
- `DefaultFirebaseOptions.currentPlatform` matches the `main.dart` usage.

### 3. Routes wired in main.dart

`onGenerateRoute` handles every screen's `routeName` constant, and each
`Navigator` call uses the matching constant with the matching argument type:

| Route (`routeName`)        | Target                | Argument type       |
| -------------------------- | --------------------- | ------------------- |
| `/`  HomeScreen            | HomeScreen            | none                |
| `/upload` UploadScreen     | UploadScreen          | none                |
| `/scan` ScanScreen         | ScanScreen            | none                |
| `/detail` PhotoDetailScreen| PhotoDetailScreen     | `MagicPhoto`        |
| `/video` VideoPlayerScreen | VideoPlayerScreen     | `VideoPlayerArgs`   |

- `home_screen.dart` pushes `/detail` with a `MagicPhoto` ✓, `/upload` ✓,
  `/scan` ✓.
- `photo_detail_screen.dart` and `scan_screen.dart` push `/video` with a
  `VideoPlayerArgs` ✓.

### 4. Model field names consistent everywhere

`MagicPhoto` fields `id, photoUrl, videoUrl, perceptualHash, createdAt,
ownerId` are used identically in `firebase_service.dart` (toMap/fromFirestore),
`home_screen.dart`, `photo_detail_screen.dart`, and `scan_screen.dart`. The
Firestore field names in `toMap()`/`fromMap()` match the layout in the plan and
the security rules in SETUP.md (`ownerId`, `perceptualHash`, `createdAt`).

### 5. Third-party API usage (version-checked against the pinned ranges)

- `image` ^4.2.0: `decodeImage`, `grayscale`, `copyResize`, `getPixel(...).luminance`,
  `setPixelRgb`, and `Image.fromBytes(width:, height:, bytes:, rowStride:, order: ChannelOrder.bgra)`
  are all 4.x APIs (confirmed against the image 4.x docs / CameraImage→Image
  conversion examples).
- `share_plus` ^10.0.2: static `Share.share(text, {subject})` is valid in 10.x
  (the `SharePlus.instance` singleton is 11.x and intentionally not used).
- `video_player` ^2.9.1: `VideoPlayerController.networkUrl(Uri)` is the current
  constructor.
- `camera` ^0.11.0: `availableCameras`, `CameraController`, `startImageStream`,
  `stopImageStream`, `value.isStreamingImages`, `CameraPreview`,
  `ImageFormatGroup.yuv420/bgra8888` all current.
- `permission_handler` ^11.3.1: `Permission.camera.request()`,
  `status.isGranted`, `openAppSettings()` all current.

## Platform / permissions files

- `android/app/src/main/AndroidManifest.xml`: INTERNET, CAMERA,
  READ_MEDIA_IMAGES, READ_MEDIA_VIDEO, and legacy READ_EXTERNAL_STORAGE
  (`maxSdkVersion="32"`) present.
- `android/app/build.gradle.snippet`: `minSdkVersion 24`, `multiDexEnabled true`.
- `ios/Runner/Info.plist`: NSCameraUsageDescription, NSMicrophoneUsageDescription,
  NSPhotoLibraryUsageDescription, NSPhotoLibraryAddUsageDescription present.
- `SETUP.md` documents running `flutter create .` first, then merging these
  edits.

## Result

Manual consistency pass PASSED: imports resolve, class/method/field names match
across files, all named routes resolve to existing screens with matching
argument types, and all imported packages are declared in `pubspec.yaml`. No
Flutter SDK was available to run `flutter analyze`; that step should be run by
the user/reviewer after `flutter create .` + `flutter pub get`.
