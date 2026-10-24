# Magic Photo — Setup

Follow these steps in order. This project ships the Dart source (`lib/`),
`pubspec.yaml`, and hand-authored permission files, but **not** the full
platform folders — you generate those with `flutter create .`.

## 1. Install Flutter and verify

Install Flutter (https://docs.flutter.dev/get-started/install), then:

```bash
flutter doctor
```

Resolve anything `flutter doctor` flags (Android toolchain, Xcode on macOS, a
connected device or emulator).

## 2. Generate the platform folders

From the project root (the folder containing `pubspec.yaml`):

```bash
flutter create .
```

`flutter create .` preserves the existing `lib/` and `pubspec.yaml` and fills in
the missing `android/`, `ios/`, and other platform scaffolding.

## 3. Re-apply the permission edits

`flutter create .` writes its own default `android/app/src/main/AndroidManifest.xml`
and `ios/Runner/Info.plist`. Replace / merge them with the hand-authored copies
in this repo so the permissions are present:

- **Android** — ensure `android/app/src/main/AndroidManifest.xml` contains the
  `INTERNET`, `CAMERA`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, and legacy
  `READ_EXTERNAL_STORAGE` (`maxSdkVersion="32"`) permissions from the version in
  this repo.
- **Android build** — in `android/app/build.gradle`, set `minSdkVersion 24` and
  `multiDexEnabled true` (see `android/app/build.gradle.snippet`). The camera
  plugin needs API 24+; Firebase needs multiDex.
- **iOS** — ensure `ios/Runner/Info.plist` contains `NSCameraUsageDescription`,
  `NSMicrophoneUsageDescription`, `NSPhotoLibraryUsageDescription`, and
  `NSPhotoLibraryAddUsageDescription`. Set the iOS deployment target to **13.0+**
  (camera plugin requirement) in Xcode or `ios/Podfile`
  (`platform :ios, '13.0'`).

## 4. Create a free Firebase (Spark) project

1. Go to https://console.firebase.google.com and create a new project (the
   free **Spark** plan is enough).
2. In the project, enable:
   - **Firestore Database** (start in production mode, then apply the rules
     below).
   - **Storage**.
   - **Authentication → Sign-in method → Anonymous** (toggle it on).

## 5. Wire Firebase into the app

Install the FlutterFire CLI and run configure from the project root:

```bash
dart pub global activate flutterfire_cli
flutterfire configure
```

Pick your Firebase project and the platforms you target (Android/iOS). This
**overwrites** `lib/firebase_options.dart` with real values, replacing the
placeholder shipped in this repo.

## 6. Install dependencies

```bash
flutter pub get
```

If your installed Flutter SDK reports version conflicts with the pinned
dependencies, run:

```bash
flutter pub upgrade
```

## 7. Run

```bash
flutter run
```

---

## Firestore security rules (starting point)

Collection `magic_photos`: anyone signed in may read (so a second user can
match a photo they did not upload); only the owner may create/update/delete
their own documents.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /magic_photos/{docId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null
                    && request.resource.data.ownerId == request.auth.uid;
      allow update, delete: if request.auth != null
                    && resource.data.ownerId == request.auth.uid;
    }
  }
}
```

## Storage security rules (starting point)

Authenticated users may read any object (needed for cross-user playback); a
user may only write under their own `users/{uid}/...` path.

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{uid}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

---

## Known limitation

Recognition uses a perceptual hash (dHash). It works best when the scanned
photo is framed similarly to the original (roughly square-on, filling the
frame, decent light). Large rotation, perspective, or partial framing can miss.
A future **OpenCV ORB feature matcher** (planned, behind the existing
`ImageMatcher` interface) would be far more robust.
