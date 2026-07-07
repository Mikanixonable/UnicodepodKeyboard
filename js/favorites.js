// Favorites store (localStorage) + subscription.

(function () {

const KEY = 'unicode-app:favorites:v1';

class Favorites {
  constructor() {
    this.list = this.load();
    this.set = new Set(this.list);
    this.subs = new Set();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(n => Number.isInteger(n)) : [];
    } catch {
      return [];
    }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.list));
    } catch { /* storage disabled / full */ }
  }

  has(cp) { return this.set.has(cp); }

  toggle(cp) {
    if (this.set.has(cp)) {
      this.set.delete(cp);
      this.list = this.list.filter(x => x !== cp);
    } else {
      this.set.add(cp);
      this.list.push(cp);
    }
    this.save();
    this.emit();
    return this.set.has(cp);
  }

  remove(cp) {
    if (!this.set.has(cp)) return;
    this.set.delete(cp);
    this.list = this.list.filter(x => x !== cp);
    this.save();
    this.emit();
  }

  move(cp, dir) {
    const i = this.list.indexOf(cp);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= this.list.length) return;
    [this.list[i], this.list[j]] = [this.list[j], this.list[i]];
    this.save();
    this.emit();
  }

  subscribe(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit() { this.subs.forEach(fn => fn(this.list)); }
}

window.App = window.App || {};
window.App.Favorites = { Favorites };

})();
