// router.js
//
// A tiny hash-based client-side router. Routes:
//   #/home         -> renderHome(root)
//   #/upload       -> renderUpload(root)
//   #/detail/:id   -> renderDetail(root, { id })
//   #/scan         -> renderScan(root)
// Unknown/empty hashes redirect to #/home.
//
// Cleanup contract: a screen render function MAY return a cleanup function.
// Before rendering the next route, the router calls the previous route's
// cleanup (if any). This is how the scan screen stops the camera on exit.

/** @type {null | (() => void)} */
let _activeCleanup = null;
/** @type {HTMLElement | null} */
let _root = null;
/** @type {Array<{ pattern: RegExp, keys: string[], render: Function }>} */
let _routes = [];

/**
 * Compile a route path like "#/detail/:id" into a regex + param key list.
 */
function compile(path) {
  const keys = [];
  // Escape slashes, turn :param segments into capture groups.
  const regexStr = path
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escape regex specials
    .replace(/\\\/:(\w+)/g, (_m, key) => {
      keys.push(key);
      return '/([^/]+)';
    });
  return { pattern: new RegExp('^' + regexStr + '$'), keys };
}

/**
 * Initialize the router.
 * @param {HTMLElement} root  mount element
 * @param {Record<string, Function>} routes  map of hash path -> render fn
 */
export function initRouter(root, routes) {
  _root = root;
  _routes = Object.entries(routes).map(([path, render]) => {
    const { pattern, keys } = compile(path);
    return { pattern, keys, render };
  });
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

/** Programmatic navigation. Setting the hash triggers handleRoute. */
export function navigate(hash) {
  if (location.hash === hash) {
    // Same hash won't fire hashchange; re-render explicitly.
    handleRoute();
  } else {
    location.hash = hash;
  }
}

function handleRoute() {
  const hash = location.hash || '#/home';

  // Redirect empty/unknown to home.
  let matched = null;
  let params = {};
  for (const route of _routes) {
    const m = hash.match(route.pattern);
    if (m) {
      matched = route;
      route.keys.forEach((key, i) => {
        params[key] = decodeURIComponent(m[i + 1]);
      });
      break;
    }
  }

  if (!matched) {
    if (hash !== '#/home') {
      navigate('#/home');
      return;
    }
    return; // avoid an infinite loop if #/home itself is unregistered
  }

  // Tear down the previous screen before rendering the next.
  if (typeof _activeCleanup === 'function') {
    try {
      _activeCleanup();
    } catch (err) {
      console.error('Route cleanup failed:', err);
    }
    _activeCleanup = null;
  }

  const result = matched.render(_root, params);
  if (typeof result === 'function') {
    _activeCleanup = result;
  }
}
