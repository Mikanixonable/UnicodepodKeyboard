// Sticky block-name header with a searchable dropdown that jumps the grid.

(function () {

const D = window.App.Data;
const { escapeHtml } = window.App.Util;

const LONG_PRESS_MS = 450;

function planeLabel(p) {
  const { ja, en } = D.planeInfo(p);
  return `第${p}面（Plane ${p}）: ${ja}（${en}）`;
}

// Legend content depends on the current color-coding mode, so the grid,
// boards, and block picker all read it from a single place.
function legendHtmlFor(mode) {
  if (mode === 'none') {
    return '<span class="legend-item legend-none">色分けなし（No coloring）</span>';
  }
  if (mode === 'age') {
    // Version name + year range are already combined into one string (e.g.
    // "v1.x(1991-1993)") -- a single label, not a ja/en pair, so it fits on
    // one line without duplicating the version number.
    return D.ERAS
      .map((e) => `<span class="legend-item"><span class="swatch" data-group="${e.key}"></span><span class="legend-label"><span class="legend-ja">${e.en}</span></span></span>`)
      .join('');
  }
  return Object.entries(D.GROUP_LABELS)
    .map(([g, [ja, en]]) =>
      `<span class="legend-item"><span class="swatch" data-group="${g}"></span><span class="legend-label"><span class="legend-ja">${ja}</span><span class="legend-en">${en}</span></span></span>`)
    .join('');
}

// Self-contained legend widget: the color-mode toggle (なし/種類/追加時期)
// plus the matching legend for whichever mode is active. Instantiate one per
// place the legend should appear (the shared bar above all four tabs, and
// the block picker popup) -- each re-renders itself on color-mode change.
class Legend {
  constructor(root, colorMode) {
    this.root = root;
    this.colorMode = colorMode;
    this.render();
    this.colorMode.subscribe(() => this.render());
  }

  render() {
    const mode = this.colorMode.get();
    this.root.innerHTML =
      `<div class="colormode-toggle" role="group" aria-label="色分け方式">
        <span class="colormode-label">色分け</span>
        <button type="button" class="colormode-opt" data-colormode="none">なし</button>
        <button type="button" class="colormode-opt" data-colormode="category">種類</button>
        <button type="button" class="colormode-opt" data-colormode="age">追加時期</button>
      </div>
      <div class="legend-items">${legendHtmlFor(mode)}</div>`;
    for (const btn of this.root.querySelectorAll('.colormode-opt')) {
      btn.classList.toggle('active', btn.dataset.colormode === mode);
      btn.addEventListener('click', () => this.colorMode.set(btn.dataset.colormode));
    }
  }
}

// Builds the plane-header + block-item <li>s shared by the block-picker
// modal list and the persistent sidebar list. onItemClick(block) is called
// on click; the two callers differ only in what else that does (close the
// modal, or not). onContextMenu(block, x, y), if given, is wired to
// right-click (used for the favorite-block toggle). blocks defaults to every
// block, in codepoint order; pass a filtered/reordered list (e.g. the
// favorited ones, in the user's custom order) to render a subset instead.
// noPlaneHeaders skips the "第N面" group headers -- appropriate for a
// custom-ordered list, where blocks no longer run in ascending codepoint
// order and a header-per-plane-change would be meaningless. draggable +
// onReorder(draggedCp, droppedOnCp) wire up HTML5 drag-and-drop reordering.
function buildBlockList(listEl, mode, onItemClick, {
  blocks, blockFavorites, onContextMenu, noPlaneHeaders, draggable, onReorder,
} = {}) {
  const frag = document.createDocumentFragment();
  let lastPlane = null;
  const planeHeaders = [];
  for (const b of (blocks || D.getBlocks())) {
    const plane = b.s >>> 16;
    if (!noPlaneHeaders && plane !== lastPlane) {
      lastPlane = plane;
      const header = document.createElement('li');
      header.className = 'plane-header';
      header.role = 'presentation';
      header.textContent = planeLabel(plane);
      frag.appendChild(header);
      planeHeaders.push({ plane, el: header });
    }
    const { ja, en } = D.blockLabel(b.n);
    const group = D.blockGroupForMode(mode, b) || '';
    const samples = D.sampleGlyphs(b, 3);
    const isFav = blockFavorites ? blockFavorites.has(b.s) : false;
    const li = document.createElement('li');
    li.role = 'option';
    li.className = 'block-item';
    li.classList.toggle('is-fav', isFav);
    li.dataset.cp = b.s;
    li.dataset.group = group;
    const range = `U+${D.hex(b.s)}–U+${D.hex(b.e)}`;
    li.title = range;
    li.innerHTML =
      `<div class="block-item-head">` +
        `<span class="swatch" data-group="${group}"></span>` +
        `<span class="block-item-name">` +
          `<span class="name-ja">${escapeHtml(ja || en)}</span>` +
          (ja ? `<span class="name-en">${escapeHtml(en)}</span>` : '') +
          `<span class="block-item-range">${range}</span>` +
        `</span>` +
        `<span class="block-item-fav" aria-hidden="true">★</span>` +
      `</div>` +
      (samples.length
        ? `<div class="block-item-samples">${samples.map((cp) => `<span class="sample-glyph">${escapeHtml(D.glyphFor(cp))}</span>`).join('')}</div>`
        : '');
    if (onContextMenu) {
      // Right-click (contextmenu) covers desktop, but touch devices --
      // especially iOS Safari -- don't reliably fire contextmenu on a
      // long-press, so there'd be no way to reach "お気に入りブロックに
      // 追加" on mobile without this. Same long-press-vs-tap pattern as
      // grid.js's bindPointer()/app.js's bindCharBoard(): a touch pointerdown
      // starts a 450ms timer that opens the menu and suppresses the
      // following click; releasing/moving early cancels it as a normal tap.
      let timer = null, suppress = false, downXY = null;
      const clearTimer = () => { clearTimeout(timer); timer = null; };
      li.addEventListener('pointerdown', (e) => {
        suppress = false;
        downXY = { x: e.clientX, y: e.clientY };
        if (e.pointerType !== 'mouse') {
          clearTimer();
          timer = setTimeout(() => {
            suppress = true;
            onContextMenu(b, downXY.x, downXY.y);
          }, LONG_PRESS_MS);
        }
      });
      li.addEventListener('pointermove', (e) => {
        if (timer && downXY && Math.hypot(e.clientX - downXY.x, e.clientY - downXY.y) > 10)
          clearTimer();
      });
      li.addEventListener('pointerup', clearTimer);
      li.addEventListener('pointercancel', () => { clearTimer(); suppress = true; });
      li.addEventListener('click', (e) => {
        if (suppress) { suppress = false; e.stopImmediatePropagation(); return; }
        onItemClick(b);
      });
      li.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        onContextMenu(b, e.clientX, e.clientY);
      });
    } else {
      li.addEventListener('click', () => onItemClick(b));
    }
    if (draggable) {
      li.draggable = true;
      li.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', String(b.s));
        e.dataTransfer.effectAllowed = 'move';
        li.classList.add('dragging');
      });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
      li.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        li.classList.add('drag-over');
      });
      li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        li.classList.remove('drag-over');
        const draggedCp = Number(e.dataTransfer.getData('text/plain'));
        if (Number.isFinite(draggedCp) && draggedCp !== b.s && onReorder) onReorder(draggedCp, b.s);
      });
    }
    frag.appendChild(li);
  }
  listEl.appendChild(frag);
  return { items: [...listEl.querySelectorAll('.block-item')], planeHeaders };
}

