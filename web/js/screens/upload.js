// screens/upload.js
//
// Upload screen: pick a photo and link a video — either by uploading a local
// video file OR by pasting a video URL (both supported). On submit, the photo
// is hashed and uploaded, the video is uploaded or its URL stored, and a
// `magic_photos` record is written. Handles progress / validation / error
// states and the not-configured banner.

import { uploadPhotoAndVideo } from '../firebase-service.js';
import { isFirebaseConfigured } from '../firebase-config.js';
import { navigate } from '../router.js';
import { renderConfigBanner, showToast, showLoader, hideLoader, el } from '../ui.js';

/**
 * @param {HTMLElement} root
 */
export function renderUpload(root) {
  root.innerHTML = '';
  const section = el('section', { className: 'screen screen--upload' });
  section.appendChild(el('h1', { className: 'screen__title', text: 'Upload a Magic Photo' }));
  root.appendChild(section);

  renderConfigBanner(section);
  if (!isFirebaseConfigured()) return;

  // --- Photo picker + preview ---
  const photoField = el('div', { className: 'field' });
  photoField.appendChild(el('label', { className: 'field__label', text: 'Photo', attrs: { for: 'photo-input' } }));
  const photoInput = el('input', {
    className: 'field__input',
    attrs: { id: 'photo-input', type: 'file', accept: 'image/*' },
  });
  const photoPreview = el('img', { className: 'preview preview--hidden', attrs: { alt: 'Photo preview' } });
  photoField.appendChild(photoInput);
  photoField.appendChild(photoPreview);
  section.appendChild(photoField);

  // --- Video source toggle: file OR url ---
  const videoField = el('div', { className: 'field' });
  videoField.appendChild(el('label', { className: 'field__label', text: 'Linked video' }));

  const toggle = el('div', { className: 'toggle' });
  const fileBtn = el('button', { className: 'toggle__btn toggle__btn--active', text: 'Upload file', attrs: { type: 'button' } });
  const urlBtn = el('button', { className: 'toggle__btn', text: 'Paste URL', attrs: { type: 'button' } });
  toggle.appendChild(fileBtn);
  toggle.appendChild(urlBtn);
  videoField.appendChild(toggle);

  const videoFileInput = el('input', {
    className: 'field__input',
    attrs: { id: 'video-input', type: 'file', accept: 'video/*' },
  });
  const videoUrlInput = el('input', {
    className: 'field__input field__input--hidden',
    attrs: { id: 'video-url', type: 'url', placeholder: 'https://example.com/video.mp4', inputmode: 'url' },
  });
  videoField.appendChild(videoFileInput);
  videoField.appendChild(videoUrlInput);
  section.appendChild(videoField);

  let videoMode = 'file'; // 'file' | 'url'
  function setMode(mode) {
    videoMode = mode;
    const fileActive = mode === 'file';
    fileBtn.classList.toggle('toggle__btn--active', fileActive);
    urlBtn.classList.toggle('toggle__btn--active', !fileActive);
    videoFileInput.classList.toggle('field__input--hidden', !fileActive);
    videoUrlInput.classList.toggle('field__input--hidden', fileActive);
    updateSubmitState();
  }
  fileBtn.addEventListener('click', () => setMode('file'));
  urlBtn.addEventListener('click', () => setMode('url'));

  // --- Submit + progress + errors ---
  const submit = el('button', { className: 'btn btn--primary', text: 'Create Magic Photo', attrs: { type: 'button', disabled: 'true' } });
  const progressWrap = el('div', { className: 'progress progress--hidden' });
  const progressBar = el('div', { className: 'progress__bar' });
  progressWrap.appendChild(progressBar);
  const errorMsg = el('p', { className: 'status status--error status--hidden' });
  section.appendChild(submit);
  section.appendChild(progressWrap);
  section.appendChild(errorMsg);

  function hasPhoto() {
    return photoInput.files && photoInput.files.length > 0;
  }
  function hasVideo() {
    if (videoMode === 'file') return videoFileInput.files && videoFileInput.files.length > 0;
    return videoUrlInput.value.trim().length > 0;
  }
  function updateSubmitState() {
    submit.disabled = !(hasPhoto() && hasVideo());
  }

  photoInput.addEventListener('change', () => {
    if (hasPhoto()) {
      const url = URL.createObjectURL(photoInput.files[0]);
      photoPreview.src = url;
      photoPreview.classList.remove('preview--hidden');
    } else {
      photoPreview.classList.add('preview--hidden');
    }
    updateSubmitState();
  });
  videoFileInput.addEventListener('change', updateSubmitState);
  videoUrlInput.addEventListener('input', updateSubmitState);

  submit.addEventListener('click', async () => {
    errorMsg.classList.add('status--hidden');
    errorMsg.textContent = '';

    const photoFile = photoInput.files[0];
    const videoFile = videoMode === 'file' ? videoFileInput.files[0] : undefined;
    const videoUrl = videoMode === 'url' ? videoUrlInput.value.trim() : undefined;

    submit.disabled = true;
    progressWrap.classList.remove('progress--hidden');
    progressBar.style.width = '0%';

    // Full-screen blocking loader: stays up from this click until the upload
    // either succeeds (then we navigate home) or fails (then we show the error).
    const loader = showLoader('Creating your magic photo…', '0%');

    try {
      await uploadPhotoAndVideo({
        photoFile,
        videoFile,
        videoUrl,
        onProgress: (p) => {
          const pct = Math.round(p * 100);
          progressBar.style.width = pct + '%';
          // Keep the overlay message meaningful: uploading, then finalizing.
          const message = pct >= 100 ? 'Finalizing…' : 'Uploading photo & video…';
          loader.update(message, pct + '%');
        },
      });
      loader.update('Done!', '100%');
      hideLoader();
      showToast('Magic photo created.');
      navigate('#/home');
    } catch (err) {
      hideLoader();
      errorMsg.textContent = 'Upload failed: ' + (err && err.message ? err.message : String(err));
      errorMsg.classList.remove('status--hidden');
      progressWrap.classList.add('progress--hidden');
      updateSubmitState();
    }
  });
}
