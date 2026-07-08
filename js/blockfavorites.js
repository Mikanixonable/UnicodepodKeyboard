// Favorite Unicode blocks (not to be confused with favorite *characters* in
// favorites.js/MyLists) -- a persisted, user-orderable list of block start
// codepoints, used to fill the "お気に入り" tab in the block picker UI.
// Order is significant (drag-to-reorder in that tab), so this is a plain
// array, not a Set.

(function () {

const KEY = 'unicode-app:fav-blocks:v1';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

class BlockFavorites {
  constructor() {
    this.order = load();
    this.subs = new Set();
  }

  has(cp) { return this.order.includes(cp); }

  toggle(cp) {
    const i = this.order.indexOf(cp);
    if (i >= 0) this.order.splice(i, 1);
    else this.order.push(cp);
    this.save();
    this.emit();
    return this.order.includes(cp);
  }

  // Move `cp` next to `beforeCp` in the order (drag-and-drop reordering in
  // the favorites tab). If `cp` originally sat earlier than `beforeCp`
  // (dragged downward), it lands just *after* `beforeCp`; otherwise (dragged
  // upward) it lands just *before* it -- inserting before a target that used
  // to be right after the dragged item is a no-op, so direction matters.
  // No-op if either isn't in the list.
  moveBefore(cp, beforeCp) {
    if (cp === beforeCp) return;
    const i = this.order.indexOf(cp);
    if (i < 0) return;
    const movingDown = i < this.order.indexOf(beforeCp);
    this.order.splice(i, 1);
    const j = this.order.indexOf(beforeCp);
    const insertAt = j < 0 ? this.order.length : (movingDown ? j + 1 : j);
    this.order.splice(insertAt, 0, cp);
    this.save();
    this.emit();
  }

  list() { return [...this.order]; }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.order)); } catch { /* storage disabled / full */ }
  }

  subscribe(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit() { this.subs.forEach((fn) => fn()); }
}

window.App = window.App || {};
window.App.BlockFavorites = { BlockFavorites };

})();
