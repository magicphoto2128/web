// screens/detail.js
//
// Detail screen (Play + Share): loads a record by id, shows the photo with a
// tappable play-button overlay. Tapping play swaps in a <video> player; Back
// returns to the photo. Share uses the Web Share API with a copy-link
// fallback. Handles loading / not-found / not-configured states.

import { getRecordById } from '../firebase-service.js';
import { isFirebaseConfigured } from '../firebase-config.js';
import { shareMagicPhoto } from '../share.js';
import { navigate } from '../router.js';
import { renderConfigBanner, showToast, el } from '../ui.js';

/**
 * @param {HTMLElement} root
 * @param {{ id: string }} params
 */
export function renderDetail(root, params) {
  root.innerHTML = '';
  const section = el('section', { className: 'screen screen--detail' });
  root.appendChild(section);

  renderConfigBanner(section);
  if (!isFirebaseConfigured()) return;

  const status = el('p', { className: 'status', text: 'Loading…' });
  section.appendChild(status);

  getRecordById(params.id)
    .then((record) => {
      status.remove();
      if (!record) {
        section.appendChild(el('p', { className: 'status status--error', text: 'Photo not found.' }));
        section.appendChild(backToHomeButton());
        return;
      }
      renderRecord(section, record);
    })
    .catch((err) => {
      status.textContent = 'Could not load: ' + (err && err.message ? err.message : String(err));
      status.classList.add('status--error');
    });
}

function backToHomeButton() {
  const btn = el('button', { className: 'btn', text: 'Back to Home', attrs: { type: 'button' } });
  btn.addEventListener('click', () => navigate('#/home'));
  return btn;
}

function renderRecord(section, record) {
  // --- Photo view with play overlay ---
  const stage = el('div', { className: 'stage' });

  const photoView = el('div', { className: 'stage__photo' });
  const img = el('img', { className: 'stage__img', attrs: { src: record.photoUrl, alt: 'Magic photo' } });
  const playBtn = el('button', {
    className: 'play-overlay',
    attrs: { type: 'button', 'aria-label': 'Play video' },
    html: '<span class="play-overlay__icon">▶</span>',
  });
  photoView.appendChild(img);
  photoView.appendChild(playBtn);

  // --- Video view (built on demand) ---
  const videoView = el('div', { className: 'stage__video stage__video--hidden' });

  function showVideo() {
    videoView.innerHTML = '';
    const video = el('video', {
      className: 'stage__player',
      attrs: { src: record.videoUrl, controls: 'true', autoplay: 'true', playsinline: 'true' },
    });
    const back = el('button', { className: 'btn btn--ghost', text: '← Back to photo', attrs: { type: 'button' } });
    back.addEventListener('click', () => {
      try {
        video.pause();
      } catch {
        /* ignore */
      }
      video.removeAttribute('src');
      video.load();
      videoView.classList.add('stage__video--hidden');
      photoView.classList.remove('stage__photo--hidden');
    });
    videoView.appendChild(back);
    videoView.appendChild(video);
    photoView.classList.add('stage__photo--hidden');
    videoView.classList.remove('stage__video--hidden');
  }

  playBtn.addEventListener('click', showVideo);

  stage.appendChild(photoView);
  stage.appendChild(videoView);
  section.appendChild(stage);

  // --- Actions: Share + Back ---
  const actions = el('div', { className: 'actions' });
  const shareBtn = el('button', { className: 'btn btn--primary', text: 'Share', attrs: { type: 'button' } });
  shareBtn.addEventListener('click', async () => {
    const deepLink = `${location.origin}${location.pathname}#/detail/${record.id}`;
    const result = await shareMagicPhoto({
      title: 'Magic Photo',
      text: 'Open this photo in the Magic Photo app to watch its video.',
      url: deepLink,
    });
    if (result === 'copied') showToast('Link copied to clipboard.');
    else if (result === 'unavailable') showToast('Sharing is not available on this device.');
  });
  actions.appendChild(shareBtn);
  actions.appendChild(backToHomeButton());
  section.appendChild(actions);
}
