// Small shared helpers with no dependency on any other App module -- kept
// first in load order (before data.js) so everything else can use it.

(function () {

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

// localStorage helpers: every module reads/writes with a try/catch (storage
// disabled / full / quota errors are swallowed, matching prior per-file
// behavior) and either raw strings or JSON. Callers choose the raw or JSON
// variant depending on what they stored -- these do not change the on-disk
// format, just where the try/catch lives.
function storageGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage disabled / full */ }
}

function storageGetJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function storageSetJson(key, value) {
  storageSet(key, JSON.stringify(value));
}

// Touch browsers (iOS Safari in particular) don't reliably fire contextmenu
// on long-press, so every tappable board implements the same fallback: a
// non-mouse pointerdown starts a timer that opens the context menu and
// suppresses the click that follows the release; moving >10px (the touch
// turned into a scroll) or releasing early cancels it as a normal tap.
// Desktop right-click goes through the plain contextmenu event.
const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_PX = 10;

// Wires tap + long-press/right-click menu on `root` (may be a container with
// event delegation -- `resolve(e.target)` maps the event target to an id, or
// null/undefined for "not a tappable element").
//   onTap(id)          -- normal click/tap
//   onMenu(id, x, y)   -- long-press or right-click
//   suppressOnCancel   -- also swallow the next click after pointercancel
//   stopSuppressedClick-- stopImmediatePropagation() on the swallowed click
//   onPressStart(e) / onPressEnd() -- optional visual press-feedback hooks
function bindLongPressMenu(root, opts) {
  const {
    resolve, onTap, onMenu, delay = LONG_PRESS_MS,
    suppressOnCancel = false, stopSuppressedClick = false,
    onPressStart = null, onPressEnd = null,
  } = opts;
  let timer = null, suppress = false, xy = null;
  const clearTimer = () => { clearTimeout(timer); timer = null; };

  root.addEventListener('pointerdown', (e) => {
    const id = resolve(e.target);
    if (id == null) return;
    suppress = false;
    xy = { x: e.clientX, y: e.clientY };
    if (e.pointerType !== 'mouse') {
      if (onPressStart) onPressStart(e);
      clearTimer();
      timer = setTimeout(() => {
        suppress = true;
        onMenu(id, xy.x, xy.y);
      }, delay);
    }
  });
  root.addEventListener('pointermove', (e) => {
    if (xy && Math.hypot(e.clientX - xy.x, e.clientY - xy.y) > LONG_PRESS_MOVE_PX) {
      clearTimer();
      if (onPressEnd) onPressEnd();
    }
  });
  root.addEventListener('pointerup', () => { clearTimer(); if (onPressEnd) onPressEnd(); });
  root.addEventListener('pointercancel', () => {
    clearTimer();
    if (onPressEnd) onPressEnd();
    if (suppressOnCancel) suppress = true;
  });
  root.addEventListener('click', (e) => {
    const id = resolve(e.target);
    if (id == null) return;
    if (suppress) {
      suppress = false;
      if (stopSuppressedClick) e.stopImmediatePropagation();
      return;
    }
    onTap(id);
  });
  root.addEventListener('contextmenu', (e) => {
    const id = resolve(e.target);
    if (id == null) return;
    e.preventDefault();
    onMenu(id, e.clientX, e.clientY);
  });
}

window.App = window.App || {};
window.App.Util = {
  escapeHtml,
  storage: { get: storageGet, set: storageSet, getJson: storageGetJson, setJson: storageSetJson },
  bindLongPressMenu,
};

})();
