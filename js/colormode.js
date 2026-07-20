// Shared color-coding mode (none / category / age) + subscription, persisted.

(function () {

const KEY = 'unicode-app:colormode:v1';
const MODES = ['none', 'category', 'age'];

function load() {
  const v = window.App.Util.storage.get(KEY, null);
  return MODES.includes(v) ? v : 'category';
}

class ColorMode {
  constructor() {
    this.mode = load();
    this.subs = new Set();
  }

  get() { return this.mode; }

  set(mode) {
    if (!MODES.includes(mode) || mode === this.mode) return;
    this.mode = mode;
    window.App.Util.storage.set(KEY, mode);
    this.emit();
  }

  subscribe(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit() { this.subs.forEach((fn) => fn(this.mode)); }
}

window.App = window.App || {};
window.App.ColorMode = { ColorMode, MODES };

})();
