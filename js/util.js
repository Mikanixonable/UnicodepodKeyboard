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

window.App = window.App || {};
window.App.Util = {
  escapeHtml,
  storage: { get: storageGet, set: storageSet, getJson: storageGetJson, setJson: storageSetJson },
};

})();
