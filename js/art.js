// Unicode Art store (localStorage): saved snapshots of the output area's
// text, kept as whole strings (not per-codepoint like MyLists/History),
// shown as tiles and re-inserted wholesale when tapped.

(function () {

const KEY = 'unicode-app:art:v1';

function load() {
  const arr = window.App.Util.storage.getJson(KEY, []);
  return Array.isArray(arr)
    ? arr.filter((w) => w && typeof w.id === 'string' && typeof w.text === 'string')
    : [];
}

class UnicodeArt {
  constructor() {
    this.items = load();
    this.subs = new Set();
  }

  save() {
    window.App.Util.storage.setJson(KEY, this.items);
  }

  // Newest first, so a freshly saved piece appears at the top of the tile grid.
  add(text, title = '') {
    if (!text) return null;
    const work = {
      id: `art-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      title: title || '',
      createdAt: Date.now(),
    };
    this.items.unshift(work);
    this.save();
    this.emit();
    return work;
  }

  rename(id, title) {
    const work = this.items.find((w) => w.id === id);
    if (!work) return false;
    work.title = title || '';
    this.save();
    this.emit();
    return true;
  }

  editText(id, text) {
    const work = this.items.find((w) => w.id === id);
    if (!work || !text) return false;
    work.text = text;
    this.save();
    this.emit();
    return true;
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
