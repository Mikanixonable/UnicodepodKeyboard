// Virtualized 16-column Unicode grid with tap-to-insert and long-press / right-click menu.

(function () {

const D = window.App.Data;
const { openMenu } = window.App.Menu;

const BUFFER = 6; // extra rows above/below viewport
const SCROLL_KEY = 'unicode-app:scroll-cp:v1';
const LONG_PRESS_MS = 450;
const FLASH_MS = 1300;

class Grid {
  constructor(root, { onInsert, onDetail, onAddMenu, onReveal, mylists, colorMode, favHighlight, onTopCpChange }) {
    this.root = root;
    this.onInsert = onInsert;
    this.onDetail = onDetail;
    this.onAddMenu = onAddMenu;
    this.onReveal = onReveal;
    this.fav = mylists;
    this.colorMode = colorMode;
    this.favHighlight = favHighlight;
    this.onTopCpChange = onTopCpChange;
    this.rowH = D.ROW_H;
    this.cols = D.COLS;
    this.mobile = window.matchMedia('(max-width: 768px)').matches;

    root.innerHTML = `
      <div class="col-header" role="row"></div>
      <div class="grid-scroll" tabindex="0">
        <div class="grid-sizer" style="height:${D.totalRows * D.ROW_H}px"></div>
        <div class="grid-rows"></div>
      </div>`;

    this.colHeaderEl = root.querySelector('.col-header');
    this.scroll = root.querySelector('.grid-scroll');
    this.rowsEl = root.querySelector('.grid-rows');
    this.sizerEl = root.querySelector('.grid-sizer');
    this.buildColHeader();
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

  // (Re)builds the column-index header row. Desktop keeps the row-address
  // gutter + one hex-digit column per cell (0-F, grid-aligned to the data
  // columns below). Mobile drops it entirely -- there's no row-address
  // gutter to label there either, and each cell already shows its own full
  // "U+XXXX" text, so a column-position legend has nothing left to add.
  buildColHeader() {
    if (this.mobile) {
      this.colHeaderEl.innerHTML = '';
      this.headerGutterEl = null;
    } else {
      this.colHeaderEl.innerHTML =
        `<div class="gutter">U+0x</div>` +
        Array.from({ length: D.COLS }, (_, i) => `<div class="colh">${i.toString(16).toUpperCase()}</div>`).join('');
      this.headerGutterEl = this.colHeaderEl.querySelector('.gutter');
    }
  }

  refreshLayout(forceRender = false) {
    const currentWidth = this.scroll.clientWidth;
    if (currentWidth <= 0) return;

    // Mobile shows 8 codepoints per row instead of 16, and drops the
    // row-address gutter entirely (each cell shows its own full "U+XXXX", so
    // it's redundant there -- see buildRow()/buildColHeader()). Switching
    // rebuilds the whole row model (D.setCols), so preserve/restore the
    // current top codepoint across the change instead of just re-rendering
    // at the same pixel scrollTop.
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const nextCols = isMobile ? 8 : 16;
    if (nextCols !== this.cols || isMobile !== this.mobile) {
      const topCp = this.lastTopCp >= 0 ? this.lastTopCp : null;
      this.cols = nextCols;
      this.mobile = isMobile;
      D.setCols(nextCols);
      this.buildColHeader();
      this.sizerEl.style.height = `${D.totalRows * this.rowH}px`;
      if (topCp != null) this.scrollToCp(topCp, false);
    }

    // Desktop centers the colored columns (gutter : cells : spacer = 1 :
    // COLS : 1), subtracting the row-address gutter's width twice: once for
    // the left label column, once for the matching blank spacer on the
    // right (see .col-header / .grid-row grid-template-columns). Mobile has
    // no gutter column at all (dropped above), so the cells simply fill the
    // full width.
    const gutterWidth = this.mobile ? 0 : this.headerGutterEl.getBoundingClientRect().width;
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
    // Mobile has no row-address gutter at all (each cell shows its own full
    // "U+XXXX", making it redundant -- see buildColHeader()). Desktop keeps
    // it, but the "U+XXx" + trailing-hex-digit combo only lines up when a
    // row spans exactly one hex digit (16 cols); it's only ever 16 there
    // (mobile is the only other case, and that has no gutter to build).
    if (!this.mobile) {
      const gutterLabel = `U+${(base >> 4).toString(16).toUpperCase()}<span class="x">x</span>`;
      el.innerHTML = `<div class="gutter">${gutterLabel}</div>`;
    }

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
    if (this.favHighlight.get() && this.fav.has(cp)) b.classList.add('fav');
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
    // No "符号表" entry here -- this menu is the 符号表 grid's own
    // right-click menu, so jumping to itself would be redundant.
    return [
      { label: '詳細を表示', onClick: () => this.onDetail(cp) },
      { label: 'マイリストへ追加…', onClick: () => this.onAddMenu && this.onAddMenu(cp, x, y) },
      {
        label: this.fav.has(cp) ? `${label}から外す` : `${label}に追加`,
        onClick: () => this.fav.toggle(cp),
      },
    ];
  }

  bindPointer() {
    let timer = null, suppress = false, downXY = null, pressedEl = null;
    const clearTimer = () => { clearTimeout(timer); timer = null; };
    // Explicit tap-feedback instead of relying on CSS :active (see the
    // .cell.pressed comment in styles.css): the grid rebuilds its cells on
    // every scroll frame, and touch browsers track :active by screen
    // position rather than element identity, so a scroll can leave a
    // *different* cell than the one actually tapped looking highlighted.
    // Always clearing this explicitly (up/cancel/leave/scroll) avoids that.
    const clearPressed = () => {
      if (pressedEl) { pressedEl.classList.remove('pressed'); pressedEl = null; }
    };

    this.rowsEl.addEventListener('pointerdown', (e) => {
      const cp = this.cellCp(e.target);
      if (cp == null) return;
      suppress = false;
      downXY = { x: e.clientX, y: e.clientY };
      if (e.pointerType !== 'mouse') {
        clearPressed();
        pressedEl = e.target.closest('.cell[data-cp]');
        if (pressedEl) pressedEl.classList.add('pressed');
        clearTimer();
        timer = setTimeout(() => {
          suppress = true;
          openMenu(downXY.x, downXY.y, this.menuItems(cp, downXY.x, downXY.y));
        }, LONG_PRESS_MS);
      }
    });

    this.rowsEl.addEventListener('pointermove', (e) => {
      if (downXY && Math.hypot(e.clientX - downXY.x, e.clientY - downXY.y) > 10) {
        clearTimer();
        // A drag this size means the touch turned into a scroll, not a tap
        // -- clear the pressed feedback right away instead of waiting for a
        // 'scroll' event, which only fires once scrollTop has actually
        // changed (a few pixels of initial finger movement otherwise leaves
        // the original cell looking pressed while already dragging).
        clearPressed();
      }
    });

    this.rowsEl.addEventListener('pointerup', () => { clearTimer(); clearPressed(); });
    this.rowsEl.addEventListener('pointercancel', () => { clearTimer(); clearPressed(); suppress = true; });
    this.rowsEl.addEventListener('pointerleave', clearPressed);
    this.scroll.addEventListener('scroll', clearPressed, { passive: true });

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
    setTimeout(() => el.classList.remove('flash'), FLASH_MS);
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

window.App.Grid = { Grid };

})();
