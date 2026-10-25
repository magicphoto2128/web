// image-matcher.js
//
// "Does this camera frame look like a stored photo?" The whole app talks to
// the ImageMatcher interface, never to a concrete matcher, so the recognition
// strategy stays swappable.
//
// FUTURE ENHANCEMENT: an OpenCV.js ORB feature matcher (OpenCV.js is open
// source and loadable from a public CDN) can be added as a second
// ImageMatcher implementation (e.g. `OrbImageMatcher`). ORB is far more robust
// to rotation, perspective and partial framing than a perceptual hash. Because
// the UI (scan/upload) depends only on this interface, that matcher can be
// dropped in later without touching any screen code.

/**
 * Abstract matcher interface. Concrete matchers implement computeHash,
 * hammingDistance and isMatch.
 */
export class ImageMatcher {
  /** @param {CanvasImageSource} _source @returns {string} */
  computeHash(_source) {
    throw new Error('computeHash not implemented');
  }
  /** @param {string} _a @param {string} _b @returns {number} */
  hammingDistance(_a, _b) {
    throw new Error('hammingDistance not implemented');
  }
  /** @param {string} _a @param {string} _b @param {number=} _threshold @returns {boolean} */
  isMatch(_a, _b, _threshold) {
    throw new Error('isMatch not implemented');
  }
}

/**
 * Perceptual-hash matcher using dHash (difference hash) in pure JavaScript.
 *
 * Why dHash: cheap, open source to implement, needs no ML model, and tolerant
 * of mild scaling and JPEG compression — a good fit for "hold the camera on
 * the photo" recognition on the free tier.
 *
 * Algorithm (produces a 64-bit hash as 16 hex chars):
 *   1. Draw the source onto a tiny offscreen 9x8 canvas (the browser
 *      downscales it for us).
 *   2. Read the RGBA pixels and convert each to luminance
 *      (0.299*R + 0.587*G + 0.114*B).
 *   3. For each of the 8 rows, compare each pixel to its right neighbour
 *      (9 columns -> 8 comparisons per row): bit = 1 if the left pixel is
 *      brighter than the right, else 0. 8 rows x 8 bits = 64 bits.
 *   4. Pack the 64 bits into a 16-char hex string.
 * Matching = Hamming distance (number of differing bits); a smaller distance
 * means the images are more alike. Default match threshold is 10 of 64 bits.
 */
export class PerceptualHashMatcher extends ImageMatcher {
  static defaultThreshold = 10;

  // dHash grid: compare 9 columns across 8 rows -> 64 bits.
  static HASH_WIDTH = 9;
  static HASH_HEIGHT = 8;

  constructor(threshold = PerceptualHashMatcher.defaultThreshold) {
    super();
    this.threshold = threshold;
    // Reusable offscreen canvas sized to the dHash grid.
    this._canvas = document.createElement('canvas');
    this._canvas.width = PerceptualHashMatcher.HASH_WIDTH;
    this._canvas.height = PerceptualHashMatcher.HASH_HEIGHT;
    this._ctx = this._canvas.getContext('2d', { willReadFrequently: true });
  }

  /**
   * Compute the dHash for any drawable source: HTMLImageElement,
   * HTMLVideoElement, ImageBitmap or HTMLCanvasElement.
   * @param {CanvasImageSource} source
   * @returns {string} 16 hex chars (64-bit hash)
   */
  computeHash(source) {
    const w = PerceptualHashMatcher.HASH_WIDTH;
    const h = PerceptualHashMatcher.HASH_HEIGHT;
    this._ctx.drawImage(source, 0, 0, w, h);
    const { data } = this._ctx.getImageData(0, 0, w, h); // RGBA bytes

    // Build the 64-bit hash MSB-first. Use BigInt to avoid 32-bit overflow.
    let bits = 0n;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w - 1; x++) {
        const leftIdx = (y * w + x) * 4;
        const rightIdx = (y * w + (x + 1)) * 4;
        const leftLum =
          0.299 * data[leftIdx] + 0.587 * data[leftIdx + 1] + 0.114 * data[leftIdx + 2];
        const rightLum =
          0.299 * data[rightIdx] + 0.587 * data[rightIdx + 1] + 0.114 * data[rightIdx + 2];
        bits <<= 1n;
        if (leftLum > rightLum) bits |= 1n;
      }
    }
    // 64 bits -> 16 hex chars, zero-padded.
    return bits.toString(16).padStart(16, '0');
  }

  /**
   * Number of differing bits between two hex hashes. Lower == more similar.
   * @param {string} a @param {string} b @returns {number}
   */
  hammingDistance(a, b) {
    let diff = BigInt('0x' + a) ^ BigInt('0x' + b);
    let count = 0;
    while (diff > 0n) {
      if (diff & 1n) count++;
      diff >>= 1n;
    }
    return count;
  }

  /**
   * Whether two hashes are "the same image" within the threshold.
   * @param {string} a @param {string} b @param {number=} threshold
   * @returns {boolean}
   */
  isMatch(a, b, threshold) {
    if (!a || !b) return false;
    return this.hammingDistance(a, b) <= (threshold ?? this.threshold);
  }
}

/** Ready-to-use active matcher instance for the app. */
export const matcher = new PerceptualHashMatcher();
