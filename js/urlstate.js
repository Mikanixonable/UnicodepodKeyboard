// Shared URL hash state: multiple independent key=value params packed into
// one location.hash (e.g. "#mode=current&cp=1F600"), so different features
// (active tab, open character detail) can each own a key without clobbering
// the others. Always uses replaceState -- this reflects current UI state
// for linking/sharing/reload, not a browser-back-button history trail.

(function () {

function parse() {
  return new URLSearchParams(location.hash.slice(1));
}

function get(key) {
  return parse().get(key);
}

function set(key, value) {
  const params = parse();
  if (value == null) params.delete(key);
  else params.set(key, value);
  const hash = params.toString();
  history.replaceState(null, '', location.pathname + location.search + (hash ? `#${hash}` : ''));
}

window.App = window.App || {};
window.App.UrlState = { get, set };

})();
