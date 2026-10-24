import 'dart:typed_data';

import 'package:image/image.dart' as img;

/// Abstraction over "does this camera frame look like a stored photo?".
///
/// The whole app talks to this interface, never to a concrete matcher. That
/// keeps the recognition strategy swappable.
///
/// FUTURE ENHANCEMENT: an OpenCV ORB feature matcher can be added as a second
/// `ImageMatcher` implementation (e.g. `OrbImageMatcher`). ORB is far more
/// robust to rotation, perspective and partial framing than a perceptual hash.
/// Because the UI (scan/upload) depends only on this interface, that matcher
/// can be dropped in without touching any screen code.
abstract class ImageMatcher {
  /// Compute a compact fingerprint from encoded image bytes (JPEG/PNG/etc).
  String computeHash(Uint8List bytes);

  /// Compute a fingerprint from an already-decoded [img.Image]. Used on the
  /// scan path where camera frames are converted to an [img.Image] directly,
  /// avoiding a re-encode/decode round trip.
  String computeHashFromImage(img.Image image);

  /// Distance between two fingerprints. Lower == more similar.
  int hammingDistance(String a, String b);

  /// Whether two fingerprints are "the same image" within [threshold].
  /// When [threshold] is null, the implementation's configured threshold is used.
  bool isMatch(String a, String b, {int? threshold});
}

/// Perceptual-hash matcher using **dHash** (difference hash) in pure Dart.
///
/// Why dHash: it is cheap, open source to implement, needs no ML model, and is
/// tolerant of mild scaling and JPEG compression — a good fit for "hold the
/// camera on the photo" recognition on the free tier.
///
/// Algorithm (produces a 64-bit hash as 16 hex chars):
///   1. Decode the image.
///   2. Convert to grayscale.
///   3. Resize to 9x8 (width 9, height 8).
///   4. For each of the 8 rows, compare each pixel to its right neighbour
///      (9 columns -> 8 comparisons per row): bit = 1 if the left pixel is
///      brighter than the right, else 0. 8 rows x 8 bits = 64 bits.
///   5. Pack the 64 bits into a 16-char hex string.
/// Matching = Hamming distance (number of differing bits); a smaller distance
/// means the images are more alike. Default match threshold is 10 of 64 bits.
class PerceptualHashMatcher implements ImageMatcher {
  /// Default maximum Hamming distance that still counts as a match.
  static const int defaultThreshold = 10;

  // dHash grid: compare 9 columns across 8 rows -> 64 bits.
  static const int _hashWidth = 9;
  static const int _hashHeight = 8;

  final int threshold;

  const PerceptualHashMatcher({this.threshold = defaultThreshold});

  @override
  String computeHash(Uint8List bytes) {
    final decoded = img.decodeImage(bytes);
    if (decoded == null) {
      throw const FormatException('Could not decode image bytes for hashing.');
    }
    return computeHashFromImage(decoded);
  }

  @override
  String computeHashFromImage(img.Image image) {
    // Grayscale then resize to the small dHash grid.
    final gray = img.grayscale(image);
    final resized = img.copyResize(
      gray,
      width: _hashWidth,
      height: _hashHeight,
    );

    // Build the 64-bit hash as a big integer, MSB first.
    var bits = BigInt.zero;
    for (var y = 0; y < _hashHeight; y++) {
      for (var x = 0; x < _hashWidth - 1; x++) {
        final left = resized.getPixel(x, y).luminance;
        final right = resized.getPixel(x + 1, y).luminance;
        bits = bits << 1;
        if (left > right) {
          bits = bits | BigInt.one;
        }
      }
    }

    // 64 bits -> 16 hex chars, zero-padded.
    return bits.toRadixString(16).padLeft(16, '0');
  }

  @override
  int hammingDistance(String a, String b) {
    final x = BigInt.parse(a, radix: 16);
    final y = BigInt.parse(b, radix: 16);
    var diff = x ^ y;
    var count = 0;
    while (diff > BigInt.zero) {
      if ((diff & BigInt.one) == BigInt.one) {
        count++;
      }
      diff = diff >> 1;
    }
    return count;
  }

  @override
  bool isMatch(String a, String b, {int? threshold}) {
    if (a.isEmpty || b.isEmpty) return false;
    return hammingDistance(a, b) <= (threshold ?? this.threshold);
  }
}
