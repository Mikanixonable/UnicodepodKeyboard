// Unicode Art favorites/mylist store (localStorage) + subscription.
// Deliberately a separate store from MyLists (favorites.js): character
// favorites/mylists and Unicode Art favorites/mylists are different
// features with different record types (codepoints vs. art work ids), so
// they're kept in entirely separate storage, not shared lists.

(function () {

const KEY = 'unicode-app:art-lists:v1';
const DEFAULT_LIST_ID = 'art-favorites';
const DEFAULT_LIST_NAME = 'お気に入り';
const DEFAULT_LIST_ICON = '★';
const EXTRA_LIST_ICON = '○';

function uniqueStrings(values) {
  const seen = new Set();
  const list = [];
  for (const value of values) {
    if (typeof value !== 'string' || !value || seen.has(value)) continue;
    seen.add(value);
    list.push(value);
  }
  return list;
}

function normalizeName(name, fallback) {
  return typeof name === 'string' && name.trim() ? name.trim() : fallback;
}

function makeList({ id, name, icon, items, builtIn = false }) {
  const list = {
    id: typeof id === 'string' && id ? id : `list-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: normalizeName(name, builtIn ? DEFAULT_LIST_NAME : 'マイリスト'),
    icon: normalizeName(icon, builtIn ? DEFAULT_LIST_ICON : EXTRA_LIST_ICON),
    builtIn: !!builtIn,
    items: uniqueStrings(items || []),
  };
  list.set = new Set(list.items);
  return list;
}

class ArtLists {
  constructor() {
    this.state = this.load();
    this.subs = new Set();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return this.seed();
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return this.normalizeState(parsed);
      return this.seed();
    } catch {
      return this.seed();
    }
  }

  seed() {
    return {
      activeId: DEFAULT_LIST_ID,
      lists: [makeList({ id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME, icon: DEFAULT_LIST_ICON, builtIn: true })],
    };
  }

  normalizeState(state) {
    const lists = Array.isArray(state.lists) ? state.lists.map((list) => makeList(list)) : [];
    let defaultList = lists.find((list) => list.id === DEFAULT_LIST_ID || list.builtIn);
    if (!defaultList) {
      defaultList = makeList({ id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME, icon: DEFAULT_LIST_ICON, builtIn: true });
      lists.unshift(defaultList);
    } else {
      defaultList.id = DEFAULT_LIST_ID;
      defaultList.name = DEFAULT_LIST_NAME;
      defaultList.icon = DEFAULT_LIST_ICON;
      defaultList.builtIn = true;
    }

    const activeId = typeof state.activeId === 'string' && lists.some((list) => list.id === state.activeId)
      ? state.activeId
      : DEFAULT_LIST_ID;

    return { activeId, lists };
  }

  save() {
    try {
      const payload = {
        activeId: this.state.activeId,
        lists: this.state.lists.map(({ set, ...list }) => list),
      };
      localStorage.setItem(KEY, JSON.stringify(payload));
    } catch { /* storage disabled / full */ }
  }

  get lists() { return this.state.lists; }

  get activeId() { return this.state.activeId; }

  get activeList() {
    return this.state.lists.find((list) => list.id === this.state.activeId) || this.state.lists[0];
  }

  get defaultListId() { return DEFAULT_LIST_ID; }

  findList(id) {
    return this.state.lists.find((list) => list.id === id) || null;
  }

  hasIn(id, artId) {
    const list = this.findList(id);
    return !!list && list.set.has(artId);
  }

  addTo(id, artId) {
    const list = this.findList(id);
    if (!list || list.set.has(artId)) return false;
    list.set.add(artId);
    list.items.push(artId);
    this.save();
    this.emit();
    return true;
  }

  removeFrom(id, artId) {
    const list = this.findList(id);
    if (!list || !list.set.has(artId)) return false;
    list.set.delete(artId);
    list.items = list.items.filter((x) => x !== artId);
    this.save();
    this.emit();
    return true;
  }

  toggleIn(id, artId) {
    const list = this.findList(id);
    if (!list) return false;
    return list.set.has(artId) ? !this.removeFrom(id, artId) : this.addTo(id, artId);
  }

  canDeleteActive() {
    return !!this.activeList && !this.activeList.builtIn;
  }

  setActive(id) {
    if (this.state.activeId === id || !this.findList(id)) return false;
    this.state.activeId = id;
    this.save();
    this.emit();
    return true;
  }

  createList(name) {
    const base = normalizeName(name, 'マイリスト');
    const existing = new Set(this.state.lists.map((list) => list.name));
    let finalName = base;
    let suffix = 2;
    while (existing.has(finalName)) {
      finalName = `${base} ${suffix}`;
      suffix += 1;
    }
    const list = makeList({ name: finalName, icon: EXTRA_LIST_ICON, builtIn: false });
    this.state.lists.push(list);
    this.state.activeId = list.id;
    this.save();
    this.emit();
    return list;
  }

  renameList(id, name) {
    const list = this.findList(id);
    if (!list || list.builtIn) return false;
    const base = normalizeName(name, list.name);
    const existing = new Set(this.state.lists.filter((l) => l.id !== id).map((l) => l.name));
    let finalName = base;
    let suffix = 2;
    while (existing.has(finalName)) {
      finalName = `${base} ${suffix}`;
      suffix += 1;
    }
    list.name = finalName;
    this.save();
    this.emit();
    return true;
  }

  removeList(id) {
    const list = this.findList(id);
    if (!list || list.builtIn) return false;
    this.state.lists = this.state.lists.filter((item) => item.id !== id);
    if (!this.findList(this.state.activeId)) this.state.activeId = DEFAULT_LIST_ID;
    this.save();
    this.emit();
    return true;
  }

  subscribe(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit() { this.subs.forEach((fn) => fn(this.state)); }
}

window.App = window.App || {};
window.App.ArtLists = { ArtLists };

})();
