// Unicode Art store (localStorage): saved snapshots of the output area's
// text, kept as whole strings (not per-codepoint like MyLists/History),
// shown as tiles and re-inserted wholesale when tapped.

(function () {

const KEY = 'unicode-app:art:v1';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr)
      ? arr.filter((w) => w && typeof w.id === 'string' && typeof w.text === 'string')
      : [];
  } catch {
    return [];
  }
}

class UnicodeArt {
  constructor() {
    this.items = load();
    this.subs = new Set();
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.items)); } catch { /* storage disabled / full */ }
  }

  // Newest first, so a freshly saved piece appears at the top of the tile grid.
  add(text) {
    if (!text) return null;
    const work = {
      id: `art-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      createdAt: Date.now(),
    };
    this.items.unshift(work);
    this.save();
    this.emit();
    return work;
  }

  remove(id) {
    const before = this.items.length;
    this.items = this.items.filter((w) => w.id !== id);
    if (this.items.length !== before) {
      this.save();
      this.emit();
    }
  }

  subscribe(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit() { this.subs.forEach((fn) => fn()); }
}

window.App = window.App || {};
window.App.Art = { UnicodeArt };

})();
