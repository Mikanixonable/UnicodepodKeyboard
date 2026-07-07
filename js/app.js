(function () {

const D = window.App.Data;
const { Favorites } = window.App.Favorites;
const { OutputArea } = window.App.Output;
const { Grid } = window.App.Grid;
const { BlockHeader } = window.App.Blocks;
const { DetailModal } = window.App.Modal;
const { openMenu } = window.App.Menu;

async function main() {
  await D.loadCore();

  const $ = (s) => document.querySelector(s);

  // ---- output area -------------------------------------------------------
  const toast = $('#toast');
  let toastTimer;
  const output = new OutputArea($('#output'), {
    countEl: $('#count'),
    onCopyDone: () => {
      toast.textContent = 'コピーしました';
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('show'), 1500);
    },
  });

  const insert = (cp) => output.insert(String.fromCodePoint(cp));

  $('#copy-btn').addEventListener('click', () => output.copy());
  $('#del-btn').addEventListener('click', () => output.deleteBackward());
  $('#clear-btn').addEventListener('click', () => output.clearAll());
  $('#undo-btn').addEventListener('click', () => output.undo());
  $('#redo-btn').addEventListener('click', () => output.redo());

  // ---- favorites + modal -------------------------------------------------
  const favorites = new Favorites();
  const modal = new DetailModal($('#modal'), { onInsert: insert, favorites });

  // ---- block header + grid ----------------------------------------------
  const header = new BlockHeader($('#block-header'), {
    onJump: (cp) => grid.scrollToCp(cp),
  });
  const grid = new Grid($('#grid'), {
    onInsert: insert,
    onDetail: (cp) => modal.open(cp),
    favorites,
    onTopCpChange: (cp) => header.setTopCp(cp),
  });

  // ---- favorites keyboard ------------------------------------------------
  const favBoard = $('#fav-board');
  function renderFav(list) {
    if (!list.length) {
      favBoard.innerHTML =
        `<p class="fav-empty">お気に入りはまだありません。<br>` +
        `文字を右クリック（または長押し）して「お気に入り登録」してください。</p>`;
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'fav-grid';
    for (const cp of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cell fav';
      b.dataset.cp = cp;
      b.innerHTML = `<span class="glyph">${D.glyphFor(cp)}</span><span class="cp">${D.hex(cp)}</span>`;
      wrap.appendChild(b);
    }
    favBoard.replaceChildren(wrap);
  }
  favorites.subscribe(renderFav);
  renderFav(favorites.list);

  // favorites keyboard interactions (click = insert, menu = manage)
  bindFavBoard(favBoard, { favorites, modal, insert });

  // ---- mode toggle -------------------------------------------------------
  const tabs = document.querySelectorAll('.mode-tab');
  const panels = { all: $('#panel-all'), fav: $('#panel-fav') };
  tabs.forEach((t) => t.addEventListener('click', () => {
    tabs.forEach((x) => x.classList.toggle('active', x === t));
    const mode = t.dataset.mode;
    panels.all.hidden = mode !== 'all';
    panels.fav.hidden = mode !== 'fav';
  }));

  // start names prefetch in the background (non-blocking) for snappy modals
  D.ensureNames();
  $('#loading').remove();

  // debug handle (harmless in production; used by tests)
  window.__app = { output, favorites, grid, header, modal, insert };
}

function bindFavBoard(root, { favorites, modal, insert }) {
  let timer = null, suppress = false, xy = null;
  const cpOf = (t) => { const b = t.closest('.cell[data-cp]'); return b ? Number(b.dataset.cp) : null; };
  const items = (cp) => [
    { label: '詳細を表示', onClick: () => modal.open(cp) },
    { label: '← 前へ移動', onClick: () => favorites.move(cp, -1) },
    { label: '次へ移動 →', onClick: () => favorites.move(cp, 1) },
    { label: '★ お気に入り解除', onClick: () => favorites.remove(cp) },
  ];

  root.addEventListener('pointerdown', (e) => {
    const cp = cpOf(e.target); if (cp == null) return;
    suppress = false; xy = { x: e.clientX, y: e.clientY };
    if (e.pointerType !== 'mouse') {
      clearTimeout(timer);
      timer = setTimeout(() => { suppress = true; openMenu(xy.x, xy.y, items(cp)); }, 450);
    }
  });
  root.addEventListener('pointermove', (e) => {
    if (timer && xy && Math.hypot(e.clientX - xy.x, e.clientY - xy.y) > 10) clearTimeout(timer);
  });
  root.addEventListener('pointerup', () => clearTimeout(timer));
  root.addEventListener('click', (e) => {
    const cp = cpOf(e.target); if (cp == null) return;
    if (suppress) { suppress = false; return; }
    insert(cp);
  });
  root.addEventListener('contextmenu', (e) => {
    const cp = cpOf(e.target); if (cp == null) return;
    e.preventDefault();
    openMenu(e.clientX, e.clientY, items(cp));
  });
}

main().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<p style="padding:2rem;color:#f88">読み込みに失敗しました: ${err.message}</p>`;
});

})();
