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

window.App = window.App || {};
window.App.Util = { escapeHtml };

})();
