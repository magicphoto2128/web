// ui.js
//
// Shared UI helpers used by the screens: the "Firebase not configured" banner
// and a transient toast message. Keeping these here means every screen renders
// them consistently.

import { isFirebaseConfigured } from './firebase-config.js';

/**
 * Append a friendly banner telling the user to add Firebase keys, but only
 * when Firebase is still unconfigured. No-op when configured.
 * @param {HTMLElement} root
 */
export function renderConfigBanner(root) {
  if (isFirebaseConfigured()) return;
  const banner = document.createElement('div');
  banner.className = 'config-banner';
  banner.setAttribute('role', 'status');
  banner.innerHTML =
    '<strong>Firebase not configured.</strong> ' +
    'Add your project keys in <code>web/js/firebase-config.js</code> ' +
    '(replace the <code>REPLACE_ME</code> values). See <code>web/README.md</code>. ' +
    'Until then, upload, scan, and playback are disabled.';
  root.appendChild(banner);
}

/**
 * Show a full-screen blocking loader overlay with a spinner, a message, and an
 * optional percentage line. Calling it again updates the existing overlay
 * (so progress callbacks can refresh the message/percent without flicker).
 * Returns a small controller to update or hide it.
 *
 * @param {string} message       main status line (e.g. "Creating your magic photo…")
 * @param {string} [percentText] secondary line (e.g. "42%"); pass '' to clear
 * @returns {{ update:(message?:string, percentText?:string)=>void, hide:()=>void }}
 */
export function showLoader(message = 'Working…', percentText = '') {
  let overlay = document.getElementById('loader-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loader-overlay';
    overlay.className = 'loader-overlay';
    overlay.setAttribute('role', 'alert');
    overlay.setAttribute('aria-busy', 'true');
    overlay.setAttribute('aria-live', 'assertive');
    const spinner = document.createElement('div');
    spinner.className = 'loader-overlay__spinner';
    const msg = document.createElement('p');
    msg.className = 'loader-overlay__message';
    const pct = document.createElement('p');
    pct.className = 'loader-overlay__percent';
    overlay.appendChild(spinner);
    overlay.appendChild(msg);
    overlay.appendChild(pct);
    document.body.appendChild(overlay);
  }
  const msgEl = overlay.querySelector('.loader-overlay__message');
  const pctEl = overlay.querySelector('.loader-overlay__percent');
  const apply = (m, p) => {
    if (m != null) msgEl.textContent = m;
    if (p != null) pctEl.textContent = p;
  };
  apply(message, percentText);
  return {
    update: (m, p) => apply(m, p),
    hide: () => hideLoader(),
  };
}

/** Remove the full-screen loader overlay if present. */
export function hideLoader() {
  const overlay = document.getElementById('loader-overlay');
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
}

/**
 * Open a large popup (modal) showing a photo big, with a vertical bar of
 * action icons on the RIGHT side (play + optional share) and left/right arrows
 * to move through the gallery. Supports a single record or a whole list with a
 * starting index. Keyboard: ArrowLeft / ArrowRight navigate, Escape closes,
 * and clicking the dimmed backdrop or the × button also closes (stopping any
 * playing video).
 *
 * Two call shapes:
 *   openPhotoModal(record, opts)                       // single photo
 *   openPhotoModal({ list, index }, opts)              // gallery
 *
 * @param {object} arg    a MagicPhoto, OR { list: MagicPhoto[], index: number }
 * @param {object} [opts]
 * @param {(record:object)=>void} [opts.onShare]  called when the share icon is tapped
 * @returns {{ close: () => void }}
 */
