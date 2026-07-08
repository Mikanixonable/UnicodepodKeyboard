// Virtualized 16-column Unicode grid with tap-to-insert and long-press / right-click menu.

(function () {

const D = window.App.Data;
const { openMenu } = window.App.Menu;

const BUFFER = 6; // extra rows above/below viewport
const SCROLL_KEY = 'unicode-app:scroll-cp:v1';

class Grid {
  constructor(root, { onInsert, onDetail, onAddMenu, onReveal, mylists, colorMode, onTopCpChange }) {
    this.root = root;
    this.onInsert = onInsert;
    this.onDetail = onDetail;
    this.onAddMenu = onAddMenu;
    this.onReveal = onReveal;
    this.fav = mylists;
    this.colorMode = colorMode;
    this.onTopCpChange = onTopCpChange;
    this.rowH = D.ROW_H;

    root.innerHTML = `
      <div class="col-header" role="row">
        <div class="gutter">U+0x</div>
        ${Array.from({ length: D.COLS }, (_, i) =>
          `<div class="colh">${i.toString(16).toUpperCase()}</div>`).join('')}
      </div>
      <div class="grid-scroll" tabindex="0">
        <div class="grid-sizer" style="height:${D.totalRows * D.ROW_H}px"></div>
        <div class="grid-rows"></div>
      </div>`;

    this.scroll = root.querySelector('.grid-scroll');
    this.rowsEl = root.querySelector('.grid-rows');
    this.sizerEl = root.querySelector('.grid-sizer');
    this.headerGutterEl = root.querySelector('.col-header .gutter');
    this.lastStart = -1;
    this.lastTopCp = -1;

    this.scroll.addEventListener('scroll', () => this.onScroll());
    this.bindPointer();
    this.fav.subscribe(() => this.rerender());
    this.colorMode.subscribe(() => this.rerender());
    window.addEventListener('resize', () => this.refreshLayout(true));
    this.refreshLayout(true);

    // restore scroll position (by codepoint, not raw pixels -- rowH depends
    // on viewport width, which may differ from the session that saved it)
    try {
      const saved = localStorage.getItem(SCROLL_KEY);
      if (saved != null) {
        const cp = Number(saved);
        if (Number.isFinite(cp) && D.inScope(cp)) this.scrollToCp(cp);
      }
    } catch { /* storage disabled */ }
  }

  // Debounced so rapid scroll events don't hammer localStorage.
  saveScrollPos(cp) {
    clearTimeout(this.scrollSaveTimer);
    this.scrollSaveTimer = setTimeout(() => {
      try { localStorage.setItem(SCROLL_KEY, String(cp)); } catch { /* storage disabled / full */ }
    }, 250);
  }

  onScroll() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.render(); });
  }

  visibleRowCount() {
    return Math.ceil(this.scroll.clientHeight / this.rowH);
  }

  refreshLayout(forceRender = false) {
    const currentWidth = this.scroll.clientWidth;
    if (currentWidth <= 0) return;
    const gutterWidth = this.headerGutterEl.getBoundingClientRect().width;
    // Subtract the gutter twice: once for the left row-label column, once
    // for the matching blank spacer column on the right (see .col-header /
    // .grid-row grid-template-columns), so the 16 colored cell-columns sit
    // centered (gutter : cells : spacer = 1 : 16 : 1) instead of flush left.
    const usable = currentWidth - gutterWidth * 2;
    const nextRowH = Math.max(1, usable / D.COLS);
    const prevRowH = this.rowH;
    if (nextRowH !== prevRowH) {
      this.rowH = nextRowH;
      this.root.style.setProperty('--cell-size', `${nextRowH}px`);
      this.sizerEl.style.height = `${D.totalRows * nextRowH}px`;
    }
    this.render(forceRender || nextRowH !== prevRowH);
  }

  render(force) {
    // +1px tolerance (in scrollTop space, before dividing by rowH): scrollToCp()
    // sets scrollTop = row * rowH, but the browser snaps that to a whole
    // device pixel, which can land a hair under the exact boundary --
    // otherwise floors down to row-1 here. A row-space epsilon would need to
    // scale with rowH (and with row count, since float error grows with the
    // magnitude of row * rowH), so add the tolerance in pixel space instead.
    const scrolledRow = (this.scroll.scrollTop + 1) / this.rowH;
    const start = Math.max(0, Math.floor(scrolledRow) - BUFFER);
    const end = Math.min(D.totalRows, start + this.visibleRowCount() + BUFFER * 2);

    // notify block header of the top-most fully-scoped codepoint
    const topRow = Math.floor(scrolledRow);
    const topCp = D.rowToBaseCp(Math.min(topRow, D.totalRows - 1));
    if (topCp !== this.lastTopCp) {
      this.lastTopCp = topCp;
      if (this.onTopCpChange) this.onTopCpChange(topCp);
      this.saveScrollPos(topCp);
    }

    if (!force && start === this.lastStart) return;
    this.lastStart = start;

    const frag = document.createDocumentFragment();
    for (let row = start; row < end; row++) frag.appendChild(this.buildRow(row));
    this.rowsEl.replaceChildren(frag);
    this.rowsEl.style.transform = `translateY(${start * this.rowH}px)`;
  }

  rerender() { this.render(true); }

  buildRow(row) {
    const base = D.rowToBaseCp(row);
    const el = document.createElement('div');
    el.className = 'grid-row';
    const prefix = (base >> 4).toString(16).toUpperCase();
    el.innerHTML = `<div class="gutter">U+${prefix}<span class="x">x</span></div>`;

    for (let col = 0; col < D.COLS; col++) {
      const cp = base + col;
      el.appendChild(this.buildCell(cp));
    }
    return el;
  }

  buildCell(cp) {
    if (!D.inScope(cp)) {
      const d = document.createElement('div');
      d.className = 'cell empty';
      return d;
    }
    const mode = this.colorMode.get();
    if (D.isEmptyCell(cp)) {
      const d = document.createElement('div');
      d.className = 'cell empty';
      d.dataset.group = D.groupForMode(mode, cp) || ''; // unassigned / surrogate / control
      return d;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cell';
    if (this.fav.has(cp)) b.classList.add('fav');
    const controlAbbr = D.controlAbbr(cp);
    if (controlAbbr) b.classList.add('control');
    else if (D.isBlankGlyph(cp)) b.classList.add('blank');
    b.dataset.cp = cp;
    b.dataset.group = D.groupForMode(mode, cp) || '';
    const glyph = controlAbbr || escapeHtml(D.glyphFor(cp));
    b.innerHTML =
      `<span class="glyph">${glyph}</span>` +
      `<span class="cp">U+${D.hex(cp)}</span>`;
    return b;
  }

  cellCp(target) {
    const btn = target.closest('.cell[data-cp]');
    return btn ? Number(btn.dataset.cp) : null;
  }

  menuItems(cp, x, y) {
    const label = this.fav.activeLabel || 'マイリスト';
    return [
      { label: 'マイリストへ追加…', onClick: () => this.onAddMenu && this.onAddMenu(cp, x, y) },
      {
        label: this.fav.has(cp) ? `${label}から外す` : `${label}に追加`,
        onClick: () => this.fav.toggle(cp),
      },
      { label: '詳細を表示', onClick: () => this.onDetail(cp) },
    ];
  }

  bindPointer() {
    let timer = null, suppress = false, downXY = null;
    const clearTimer = () => { clearTimeout(timer); timer = null; };

    this.rowsEl.addEventListener('pointerdown', (e) => {
      const cp = this.cellCp(e.target);
      if (cp == null) return;
      suppress = false;
      downXY = { x: e.clientX, y: e.clientY };
      if (e.pointerType !== 'mouse') {
        clearTimer();
        timer = setTimeout(() => {
          suppress = true;
          openMenu(downXY.x, downXY.y, this.menuItems(cp, downXY.x, downXY.y));
        }, 450);
      }
    });

    this.rowsEl.addEventListener('pointermove', (e) => {
      if (timer && downXY && Math.hypot(e.clientX - downXY.x, e.clientY - downXY.y) > 10)
        clearTimer();
    });

    this.rowsEl.addEventListener('pointerup', clearTimer);
    this.rowsEl.addEventListener('pointercancel', () => { clearTimer(); suppress = true; });

    this.rowsEl.addEventListener('click', (e) => {
      const cp = this.cellCp(e.target);
      if (cp == null) return;
      if (suppress) { suppress = false; return; }
      this.onInsert(cp);
    });

    this.rowsEl.addEventListener('contextmenu', (e) => {
      const cp = this.cellCp(e.target);
      if (cp == null) return;
      e.preventDefault();
      openMenu(e.clientX, e.clientY, this.menuItems(cp, e.clientX, e.clientY));
    });
  }

  scrollToCp(cp, flash) {
    const row = D.cpToRow(cp);
    if (row == null) return;
    // put the target row at the top so the block header reflects it
    this.scroll.scrollTop = row * this.rowH;
    this.render(true);
    if (flash) this.flashCp(cp);
  }

  flashCp(cp) {
    const el = this.rowsEl.querySelector(`.cell[data-cp="${cp}"]`);
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth; // restart the animation
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1300);
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

window.App.Grid = { Grid };

})();
