// Whether favorited characters get a highlight in the 符号表/入力内容/
// 入力履歴 boards. Off by default -- the highlight was previously always
// on, but tends to be visual noise for people who use mylists heavily
// (every glyph in the board ends up marked). Persisted + subscribable, same
// pattern as ColorMode.

(function () {

const KEY = 'unicode-app:fav-highlight:v1';

function load() {
  return window.App.Util.storage.get(KEY, null) === '1';
}

class FavHighlight {
  constructor() {
    this.enabled = load();
    this.subs = new Set();
  }

  get() { return this.enabled; }

  set(enabled) {
    enabled = !!enabled;
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    window.App.Util.storage.set(KEY, enabled ? '1' : '0');
    this.emit();
  }

  subscribe(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit() { this.subs.forEach((fn) => fn(this.enabled)); }
}

window.App = window.App || {};
window.App.FavHighlight = { FavHighlight };

})();
