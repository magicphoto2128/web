# Magic Photo

A Flutter app where a photo becomes a gateway to a linked video. Upload a photo
and link a video to it; open the photo to see a play button and watch the
video; share it; and let a second person point their camera at the same photo
to recognize it on-device and play the matching video.

> Setup and run commands live in [SETUP.md](SETUP.md). Read that first — the
> app needs `flutter create .` and a free Firebase project before it runs.

## The four flows

1. **Upload** — pick a photo and a video (`image_picker`), upload both to
   Firebase Storage, compute the photo's perceptual hash, and store a record in
   Firestore.
2. **Play** — opening a stored photo shows a play-button overlay; tapping it
   opens the video player, and Back returns to the photo.
3. **Share** — share the photo URL, the video URL, and a deep-link-style
   reference through the OS share sheet (WhatsApp and others) via `share_plus`.
4. **Scan** — a second user points the camera at the same photo; the app hashes
   live frames on-device and plays the matching video when a stored hash is
   close enough.

## Architecture

Layered, with the UI depending on services and models — never on Firebase or
the matcher directly beyond the service boundary.

```
lib/
  main.dart                     # Firebase init, anonymous sign-in, routing
  firebase_options.dart         # PLACEHOLDER — replaced by `flutterfire configure`
  models/
    magic_photo.dart            # id, photoUrl, videoUrl, perceptualHash, createdAt, ownerId
  services/
    image_matcher.dart          # ImageMatcher interface + PerceptualHashMatcher (dHash)
    firebase_service.dart       # Auth + Firestore + Storage operations
  screens/
    home_screen.dart            # gallery of the user's photos + Upload/Scan
    upload_screen.dart          # pick photo + video, upload, hash
    photo_detail_screen.dart    # photo + play overlay + share
    video_player_screen.dart    # video_player playback, back to photo
    scan_screen.dart            # live camera -> hash -> match -> play
  widgets/
    play_button_overlay.dart    # tappable play icon over a child
    loading_indicator.dart      # spinner with optional label/progress
```

### Image matching (`ImageMatcher` + pHash)

Recognition is hidden behind the `ImageMatcher` interface. The shipped
implementation, `PerceptualHashMatcher`, computes a 64-bit **dHash** in pure
Dart using the open-source `image` package — no ML Kit, no paid API, fully
on-device:

1. Decode → grayscale → resize to 9×8.
2. For each row, compare each pixel to its right neighbour (8 comparisons ×
   8 rows = 64 bits).
3. Pack into a 16-char hex string.
4. Compare two hashes by **Hamming distance**; a match is distance ≤ threshold
   (default 10 of 64 bits).

Because the UI only talks to `ImageMatcher`, an **OpenCV ORB feature matcher**
can be added later (planned enhancement) without changing any screen.

## Data layout

Firestore collection `magic_photos`, one document per photo:

| field            | type      | notes                               |
| ---------------- | --------- | ----------------------------------- |
| `id`             | String    | == document id (uuid)               |
| `photoUrl`       | String    | Storage download URL                |
| `videoUrl`       | String    | Storage download URL                |
| `perceptualHash` | String    | 16 hex chars (64-bit dHash)         |
| `createdAt`      | Timestamp | server timestamp                    |
| `ownerId`        | String    | anonymous uid                       |

Storage paths: `users/{uid}/photos/{uuid}.jpg` and
`users/{uid}/videos/{uuid}.mp4`.

Scan matching reads all `magic_photos` (across owners, so a second user can
match someone else's photo) and compares each stored hash to the live frame
hash. For the free-tier demo a full collection read is acceptable; a production
app would narrow or index this.

## Auth

Anonymous Firebase Auth — no login screen. `ownerId` is the anonymous uid; the
home gallery shows only the current uid's photos.

## Known limitation

pHash matching works best when the scanned photo is framed similarly to the
original. Heavy rotation/perspective or partial framing can miss. ORB is the
planned improvement (see above).

## Notes

- `firebase_options.dart` is a placeholder until you run `flutterfire configure`
  (see SETUP.md). The app shows an error screen with retry if Firebase fails to
  initialize.
- Deep-link sharing shares a `magicphoto://photo/<id>` reference in text; full
  custom-scheme deep-link routing (opening the app straight to a photo) is a
  documented follow-up, not part of this build.