// Right-click menu shared by the modal list and the sidebar list: toggle
// whether this block is in the favorite-blocks set (shown in the right menu
// zone's "お気に入り" tab).
// FLIP reorder animation: snapshot each item's position (keyed by its
// data-cp) before the DOM mutates, then after `rebuild()` runs, slide items
// from their old spot to the new one so drag-reordering doesn't just snap.
function animateReorder(listEl, rebuild) {
  const before = new Map();
  for (const li of listEl.querySelectorAll('.block-item'))
    before.set(li.dataset.cp, li.getBoundingClientRect());
  rebuild();
  for (const li of listEl.querySelectorAll('.block-item')) {
    const old = before.get(li.dataset.cp);
    if (!old) continue;
    const now = li.getBoundingClientRect();
    const dx = old.left - now.left;
    const dy = old.top - now.top;
    if (!dx && !dy) continue;
    li.style.transition = 'none';
    li.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => {
      li.style.transition = 'transform .2s ease';
      li.style.transform = '';
    });
  }
}

function openBlockFavMenu(b, x, y, blockFavorites) {
  const isFav = blockFavorites.has(b.s);
  window.App.Menu.openMenu(x, y, [{
    label: isFav ? '★ お気に入りブロックから削除' : '★ お気に入りブロックに追加',
    onClick: () => blockFavorites.toggle(b.s),
  }]);
}

