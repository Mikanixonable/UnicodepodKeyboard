// Input history store (localStorage): most-recently-inserted characters, deduped.

(function () {

const KEY = 'unicode-app:history:v1';
const CAP = 100;

class History {
  constructor() {
    this.list = this.load();
    this.subs = new Set();
  }

  load() {
    const arr = window.App.Util.storage.getJson(KEY, []);
    return Array.isArray(arr) ? arr.filter(n => Number.isInteger(n)).slice(0, CAP) : [];
  }

  save() {
    window.App.Util.storage.setJson(KEY, this.list);
  }

  // Record an inserted codepoint: move to front, dedupe, cap.
  record(cp) {
    this.list = [cp, ...this.list.filter(x => x !== cp)].slice(0, CAP);
    this.save();
    this.emit();
  }

  remove(cp) {
    this.list = this.list.filter(x => x !== cp);
    this.save();
    this.emit();
  }

  clear() {
    this.list = [];
    this.save();
    this.emit();
  }

  subscribe(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit() { this.subs.forEach(fn => fn(this.list)); }
}

window.App = window.App || {};
window.App.History = { History };

})();
