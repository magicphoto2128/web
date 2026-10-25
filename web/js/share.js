// share.js
//
// Share a magic photo via the Web Share API (navigator.share) which surfaces
// WhatsApp and other apps on mobile. Falls back to copying the deep link to
// the clipboard when Web Share is unavailable so the caller can show a toast.

/**
 * @param {object} args
 * @param {string} args.title
 * @param {string} args.text
 * @param {string} args.url   the deep link, e.g. `${location.origin}${location.pathname}#/detail/<id>`
 * @returns {Promise<'shared'|'copied'|'cancelled'|'unavailable'>}
 */
export async function shareMagicPhoto({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      // AbortError = the user dismissed the share sheet; not a real failure.
      if (err && err.name === 'AbortError') return 'cancelled';
      // Fall through to the copy fallback on other errors.
    }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return 'copied';
    } catch {
      return 'unavailable';
    }
  }
  return 'unavailable';
}
