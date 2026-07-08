// Character detail modal with prev/next navigation, insert, and mylist toggle.

(function () {

const D = window.App.Data;
const UrlState = window.App.UrlState;

function cpFromHash() {
  const raw = UrlState.get('cp');
  if (!raw) return null;
  const cp = parseInt(raw, 16);
  return Number.isFinite(cp) ? cp : null;
}

function setHash(cp) {
  UrlState.set('cp', cp == null ? null : cp.toString(16).toUpperCase());
}

class DetailModal {
  constructor(root, { onInsert, onReveal, onAddMenu, onCopyDone, mylists }) {
    this.root = root;
    this.onInsert = onInsert;
    this.onReveal = onReveal;
    this.onAddMenu = onAddMenu;
    this.onCopyDone = onCopyDone;
    this.fav = mylists;
    this.cp = null;

    root.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-box" role="dialog" aria-modal="true" aria-label="文字の詳細">
        <button type="button" class="modal-close" aria-label="閉じる">✕</button>
        <div class="modal-nav">
          <button type="button" class="nav-prev" aria-label="前の文字">‹</button>
          <div class="modal-glyph"></div>
          <button type="button" class="nav-next" aria-label="次の文字">›</button>
        </div>
        <div class="modal-name"></div>
        <dl class="modal-info"></dl>
        <div class="modal-actions">
          <button type="button" class="btn reveal-btn">符号表で表示</button>
          <button type="button" class="btn insert-btn">＋ 入力</button>
          <button type="button" class="btn copy-btn">⧉ コピー</button>
          <button type="button" class="btn fav-btn"></button>
          <button type="button" class="btn add-btn">他のマイリストへ追加</button>
        </div>
      </div>`;

    this.glyphEl = root.querySelector('.modal-glyph');
    this.nameEl = root.querySelector('.modal-name');
    this.infoEl = root.querySelector('.modal-info');
    this.copyBtn = root.querySelector('.copy-btn');
    this.addBtn = root.querySelector('.add-btn');
    this.revealBtn = root.querySelector('.reveal-btn');
    this.favBtn = root.querySelector('.fav-btn');

    root.querySelector('.modal-close').addEventListener('click', () => this.close());
    root.querySelector('.modal-backdrop').addEventListener('click', () => this.close());
    root.querySelector('.nav-prev').addEventListener('click', () => this.step(-1));
    root.querySelector('.nav-next').addEventListener('click', () => this.step(1));
    root.querySelector('.insert-btn').addEventListener('click', () => this.onInsert(this.cp));
    this.copyBtn.addEventListener('click', () => this.copy());
    this.addBtn.addEventListener('click', () => {
      if (this.cp == null || !this.onAddMenu) return;
      const rect = this.addBtn.getBoundingClientRect();
      this.onAddMenu(this.cp, rect);
    });
    this.revealBtn.addEventListener('click', () => { if (this.cp != null && this.onReveal) this.onReveal(this.cp); });
    this.favBtn.addEventListener('click', () => { this.fav.toggle(this.cp); this.updateFav(); });

    document.addEventListener('keydown', (e) => {
      if (this.root.hidden) return;
      if (e.key === 'Escape') this.close();
      else if (e.key === 'ArrowLeft') this.step(-1);
      else if (e.key === 'ArrowRight') this.step(1);
    });
    this.fav.subscribe(() => { if (!this.root.hidden) this.updateFav(); });

    window.addEventListener('hashchange', () => {
      const cp = cpFromHash();
      if (cp != null && D.inScope(cp) && cp !== this.cp) this.open(cp, false);
      else if (cp == null && !this.root.hidden) this.close(false);
    });
    const initial = cpFromHash();
    if (initial != null && D.inScope(initial)) this.open(initial, false);
  }

  async open(cp, updateUrl = true) {
    this.cp = cp;
    this.root.hidden = false;
    this.render();
    this.nameEl.textContent = '読み込み中…';
    if (updateUrl) setHash(cp);
    const name = await D.getName(cp);
    if (this.cp !== cp) return;
    this.nameEl.textContent = name || '(名称なし)';
    // descriptions.js is prefetched in the background at startup, so this is
    // usually already resolved; re-render only covers the rare case where the
    // modal is opened (e.g. via a #cp= link) before that prefetch finishes.
    if (!D.descriptionSync(cp)) {
      await D.ensureDescriptions();
      if (this.cp === cp) this.render();
    }
  }

  close(updateUrl = true) {
    this.root.hidden = true;
    if (updateUrl) setHash(null);
  }

  async copy() {
    if (this.cp == null) return;
    const text = String.fromCodePoint(this.cp);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove();
    }
    if (this.onCopyDone) this.onCopyDone();
  }

  step(dir) {
    const n = D.neighborInsertable(this.cp, dir);
    if (n != null) this.open(n);
  }

  updateFav() {
    const on = this.fav.has(this.cp);
    const label = this.fav.activeLabel || 'マイリスト';
    this.favBtn.textContent = on ? `${label}から外す` : `${label}に追加`;
    this.favBtn.classList.toggle('on', on);
  }

  render() {
    const cp = this.cp;
    const controlAbbr = D.controlAbbr(cp);
    this.glyphEl.textContent = controlAbbr || D.glyphFor(cp);
    this.glyphEl.classList.toggle('control', !!controlAbbr);
    const cat = D.categoryOf(cp);
    const block = D.blockOf(cp);
    const blockText = block
      ? (D.blockLabel(block.n).ja ? `${D.blockLabel(block.n).ja}（${block.n}）` : block.n)
      : '未割り当て（No Block）';
    const plane = D.planeOf(cp);
    const { ja: planeJa, en: planeEn } = D.planeInfo(plane);
    const planeText = `第${plane}面（Plane ${plane}）：${planeJa}（${planeEn}）`;

    const group = D.groupOf(cp);
    const { ja: groupJa, en: groupEn } = D.groupLabel(group);
    const groupText = `<span class="swatch" data-group="${group}"></span>${groupJa} <span class="legend-en">${groupEn}</span>`;

    const era = D.eraOf(cp);
    const age = D.ageOf(cp);
    const { ja: eraJa, en: eraEn } = D.eraLabel(era);
    const eraText = `<span class="swatch" data-group="${era}"></span>${eraJa} <span class="legend-en">${eraEn}${age ? ` ・ Unicode ${age}` : ''}</span>`;

    const desc = D.descriptionSync(cp);
    const jsHex = cp.toString(16).toUpperCase();

    const rows = [
      ['コードポイント', `U+${D.hex(cp)}`],
      ['10進', String(cp)],
      ['ブロック / 面', `${blockText}<br><span class="legend-en">${planeText}</span>`],
      ['分類', `${cat} — ${D.categoryDesc(cat)}`],
      ['文字の種類', groupText],
      ['追加時期', eraText],
      desc ? ['説明', desc] : null,
      ['UTF-8', D.utf8Bytes(cp).join(' ')],
      ['UTF-16', D.utf16Units(cp).join(' ')],
      ['HTML', `&amp;#${cp}; &nbsp; &amp;#x${D.hex(cp)};`],
      ['JavaScript', `0x${jsHex} ・ '\\u{${jsHex}}'`],
    ].filter(Boolean);
    this.infoEl.innerHTML = rows
      .map(([k, v]) => `<div class="info-row"><dt>${k}</dt><dd>${v}</dd></div>`)
      .join('');
    this.updateFav();
  }
}

window.App.Modal = { DetailModal };

})();
