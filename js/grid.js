// Virtualized 16-column Unicode grid with tap-to-insert and long-press / right-click menu.

(function () {

const D = window.App.Data;
const { openMenu } = window.App.Menu;

const BUFFER = 6; // extra rows above/below viewport

class Grid {
  constructor(root, { onInsert, onDetail, favorites, onTopCpChange }) {
    this.root = root;
    this.onInsert = onInsert;
    this.onDetail = onDetail;
    this.fav = favorites;
    this.onTopCpChange = onTopCpChange;

    root.innerHTML = `
      <div class="col-header" role="row">
        <div class="gutter"></div>
        ${Array.from({ length: D.COLS }, (_, i) =>
          `<div class="colh">${i.toString(16).toUpperCase()}</div>`).join('')}
      </div>
      <div class="grid-scroll" tabindex="0">
        <div class="grid-sizer" style="height:${D.totalRows * D.ROW_H}px"></div>
        <div class="grid-rows"></div>
      </div>`;

    this.scroll = root.querySelector('.grid-scroll');
    this.rowsEl = root.querySelector('.grid-rows');
    this.lastStart = -1;
    this.lastTopCp = -1;

    this.scroll.addEventListener('scroll', () => this.onScroll());
    this.bindPointer();
    this.fav.subscribe(() => this.rerender());
    window.addEventListener('resize', () => this.render(true));
    this.render(true);
  }

  onScroll() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.render(); });
  }

  visibleRowCount() {
    return Math.ceil(this.scroll.clientHeight / D.ROW_H);
  }

  render(force) {
    const start = Math.max(0, Math.floor(this.scroll.scrollTop / D.ROW_H) - BUFFER);
    const end = Math.min(D.totalRows, start + this.visibleRowCount() + BUFFER * 2);

    // notify block header of the top-most fully-scoped codepoint
    const topRow = Math.floor(this.scroll.scrollTop / D.ROW_H);
    const topCp = D.rowToBaseCp(Math.min(topRow, D.totalRows - 1));
    if (topCp !== this.lastTopCp) {
      this.lastTopCp = topCp;
      if (this.onTopCpChange) this.onTopCpChange(topCp);
    }

    if (!force && start === this.lastStart) return;
    this.lastStart = start;

    const frag = document.createDocumentFragment();
    for (let row = start; row < end; row++) frag.appendChild(this.buildRow(row));
    this.rowsEl.replaceChildren(frag);
    this.rowsEl.style.transform = `translateY(${start * D.ROW_H}px)`;
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
    if (D.isEmptyCell(cp)) {
      const d = document.createElement('div');
      d.className = 'cell empty';
      d.dataset.group = D.groupOf(cp); // unassigned / surrogate / control
      return d;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cell';
    if (this.fav.has(cp)) b.classList.add('fav');
    if (D.isBlankGlyph(cp)) b.classList.add('blank');
    b.dataset.cp = cp;
    b.dataset.group = D.groupOf(cp);
    b.innerHTML =
      `<span class="glyph">${escapeHtml(D.glyphFor(cp))}</span>` +
      `<span class="cp">${D.hex(cp)}</span>`;
    return b;
  }

  cellCp(target) {
    const btn = target.closest('.cell[data-cp]');
    return btn ? Number(btn.dataset.cp) : null;
  }

  menuItems(cp) {
    return [
      {
        label: this.fav.has(cp) ? '★ お気に入り解除' : '☆ お気に入り登録',
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
          openMenu(downXY.x, downXY.y, this.menuItems(cp));
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
      openMenu(e.clientX, e.clientY, this.menuItems(cp));
    });
  }

  scrollToCp(cp, flash) {
    const row = D.cpToRow(cp);
    if (row == null) return;
    // put the target row at the top so the block header reflects it
    this.scroll.scrollTop = row * D.ROW_H;
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