// Renders "第N面" shortcut buttons and wires them to scroll their list to
// that plane's header. Shared by the modal (which also clears its search
// box first) and the sidebar's "全て" tab. `extraButtons` (an array of
// {label, title, onClick}) render before the plane buttons in the same row
// -- used by the sidebar for its 現在の位置/絵文字 shortcuts.
function wirePlaneJump(container, planeHeaders, { beforeJump, extraButtons = [] } = {}) {
  const extraHtml = extraButtons
    .map((b, i) => `<button type="button" class="plane-jump-btn" data-extra="${i}" title="${escapeHtml(b.title || b.label)}">${b.label}</button>`)
    .join('');
  const planeHtml = planeHeaders
    .map(({ plane }) => `<button type="button" class="plane-jump-btn" data-plane="${plane}" title="${escapeHtml(planeLabel(plane))}">第${plane}面</button>`)
    .join('');
  container.innerHTML = extraHtml + planeHtml;
  for (const btn of container.querySelectorAll('[data-extra]')) {
    const i = Number(btn.dataset.extra);
    btn.addEventListener('click', () => {
      if (beforeJump) beforeJump();
      extraButtons[i].onClick();
    });
  }
  for (const btn of container.querySelectorAll('[data-plane]')) {
    btn.addEventListener('click', () => {
      const plane = Number(btn.dataset.plane);
      const target = planeHeaders.find((h) => h.plane === plane);
      if (!target) return;
      if (beforeJump) beforeJump();
      target.el.scrollIntoView({ block: 'start' });
    });
  }
}

// Persistent scrollable block list shown in the right menu zone: same look
// as the modal's list (colors, samples), clicking jumps the main grid
// without opening/closing anything. Has two tabs -- 全て (every block) and
// お気に入り (just the ones favorited via right-click, here or in the modal).
class BlockSidebar {
  constructor(root, { onJump, colorMode, blockFavorites }) {
    this.root = root;
    this.onJump = onJump;
    this.colorMode = colorMode;
    this.blockFavorites = blockFavorites;
    this.tab = 'all';
    this.currentCp = null;
    root.innerHTML = `
      <div class="block-sidebar-tabs" role="tablist">
        <button type="button" class="block-sidebar-tab active" data-tab="all" role="tab">全て</button>
        <button type="button" class="block-sidebar-tab" data-tab="fav" role="tab">★ お気に入り</button>
      </div>
      <div class="plane-jump" data-panel="all"></div>
      <ul class="block-list" data-panel="all" role="listbox"></ul>
      <ul class="block-list" data-panel="fav" role="listbox" hidden></ul>`;
    this.planeJumpEl = root.querySelector('.plane-jump');
    this.allListEl = root.querySelector('ul[data-panel="all"]');
    this.favListEl = root.querySelector('ul[data-panel="fav"]');

    this.buildAll();
    this.buildFav();

    for (const t of root.querySelectorAll('.block-sidebar-tab')) {
      t.addEventListener('click', () => this.setTab(t.dataset.tab));
    }
    this.colorMode.subscribe(() => { this.buildAll(); this.buildFav(); });
    this.blockFavorites.subscribe(() => { this.buildAll(); this.buildFav(); });
  }

  mode() { return this.colorMode.get(); }

  setTab(tab) {
    this.tab = tab;
    for (const t of this.root.querySelectorAll('.block-sidebar-tab'))
      t.classList.toggle('active', t.dataset.tab === tab);
    this.planeJumpEl.hidden = tab !== 'all';
    this.allListEl.hidden = tab !== 'all';
    this.favListEl.hidden = tab !== 'fav';
  }