export function openPhotoModal(arg, opts = {}) {
  // Normalize input into a list + current index.
  let list;
  let index;
  if (arg && Array.isArray(arg.list)) {
    list = arg.list;
    index = Math.min(Math.max(arg.index || 0, 0), arg.list.length - 1);
  } else {
    list = [arg];
    index = 0;
  }

  // Backdrop
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Magic photo');

  const modal = document.createElement('div');
  modal.className = 'modal';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal__close';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '\u00d7'; // ×

  const body = document.createElement('div');
  body.className = 'modal__body';

  // Big photo
  const img = document.createElement('img');
  img.className = 'modal__media';
  img.alt = 'Magic photo';

  // Video element (built lazily, hidden until play is tapped)
  const video = document.createElement('video');
  video.className = 'modal__media modal__media--hidden';
  video.setAttribute('controls', 'true');
  video.setAttribute('playsinline', 'true');

  // Prev / Next arrows (only shown when there is more than one photo)
  const prevBtn = document.createElement('button');
  prevBtn.className = 'modal__nav modal__nav--prev';
  prevBtn.type = 'button';
  prevBtn.setAttribute('aria-label', 'Previous photo');
  prevBtn.innerHTML = '\u2039'; // ‹

  const nextBtn = document.createElement('button');
  nextBtn.className = 'modal__nav modal__nav--next';
  nextBtn.type = 'button';
  nextBtn.setAttribute('aria-label', 'Next photo');
  nextBtn.innerHTML = '\u203a'; // ›

  // Counter (e.g. "2 / 5")
  const counter = document.createElement('div');
  counter.className = 'modal__counter';

  // Right-side icon bar
  const side = document.createElement('div');
  side.className = 'modal__side';

  const playBtn = document.createElement('button');
  playBtn.className = 'modal__icon-btn modal__icon-btn--play';
  playBtn.type = 'button';
  playBtn.setAttribute('aria-label', 'Play video');
  playBtn.innerHTML = '\u25b6'; // ▶
  side.appendChild(playBtn);

  // Optional Share icon
  if (typeof opts.onShare === 'function') {
    const shareBtn = document.createElement('button');
    shareBtn.className = 'modal__icon-btn modal__icon-btn--secondary';
    shareBtn.type = 'button';
    shareBtn.setAttribute('aria-label', 'Share');
    shareBtn.innerHTML = '\u2191'; // ↑ (share-ish)
    shareBtn.addEventListener('click', () => opts.onShare(current()));
    side.appendChild(shareBtn);
  }

  function current() {
    return list[index];
  }

  function stopVideo() {
    try {
      video.pause();
    } catch {
      /* ignore */
    }
    video.removeAttribute('src');
    video.load();
  }

  function showPhoto() {
    stopVideo();
    video.classList.add('modal__media--hidden');
    img.classList.remove('modal__media--hidden');
    playBtn.innerHTML = '\u25b6'; // ▶
    playBtn.setAttribute('aria-label', 'Play video');
  }

  function showVideo() {
    const rec = current();
    if (!rec.videoUrl) {
      showToast('No video linked to this photo.');
      return;
    }
    img.classList.add('modal__media--hidden');
    video.src = rec.videoUrl;
    video.classList.remove('modal__media--hidden');
    const p = video.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
    playBtn.innerHTML = '\u25a0'; // ■ (back to photo)
    playBtn.setAttribute('aria-label', 'Back to photo');
  }

  // Load the record at the current index as a photo (reset any video state).
  function render() {
    showPhoto();
    img.src = current().photoUrl;
    counter.textContent = list.length > 1 ? `${index + 1} / ${list.length}` : '';
    const multi = list.length > 1;
    prevBtn.style.display = multi ? '' : 'none';
    nextBtn.style.display = multi ? '' : 'none';
  }

  function go(delta) {
    if (list.length <= 1) return;
    // Wrap around so Next past the end loops to the first, and vice versa.
    index = (index + delta + list.length) % list.length;
    render();
  }

  // Toggle play/photo on the side button.
  playBtn.addEventListener('click', () => {
    const videoHidden = video.classList.contains('modal__media--hidden');
    if (videoHidden) showVideo();
    else showPhoto();
  });
  prevBtn.addEventListener('click', () => go(-1));
  nextBtn.addEventListener('click', () => go(1));

  function close() {
    stopVideo();
    document.removeEventListener('keydown', onKey);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
  }
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close(); // click outside the modal card
  });
  document.addEventListener('keydown', onKey);

  body.appendChild(img);
  body.appendChild(video);
  body.appendChild(prevBtn);
  body.appendChild(nextBtn);
  body.appendChild(counter);
  body.appendChild(side);
  modal.appendChild(closeBtn);
  modal.appendChild(body);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  render();
  return { close };
}

let _toastTimer = null;

/**
 * Show a short-lived toast message at the bottom of the screen.
 * @param {string} msg
 * @param {number} durationMs
 */
export function showToast(msg, durationMs = 2600) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('toast--visible');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    toast.classList.remove('toast--visible');
  }, durationMs);
}

/** Small helper: create an element with optional class + text/html. */
export function el(tag, { className, text, html, attrs } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  if (html != null) node.innerHTML = html;
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}
