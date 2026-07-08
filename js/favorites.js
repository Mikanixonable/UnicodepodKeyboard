// Mylist store (localStorage) + subscription.

(function () {

const KEY = 'unicode-app:mylists:v2';
const LEGACY_KEYS = ['unicode-app:mylist:v1', 'unicode-app:favorites:v1'];
const DEFAULT_LIST_ID = 'favorites';
const DEFAULT_LIST_NAME = 'お気に入り';
const DEFAULT_LIST_ICON = '★';
const EXTRA_LIST_ICON = '○';

function uniqueInts(values) {
  const seen = new Set();
  const list = [];
  for (const value of values) {
    if (!Number.isInteger(value) || seen.has(value)) continue;
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
    items: uniqueInts(items || []),
  };
  list.set = new Set(list.items);
  return list;
}

class MyLists {
  constructor() {
    this.state = this.load();
    this.subs = new Set();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY) || LEGACY_KEYS.map((k) => localStorage.getItem(k)).find(Boolean);
      if (!raw) return this.seed();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return this.seed(parsed);
      if (parsed && typeof parsed === 'object') return this.normalizeState(parsed);
      return this.seed();
    } catch {
      return this.seed();
    }
  }

  seed(items = []) {
    return {
      activeId: DEFAULT_LIST_ID,
      lists: [makeList({ id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME, icon: DEFAULT_LIST_ICON, items, builtIn: true })],
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
      for (const key of LEGACY_KEYS) localStorage.removeItem(key);
    } catch { /* storage disabled / full */ }
  }

  get lists() { return this.state.lists; }

  get activeId() { return this.state.activeId; }

  get activeList() {
    return this.state.lists.find((list) => list.id === this.state.activeId) || this.state.lists[0];
  }

  get activeLabel() {
    const list = this.activeList;
    return list ? `${list.icon} ${list.name}` : DEFAULT_LIST_NAME;
  }

  labelFor(id) {
    const list = this.findList(id);
    return list ? `${list.icon} ${list.name}` : DEFAULT_LIST_NAME;
  }

  findList(id) {
    return this.state.lists.find((list) => list.id === id) || null;
  }

  has(cp) { return !!this.activeList && this.activeList.set.has(cp); }

  hasIn(id, cp) {
    const list = this.findList(id);
    return !!list && list.set.has(cp);
  }

  addTo(id, cp) {
    const list = this.findList(id);
    if (!list) return false;
    if (list.set.has(cp)) return false;
    list.set.add(cp);
    list.items.push(cp);
    this.save();
    this.emit();
    return true;
  }

  removeFrom(id, cp) {
    const list = this.findList(id);
    if (!list || !list.set.has(cp)) return false;
    list.set.delete(cp);
    list.items = list.items.filter((x) => x !== cp);
    this.save();
    this.emit();
    return true;
  }

  toggleIn(id, cp) {
    const list = this.findList(id);
    if (!list) return false;
    return list.set.has(cp) ? !this.removeFrom(id, cp) : this.addTo(id, cp);
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

  removeList(id) {
    const list = this.findList(id);
    if (!list || list.builtIn) return false;
    this.state.lists = this.state.lists.filter((item) => item.id !== id);
    if (!this.findList(this.state.activeId)) this.state.activeId = DEFAULT_LIST_ID;
    this.save();
    this.emit();
    return true;
  }

  toggle(cp) {
    return this.toggleIn(this.activeId, cp);
  }

  remove(cp) {
    this.removeFrom(this.activeId, cp);
  }

  move(cp, dir) {
    const list = this.activeList;
    if (!list) return;
    const i = list.items.indexOf(cp);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.items.length) return;
    [list.items[i], list.items[j]] = [list.items[j], list.items[i]];
    this.save();
    this.emit();
  }

  subscribe(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit() { this.subs.forEach(fn => fn(this.state)); }
}

window.App = window.App || {};
window.App.MyLists = { MyLists };
window.App.MyList = { MyList: MyLists };

})();