  buildAll() {
    this.allListEl.replaceChildren();
    const { items, planeHeaders } = buildBlockList(this.allListEl, this.mode(), (b) => this.onJump(b.s), {
      blockFavorites: this.blockFavorites,
      onContextMenu: (b, x, y) => openBlockFavMenu(b, x, y, this.blockFavorites),
    });
    this.allItems = items;
    wirePlaneJump(this.planeJumpEl, planeHeaders, {
      extraButtons: [
        { label: '現在地', title: '現在表示中のブロックへ', onClick: () => this.scrollToCurrentBlock() },
        { label: '😀 絵文字', title: '絵文字ブロックへ', onClick: () => this.scrollToEmojiBlock() },
      ],
    });
  }

  // Called from the main grid's onTopCpChange (see app.js), same as
  // BlockHeader.setTopCp -- tracks which block is currently scrolled into
  // view in the 符号表 grid, for the 現在地 shortcut button below.
  setTopCp(cp) {
    this.currentCp = cp;
  }

  scrollToBlockStart(startCp) {
    const li = this.allListEl.querySelector(`.block-item[data-cp="${startCp}"]`);
    if (li) li.scrollIntoView({ block: 'start' });
  }

  scrollToCurrentBlock() {
    if (this.currentCp == null) return;
    const b = D.blockOf(this.currentCp);
    if (b) this.scrollToBlockStart(b.s);
  }

  scrollToEmojiBlock() {
    const b = D.getBlocks().find((blk) => D.blockGroup(blk) === 'emoji');
    if (b) this.scrollToBlockStart(b.s);
  }

  // Favorites keep the user's own drag-to-reorder order (not codepoint
  // order), so no plane headers (a plane-change header would be meaningless
  // once entries are reshuffled) and drag-and-drop is enabled here only.
  buildFav() {
    animateReorder(this.favListEl, () => {
      this.favListEl.replaceChildren();
      const byStart = new Map(D.getBlocks().map((b) => [b.s, b]));
      const favBlocks = this.blockFavorites.list().map((cp) => byStart.get(cp)).filter(Boolean);
      if (!favBlocks.length) {
        const empty = document.createElement('li');
        empty.className = 'block-sidebar-empty';
        empty.role = 'presentation';
        empty.textContent = 'ブロックを右クリックして「お気に入りブロックに追加」してください。';
        this.favListEl.appendChild(empty);
        return;
      }
      buildBlockList(this.favListEl, this.mode(), (b) => this.onJump(b.s), {
        blocks: favBlocks,
        blockFavorites: this.blockFavorites,
        noPlaneHeaders: true,
        draggable: true,
        onReorder: (draggedCp, droppedOnCp) => this.blockFavorites.moveBefore(draggedCp, droppedOnCp),
        onContextMenu: (b, x, y) => openBlockFavMenu(b, x, y, this.blockFavorites),
      });
    });
  }
}

