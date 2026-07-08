// Sticky block-name header with a searchable dropdown that jumps the grid.

(function () {

const D = window.App.Data;

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
    return D.ERAS
      .map((e) => `<span class="legend-item"><span class="swatch" data-group="${e.key}"></span>${e.ja} <span class="legend-en">${e.en}</span></span>`)
      .join('');
  }
  return Object.entries(D.GROUP_LABELS)
    .map(([g, [ja, en]]) =>
      `<span class="legend-item"><span class="swatch" data-group="${g}"></span>${ja} <span class="legend-en">${en}</span></span>`)
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
      `<div class="legend-items">${legendHtmlFor(mode)}</div>
      <div class="colormode-toggle" role="group" aria-label="色分け方式">
        <span class="colormode-label">色分け</span>
        <button type="button" class="colormode-opt" data-colormode="none">なし</button>
        <button type="button" class="colormode-opt" data-colormode="category">種類</button>
        <button type="button" class="colormode-opt" data-colormode="age">追加時期</button>
      </div>`;
    for (const btn of this.root.querySelectorAll('.colormode-opt')) {
      btn.classList.toggle('active', btn.dataset.colormode === mode);
      btn.addEventListener('click', () => this.colorMode.set(btn.dataset.colormode));
    }
  }
}

class BlockHeader {
  constructor(root, { onJump, colorMode }) {
    this.root = root;
    this.onJump = onJump;
    this.colorMode = colorMode;
    this.open = false;
    this.current = null;
    this.currentBlock = null;

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
        <form class="jump" autocomplete="off">
          <span class="jump-prefix">U+</span>
          <input type="text" class="jump-input" placeholder="コードポイントで移動"
                 inputmode="text" aria-label="コードポイントで移動（16進）" maxlength="6">
          <button type="submit" class="jump-go" aria-label="移動">→</button>
        </form>
      </div>
      <div class="block-pop" hidden>
        <div class="plane-jump"></div>
        <input type="text" class="block-search" placeholder="ブロックを検索…" aria-label="ブロック検索">
        <div class="block-legend"></div>
        <ul class="block-list" role="listbox"></ul>
      </div>`;

    this.btn = root.querySelector('.block-btn');
    this.swatchEl = root.querySelector('.block-btn > .swatch');
    this.nameJaEl = root.querySelector('.block-btn .name-ja');
    this.nameEnEl = root.querySelector('.block-btn .name-en');
    this.pop = root.querySelector('.block-pop');
    this.planeJumpEl = root.querySelector('.plane-jump');
    this.legendEl = root.querySelector('.block-legend');
    this.search = root.querySelector('.block-search');
    this.listEl = root.querySelector('.block-list');
    this.jumpForm = root.querySelector('.jump');
    this.jumpInput = root.querySelector('.jump-input');

    this.buildList();
    this.buildPlaneJump();
    new Legend(this.legendEl, colorMode);

    this.btn.addEventListener('click', () => this.toggle());
    this.search.addEventListener('input', () => this.filter(this.search.value));
    this.jumpForm.addEventListener('submit', (e) => { e.preventDefault(); this.jump(); });
    this.jumpInput.addEventListener('input', () => this.jumpInput.classList.remove('invalid'));
    document.addEventListener('pointerdown', (e) => {
      if (this.open && !this.root.contains(e.target)) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (this.open && e.key === 'Escape') { this.close(); this.btn.focus(); }
    });
    window.addEventListener('resize', () => { if (this.open) this.fitPop(); });
    this.colorMode.subscribe(() => this.applyColorMode());
  }

  mode() { return this.colorMode.get(); }

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
    const frag = document.createDocumentFragment();
    let lastPlane = null;
    this.planeHeaders = [];
    const mode = this.mode();
    for (const b of D.getBlocks()) {
      const plane = b.s >>> 16;
      if (plane !== lastPlane) {
        lastPlane = plane;
        const header = document.createElement('li');
        header.className = 'plane-header';
        header.role = 'presentation';
        header.textContent = planeLabel(plane);
        frag.appendChild(header);
        this.planeHeaders.push({ plane, el: header });
      }
      const { ja, en } = D.blockLabel(b.n);
      const group = D.blockGroupForMode(mode, b) || '';
      const li = document.createElement('li');
      li.role = 'option';
      li.className = 'block-item';
      li.dataset.cp = b.s;
      li.dataset.group = group;
      li.title = `U+${D.hex(b.s)}–U+${D.hex(b.e)}`;
      li.innerHTML =
        `<span class="swatch" data-group="${group}"></span>` +
        `<span class="block-item-name">` +
        `<span class="name-ja">${escapeHtml(ja || en)}</span>` +
        (ja ? `<span class="name-en">${escapeHtml(en)}</span>` : '') +
        `</span>`;
      li.addEventListener('click', () => {
        this.onJump(b.s);
        this.close();
      });
      frag.appendChild(li);
    }
    this.listEl.appendChild(frag);
    this.items = [...this.listEl.querySelectorAll('.block-item')];
  }

  buildPlaneJump() {
    this.planeJumpEl.innerHTML = this.planeHeaders
      .map(({ plane }) => `<button type="button" class="plane-jump-btn" data-plane="${plane}" title="${escapeHtml(planeLabel(plane))}">第${plane}面</button>`)
      .join('');
    for (const btn of this.planeJumpEl.children) {
      btn.addEventListener('click', () => {
        const plane = Number(btn.dataset.plane);
        const target = this.planeHeaders.find((h) => h.plane === plane);
        if (!target) return;
        this.search.value = '';
        this.filter('');
        target.el.scrollIntoView({ block: 'start' });
      });
    }
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
      const visible = !s || el.textContent.toLowerCase().includes(s);
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
    this.fitPop();
    this.search.focus();
    const active = this.listEl.querySelector('.active');
    if (active) active.scrollIntoView({ block: 'center' });
  }

  // Cap the popup height to the viewport space actually available below it,
  // so opening it never pushes the page down (which reads as a layout jump).
  fitPop() {
    const top = this.pop.getBoundingClientRect().top;
    const available = window.innerHeight - top - 12;
    this.pop.style.maxHeight = `${Math.max(160, Math.min(available, window.innerHeight * 0.7))}px`;
  }

  close() {
    this.open = false;
    this.pop.hidden = true;
    this.btn.setAttribute('aria-expanded', 'false');
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

window.App.Blocks = { BlockHeader, legendHtmlFor, Legend };

})();
