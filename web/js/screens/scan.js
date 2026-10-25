// screens/scan.js
//
// Scan screen (the key feature). Scan -> match -> play control flow:
//   1. Request the rear camera via getUserMedia({ video: { facingMode:
//      'environment' } }) and stream it into a <video>.
//   2. Fetch all candidate records once at scan start and cache them.
//   3. On a throttled loop (~700 ms) draw the current frame to the matcher's
//      canvas, compute its dHash, and find the cached record with the smallest
//      Hamming distance within the threshold.
//   4. On the first match: stop the loop, stop every camera track, and
//      navigate to #/detail/:id (which offers the play overlay).
//   5. Always stop the camera when leaving the screen (the router calls the
//      returned cleanup function on exit).
//
// NOTE: getUserMedia requires a secure context — it works on http://localhost
// and https:// but NOT from a plain file:// open. See web/README.md.

import { fetchAllRecords } from '../firebase-service.js';
import { isFirebaseConfigured } from '../firebase-config.js';
import { matcher } from '../image-matcher.js';
import { navigate } from '../router.js';
import { renderConfigBanner, el } from '../ui.js';

const SCAN_INTERVAL_MS = 700;

/**
 * @param {HTMLElement} root
 * @returns {() => void} cleanup — stops the loop and all camera tracks
 */
export function renderScan(root) {
  root.innerHTML = '';
  const section = el('section', { className: 'screen screen--scan' });
  section.appendChild(el('h1', { className: 'screen__title', text: 'Scan a Photo' }));
  root.appendChild(section);

  renderConfigBanner(section);

  // State that cleanup must tear down regardless of where we stop.
  let stream = null;
  let intervalId = null;
  let stopped = false;

  const video = el('video', { className: 'scanner__video', attrs: { playsinline: 'true', muted: 'true', autoplay: 'true' } });
  video.muted = true;
  const hint = el('p', { className: 'status', text: 'Point the camera at a magic photo…' });

  const cleanup = () => {
    stopped = true;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
  };

  if (!isFirebaseConfigured()) {
    // Banner already shown; nothing to scan against. Return a no-op cleanup.
    return cleanup;
  }

  section.appendChild(video);
  section.appendChild(hint);

  // Start the async scan pipeline. Each failure updates the hint rather than
  // crashing. The returned cleanup still stops whatever was started.
  (async () => {
    let records = [];
    try {
      records = await fetchAllRecords();
    } catch (err) {
      hint.textContent = 'Could not load photos to match: ' + (err && err.message ? err.message : String(err));
      hint.classList.add('status--error');
      return;
    }
    if (stopped) return;

    if (!records || records.length === 0) {
      hint.textContent = 'No photos have been uploaded yet, so there is nothing to match.';
      return;
    }

    // Request the rear camera.
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch (err) {
      stream = null;
      if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        hint.textContent = 'Camera permission denied. Allow camera access and reopen Scan.';
      } else if (err && err.name === 'NotFoundError') {
        hint.textContent = 'No camera found on this device.';
      } else {
        hint.textContent =
          'Camera unavailable. The camera needs a secure context (https or localhost), not a file:// page. ' +
          (err && err.message ? '(' + err.message + ')' : '');
      }
      hint.classList.add('status--error');
      return;
    }
    if (stopped) {
      // We were torn down while awaiting permission — stop the stream now.
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
      return;
    }

    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      /* some browsers resolve play() late; the interval still reads frames */
    }

    hint.textContent = 'Scanning… hold steady and fill the frame with the photo.';

    // Throttled scan loop: hash the current frame, find the best match.
    intervalId = setInterval(() => {
      if (stopped || !video.videoWidth) return;
      let frameHash;
      try {
        frameHash = matcher.computeHash(video);
      } catch {
        return; // frame not ready yet
      }

      let best = null;
      let bestDist = Infinity;
      for (const rec of records) {
        if (!rec.perceptualHash) continue;
        const dist = matcher.hammingDistance(frameHash, rec.perceptualHash);
        if (dist < bestDist) {
          bestDist = dist;
          best = rec;
        }
      }

      if (best && matcher.isMatch(frameHash, best.perceptualHash)) {
        // Match found: stop everything, then open the linked video.
        const id = best.id;
        hint.textContent = 'Match found! Opening video…';
        hint.classList.remove('status--error');
        cleanup();
        navigate('#/detail/' + id);
      }
    }, SCAN_INTERVAL_MS);
  })();

  return cleanup;
}