class BlockHeader {
  constructor(root, { onJump, colorMode, jumpRoot, blockFavorites }) {
    this.root = root;
    this.onJump = onJump;
    this.colorMode = colorMode;
    this.blockFavorites = blockFavorites;
    this.open = false;
    this.current = null;
    this.currentBlock = null;
    this.activeFilter = null;

    root.innerHTML = `
      <div class="block-bar">
        <button type="button" class="block-btn" aria-haspopup="listbox" aria-expanded="false">
          <span class="swatch"></span>
          <span class="block-name">
            <span class="name-ja">—</span>
            <span class="name-en"></span>
          </span>
          <span class="caret">▾</span>
        </button>
      </div>
      <div class="block-pop" hidden>
        <div class="block-pop-backdrop"></div>
        <div class="block-pop-box" role="dialog" aria-modal="true" aria-label="領域選択">
          <div class="block-pop-header">
            <div class="plane-jump"></div>
            <button type="button" class="block-pop-close" aria-label="閉じる">✕</button>
          </div>
          <div class="block-search-wrap">
            <input type="text" class="block-search" placeholder="ブロックを検索…" aria-label="ブロック検索">
            <button type="button" class="block-search-clear" aria-label="検索内容を削除" hidden>×</button>
          </div>
          <div class="block-legend"></div>
          <ul class="block-list" role="listbox"></ul>
        </div>
      </div>`;

    // rendered into a separate container (e.g. the right menu zone) if given,
    // otherwise appended alongside the block-btn
    const jumpHtml = `
      <form class="jump" autocomplete="off">
        <span class="jump-prefix">U+</span>
        <input type="text" class="jump-input" placeholder="コードポイントで移動"
               inputmode="text" aria-label="コードポイントで移動（16進）" maxlength="6">
        <button type="submit" class="jump-go" aria-label="移動">→</button>
      </form>`;
    const jScope = jumpRoot || root;
    if (jumpRoot) jScope.innerHTML = jumpHtml;
    else jScope.insertAdjacentHTML('beforeend', jumpHtml);

    this.btn = root.querySelector('.block-btn');
    this.swatchEl = root.querySelector('.block-btn > .swatch');
    this.nameJaEl = root.querySelector('.block-btn .name-ja');
    this.nameEnEl = root.querySelector('.block-btn .name-en');
    this.pop = root.querySelector('.block-pop');
    this.planeJumpEl = root.querySelector('.plane-jump');
    this.legendEl = root.querySelector('.block-legend');
    this.search = root.querySelector('.block-search');
    this.searchClear = root.querySelector('.block-search-clear');
    this.listEl = root.querySelector('.block-list');
    this.jumpForm = jScope.querySelector('.jump');
    this.jumpInput = jScope.querySelector('.jump-input');

    this.buildList();
    this.buildPlaneJump();
    new Legend(this.legendEl, colorMode);
    // Central block picker only: clicking a legend item filters the list
    // down to that group (click again to clear). The whole item is the hit
    // area, not just the swatch dot. Delegated on the stable .block-legend
    // container since Legend.render() replaces its innerHTML on every
    // color-mode change.
    this.legendEl.addEventListener('click', (e) => {
      const item = e.target.closest('.legend-item');
      const swatch = item && item.querySelector('.swatch[data-group]');
      if (!swatch) return;
      const g = swatch.dataset.group;
      this.activeFilter = this.activeFilter === g ? null : g;
      this.updateLegendActive();
      this.filter(this.search.value);
    });

    this.btn.addEventListener('click', () => this.toggle());
    root.querySelector('.block-pop-close').addEventListener('click', () => this.close());
    root.querySelector('.block-pop-backdrop').addEventListener('click', () => this.close());
    this.search.addEventListener('input', () => {
      this.filter(this.search.value);
      this.searchClear.hidden = !this.search.value;
    });
    // Mobile: the virtual keyboard's "Enter"/"Go" key otherwise does nothing
    // here (it's not inside a <form> that would submit) -- blur so it
    // actually dismisses the keyboard, matching what users expect Enter to do.
    this.search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.search.blur(); }
    });
    this.searchClear.addEventListener('click', () => {
      this.search.value = '';
      this.filter('');
      this.searchClear.hidden = true;
      // No this.search.focus() here -- that would pop the virtual keyboard
      // right back up, same reasoning as maybeFocus() in output.js. The
      // user tapped a button, not the field itself.
    });
    this.jumpForm.addEventListener('submit', (e) => { e.preventDefault(); this.jump(); });
    this.jumpInput.addEventListener('input', () => this.jumpInput.classList.remove('invalid'));
    document.addEventListener('keydown', (e) => {
      if (this.open && e.key === 'Escape') { this.close(); this.btn.focus(); }
    });
    this.colorMode.subscribe(() => {
      this.applyColorMode();
      // Group keys differ between color modes (categories vs. eras), so a
      // filter picked under one mode wouldn't mean anything under another.
      this.activeFilter = null;
      this.updateLegendActive();
      this.filter(this.search.value);
    });
    this.blockFavorites.subscribe(() => this.applyFavorites());
  }

  mode() { return this.colorMode.get(); }

  // Highlights whichever legend item corresponds to the active group
  // filter (if any) so the user can see what's currently applied.
  updateLegendActive() {
    for (const item of this.legendEl.querySelectorAll('.legend-item')) {
      const sw = item.querySelector('.swatch[data-group]');
      item.classList.toggle('legend-active', !!sw && sw.dataset.group === this.activeFilter);
    }
  }

  applyFavorites() {
    for (const li of this.items)
      li.classList.toggle('is-fav', this.blockFavorites.has(Number(li.dataset.cp)));
  }

  // Re-colors everything already in the DOM (list swatches + the current
  // block indicator) after the color mode changes, without rebuilding. The
  // legend itself (including its embedded toggle) re-renders on its own via
  // the Legend instance created in the constructor.
  applyColorMode() {
    const mode = this.mode();
    for (const li of this.items) {
      const b = D.blockOf(Number(li.dataset.cp));
      const g = b ? (D.blockGroupForMode(mode, b) || '') : '';
      li.dataset.group = g;
      const sw = li.querySelector('.swatch');
      if (sw) sw.dataset.group = g;
    }
    this.swatchEl.dataset.group = this.currentBlock ? (D.blockGroupForMode(mode, this.currentBlock) || '') : '';
  }

  buildList() {
    const { items, planeHeaders } = buildBlockList(this.listEl, this.mode(), (b) => {
      this.onJump(b.s);
      this.close();
    }, {
      blockFavorites: this.blockFavorites,
      onContextMenu: (b, x, y) => openBlockFavMenu(b, x, y, this.blockFavorites),
    });
    this.items = items;
    this.planeHeaders = planeHeaders;
  }

  buildPlaneJump() {
    wirePlaneJump(this.planeJumpEl, this.planeHeaders, {
      beforeJump: () => { this.search.value = ''; this.filter(''); this.searchClear.hidden = true; },
    });
  }

  filter(q) {
    const s = q.trim().toLowerCase();
    let header = null, headerVisible = false;
    for (const el of this.listEl.children) {
      if (el.classList.contains('plane-header')) {
        if (header) header.hidden = !headerVisible;
        header = el;
        headerVisible = false;
        continue;
      }
      const matchesText = !s || el.textContent.toLowerCase().includes(s);
      const matchesGroup = !this.activeFilter || el.dataset.group === this.activeFilter;
      const visible = matchesText && matchesGroup;
      el.hidden = !visible;
      if (visible) headerVisible = true;
    }
    if (header) header.hidden = !headerVisible;
  }

  // Parse "1F600", "U+1F600", "u+41", "0x41" -> codepoint number (hex), or null.
  parseCp(str) {
    const s = str.trim().toUpperCase().replace(/^U\+/, '').replace(/^0X/, '');
    if (!/^[0-9A-F]{1,6}$/.test(s)) return null;
    return parseInt(s, 16);
  }

  jump() {
    const cp = this.parseCp(this.jumpInput.value);
    if (cp == null || !D.inScope(cp)) {
      this.jumpInput.classList.add('invalid');
      return;
    }
    this.onJump(cp, true);
    this.jumpInput.blur();
  }

  setTopCp(cp) {
    const b = D.blockOf(cp);
    const name = b ? b.n : 'No Block';
    this.currentBlock = b;
    this.swatchEl.dataset.group = b ? (D.blockGroupForMode(this.mode(), b) || '') : '';
    if (name === this.current) return;
    this.current = name;
    const { ja, en } = b ? D.blockLabel(b.n) : { ja: '未割り当て', en: name };
    this.nameJaEl.textContent = ja || en;
    this.nameEnEl.textContent = ja ? en : '';
    // highlight active item
    for (const li of this.items)
      li.classList.toggle('active', b && Number(li.dataset.cp) === b.s);
  }

  toggle() { this.open ? this.close() : this.openPop(); }

  openPop() {
    this.open = true;
    this.pop.hidden = false;
    this.btn.setAttribute('aria-expanded', 'true');
    this.search.value = '';
    this.filter('');
    this.searchClear.hidden = true;
    // Skip on mobile: auto-focusing the search field pops the virtual
    // keyboard the instant this modal opens, covering most of it before the
    // user has even seen the block list -- same reasoning as maybeFocus() in
    // output.js. Desktop keeps the convenience of landing ready-to-type.
    if (!window.matchMedia('(max-width: 768px)').matches) this.search.focus();
    const active = this.listEl.querySelector('.active');
    if (active) active.scrollIntoView({ block: 'center' });
  }

  close() {
    this.open = false;
    this.pop.hidden = true;
    this.btn.setAttribute('aria-expanded', 'false');
  }
}

window.App.Blocks = { BlockHeader, legendHtmlFor, Legend, BlockSidebar };

})();
