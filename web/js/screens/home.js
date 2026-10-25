// screens/home.js
//
// Home screen: a grid of the current user's magic photos. Tapping one opens
// its detail (play) view. Handles loading / empty / error states and shows the
// Firebase-not-configured banner when needed.

import { streamMyPhotos } from '../firebase-service.js';
import { isFirebaseConfigured } from '../firebase-config.js';
import { navigate } from '../router.js';
import { renderConfigBanner, el } from '../ui.js';

/**
 * @param {HTMLElement} root
 * @returns {() => void} cleanup (detaches the Firestore listener)
 */
export function renderHome(root) {
  root.innerHTML = '';
  const section = el('section', { className: 'screen screen--home' });
  section.appendChild(el('h1', { className: 'screen__title', text: 'My Magic Photos' }));
  root.appendChild(section);

  renderConfigBanner(section);
  if (!isFirebaseConfigured()) {
    return () => {};
  }

  const status = el('p', { className: 'status', text: 'Loading your photos…' });
  const grid = el('div', { className: 'photo-grid' });
  section.appendChild(status);
  section.appendChild(grid);

  const unsubscribe = streamMyPhotos((list, error) => {
    if (error) {
      status.textContent = 'Could not load photos: ' + (error.message || error);
      status.classList.add('status--error');
      return;
    }
    grid.innerHTML = '';
    if (!list || list.length === 0) {
      status.textContent = 'No magic photos yet — tap Upload to add one.';
      status.classList.remove('status--error');
      return;
    }
    status.textContent = '';
    for (const photo of list) {
      const card = el('button', { className: 'photo-card', attrs: { type: 'button' } });
      const img = el('img', {
        className: 'photo-card__img',
        attrs: { src: photo.photoUrl, alt: 'Magic photo', loading: 'lazy' },
      });
      card.appendChild(img);
      card.addEventListener('click', () => navigate('#/detail/' + photo.id));
      grid.appendChild(card);
    }
  });

  // Cleanup: stop listening when leaving the screen.
  return () => {
    if (typeof unsubscribe === 'function') unsubscribe();
  };
}
