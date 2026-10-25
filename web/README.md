# Magic Photo — Static PWA (web/)

A browser version of the Magic Photo app, built as **plain static HTML / CSS /
vanilla-JS ES modules** — no build tooling, no npm, no bundler, no SDK. Every
third-party library loads from a public CDN. You can browse the UI by opening
the files, and get the full experience (camera + install) by serving them over
a secure origin.

A photo is a gateway to a linked video. Four flows:

1. **Upload** — pick a photo and link a video, either by uploading a local
   video file **or** by pasting a video URL. A perceptual-hash fingerprint of
   the photo is computed on-device and stored with the record.
2. **Play** — opening a stored photo shows a play-button overlay; tap it to
   play the video; Back returns to the photo.
3. **Share** — the Web Share API (`navigator.share`) opens WhatsApp and other
   apps on mobile; when Web Share is unavailable, the deep link is copied to
   the clipboard instead.
4. **Scan** — a second user grants camera access, points the camera at the same
   photo, and the app hashes live frames on-device, matches against stored
   hashes by Hamming distance, and opens the linked video on a match.

## File layout

```
web/
  index.html                app shell (mounts screens, loads js/app.js, bottom nav)
  manifest.webmanifest       PWA manifest (name, icons, standalone, theme color)
  service-worker.js          classic Cache-API worker (app-shell offline + installable)
  css/styles.css             mobile-first responsive styles
  icons/
    icon.svg                 scalable app icon
    icon-192.png             192x192 icon (installable manifest)
    icon-512.png             512x512 icon (installable manifest)
  js/
    app.js                   bootstrap: Firebase init, anon sign-in, router, SW register
    router.js                hash router (#/home, #/upload, #/detail/:id, #/scan)
    firebase-config.js       PLACEHOLDER config (REPLACE_ME) + isFirebaseConfigured()
    firebase-service.js      Firestore/Storage/Auth wrapper (modular SDK from gstatic CDN)
    image-matcher.js         ImageMatcher interface + PerceptualHashMatcher (dHash)
    models.js                MagicPhoto shape + Firestore converters
    share.js                 Web Share API + copy-link fallback
    ui.js                    shared config banner + toast helpers
    screens/
      home.js                grid of the user's photos
      upload.js              photo + video (file or URL) upload form
      detail.js              play overlay + video player + share
      scan.js                camera scan -> hash -> match -> play
```

## How to run and test

### Camera + service worker need a SECURE CONTEXT

`getUserMedia` (camera) and the service worker only work in a **secure
context**: `http://localhost` or `https://`. They do **not** work when you open
`index.html` directly as a `file://` page, and they do **not** work on a bare
LAN IP over plain `http`. Opening the file directly lets you browse the UI, but
the camera and offline install will not function until you serve it from
localhost or a real https host.

### (a) Quick local test on `http://localhost`

Serve the `web/` folder with any static server, then open the printed
`http://localhost:PORT` URL. Zero-install options:

- **VS Code Live Server** extension — right-click `web/index.html` →
  "Open with Live Server".
- **Python** (if installed): from inside the `web/` folder run
  `python -m http.server 8000`, then open `http://localhost:8000`.

localhost counts as secure, so the camera works here — but only with a camera
attached to that machine. For a real phone test, use the hosted https path
below.

### (b) Test the camera on your phone over `https://` (recommended)

Because the camera needs https on a phone, and your organization may block
CLIs, the simplest path is a **free static host that gives you https with
drag-and-drop**:

- **GitHub Pages** — create a repo, upload the contents of `web/` (so
  `index.html` is at the site root), enable Pages for the branch, and open the
  `https://…github.io/…` URL on your phone.
- **Firebase Hosting (free Spark tier)** — if the CLI is available you can
  `firebase init hosting` with `web/` as the public directory and
  `firebase deploy`; otherwise prefer the GitHub Pages drag-and-drop route.

Open the https URL on your phone, tap **Scan**, allow camera access, and point
the rear camera at a photo that was uploaded earlier.

## Firebase setup (free Spark tier)

The app will not connect to Firebase until you add your own keys. Until then it
shows a friendly "Firebase not configured" banner instead of crashing.

1. Go to the [Firebase console](https://console.firebase.google.com) and create
   a new project (the free **Spark** plan is enough).
2. In the project, enable:
   - **Firestore Database**
   - **Storage**
   - **Authentication → Sign-in method → Anonymous** (toggle on)
3. Add a **Web app** to the project and copy its config values.
4. Open `web/js/firebase-config.js` and replace every `"REPLACE_ME"` with the
   matching value (`apiKey`, `authDomain`, `projectId`, `storageBucket`,
   `messagingSenderId`, `appId`). Do **not** commit real keys.

### Firestore security rules (starting point)

Anyone signed in may read (so a second user can match a photo they did not
upload); only the owner may create/update/delete their own documents.

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

### Storage security rules (starting point)

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

## How scanning works (and its limitation)

Recognition uses a **perceptual hash (dHash)** computed entirely in the browser
with a `<canvas>` — no paid API, no proprietary SDK. Each frame (and each
uploaded photo) is downscaled to 9×8 grayscale; adjacent pixels are compared to
produce a 64-bit hash (16 hex chars). A scanned frame matches a stored photo
when their Hamming distance is within the threshold (default 10 of 64).

**Framing limitation:** dHash works best when the scanned photo is framed
similarly to the original — roughly square-on, filling the frame, in decent
light. Large rotation, perspective, or partial framing can miss. The matcher
lives behind a clean `ImageMatcher` interface in `js/image-matcher.js`, so a
future **OpenCV.js ORB feature matcher** (OpenCV.js is open source and loadable
from a CDN) can be dropped in as a more robust implementation without touching
any screen code.

## Icons

`icons/icon.svg` is the scalable app icon. `icon-192.png` and `icon-512.png`
are generated raster versions for the installable manifest. You can swap in your
own branded PNGs of the same sizes without changing any code.
