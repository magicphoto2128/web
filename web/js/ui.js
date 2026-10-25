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
