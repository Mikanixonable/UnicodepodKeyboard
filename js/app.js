(function () {

const D = window.App.Data;
const { Favorites } = window.App.Favorites;
const { History } = window.App.History;
const { OutputArea } = window.App.Output;
const { Grid } = window.App.Grid;
const { BlockHeader } = window.App.Blocks;
const { DetailModal } = window.App.Modal;
const { openMenu } = window.App.Menu;

async function main() {
  await D.loadCore();

  const $ = (s) => document.querySelector(s);

  // ---- toast -------------------------------------------------------------
  const toastEl = $('#toast');
  let toastTimer;
  const showToast = (msg) => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  };

  // ---- stores --------------------------------------------------------
  // Created before OutputArea: its onChange fires synchronously during
  // construction (initial updateCount() call), so anything it touches
  // must already exist.
  const favorites = new Favorites();
  const history = new History();
  const currentBoard = $('#current-board');

  function drawCurrent(text) {
    renderCharBoard(currentBoard, distinctCodepoints(text), favorites,
      '出力欄に文字を入力すると、ここに使われている文字が表示されます。');
  }

  // ---- output area -------------------------------------------------------
  const output = new OutputArea($('#output'), {
    countEl: $('#count'),
    onCopyDone: () => showToast('コピーしました'),
    onPasteFail: () => showToast('クリップボードを読み取れませんでした（Cmd/Ctrl+V で貼り付けてください）'),
    onChange: drawCurrent,
  });

  // Every app-driven insertion records the character into history.
  const insert = (cp) => { output.insert(String.fromCodePoint(cp)); history.record(cp); };

  $('#copy-btn').addEventListener('click', () => output.copy());
  $('#paste-btn').addEventListener('click', () => output.paste());
  $('#del-btn').addEventListener('click', () => output.deleteBackward());
  $('#clear-btn').addEventListener('click', () => output.clearAll());
  $('#undo-btn').addEventListener('click', () => output.undo());
  $('#redo-btn').addEventListener('click', () => output.redo());

  // ---- modal, block header, grid ----------------------------------------
  const modal = new DetailModal($('#modal'), { onInsert: insert, favorites });
  const header = new BlockHeader($('#block-header'), {
    onJump: (cp, flash) => grid.scrollToCp(cp, flash),
  });
  const grid = new Grid($('#grid'), {
    onInsert: insert,
    onDetail: (cp) => modal.open(cp),
    favorites,
    onTopCpChange: (cp) => header.setTopCp(cp),
  });

  // ---- favorites & history keyboards ------------------------------------
  const favBoard = $('#fav-board');
  const histBoard = $('#history-board');

  const drawFav = () => renderCharBoard(favBoard, favorites.list, favorites,
    'お気に入りはまだありません。<br>文字を右クリック（または長押し）して「お気に入り登録」してください。');
  const drawHist = () => renderCharBoard(histBoard, history.list, favorites,
    '入力履歴はまだありません。<br>文字を入力すると、ここに新しい順で表示されます。');

  // favorites changes affect the star badge on all three boards
  favorites.subscribe(() => { drawFav(); drawHist(); drawCurrent(output.ta.value); });
  history.subscribe(drawHist);
  drawFav();
  drawHist();

  bindCharBoard(currentBoard, insert, (cp) => [
    { label: '詳細を表示', onClick: () => modal.open(cp) },
    {
      label: favorites.has(cp) ? '★ お気に入り解除' : '☆ お気に入り登録',
      onClick: () => favorites.toggle(cp),
    },
  ]);
  bindCharBoard(favBoard, insert, (cp) => [
    { label: '詳細を表示', onClick: () => modal.open(cp) },
    { label: '← 前へ移動', onClick: () => favorites.move(cp, -1) },
    { label: '次へ移動 →', onClick: () => favorites.move(cp, 1) },
    { label: '★ お気に入り解除', onClick: () => favorites.remove(cp) },
  ]);
  bindCharBoard(histBoard, insert, (cp) => [
    { label: '詳細を表示', onClick: () => modal.open(cp) },
    {
      label: favorites.has(cp) ? '★ お気に入り解除' : '☆ お気に入り登録',
      onClick: () => favorites.toggle(cp),
    },
    { label: '履歴から削除', onClick: () => history.remove(cp) },
  ]);

  $('#clear-history').addEventListener('click', () => {
    if (history.list.length) history.clear();
  });

  // ---- font toggle (system glyphs vs installed Noto fonts) --------------
  setupFontToggle();

  // ---- mode toggle -------------------------------------------------------
  const tabs = document.querySelectorAll('.mode-tab');
  const panels = {
    all: $('#panel-all'), current: $('#panel-current'),
    history: $('#panel-history'), fav: $('#panel-fav'),
  };
  tabs.forEach((t) => t.addEventListener('click', () => {
    tabs.forEach((x) => x.classList.toggle('active', x === t));
    const mode = t.dataset.mode;
    for (const key in panels) panels[key].hidden = mode !== key;
  }));

  // start names prefetch in the background (non-blocking) for snappy modals
  D.ensureNames();
  $('#loading').remove();

  // debug handle (harmless in production; used by tests)
  window.__app = { output, favorites, history, grid, header, modal, insert, drawCurrent };
}

// Unique codepoints in a string, in order of first appearance.
function distinctCodepoints(str) {
  const seen = new Set();
  const list = [];
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (!seen.has(cp)) { seen.add(cp); list.push(cp); }
  }
  return list;
}

// Switch the glyph font between the system stack and installed Noto fonts.
function setupFontToggle() {
  const KEY = 'unicode-app:font:v1';
  const opts = document.querySelectorAll('.font-opt');
  const cur = () => document.documentElement.dataset.font === 'noto' ? 'noto' : 'system';
  const apply = (font) => {
    document.documentElement.dataset.font = font;
    try { localStorage.setItem(KEY, font); } catch { /* ignore */ }
    opts.forEach((o) => o.classList.toggle('active', o.dataset.font === font));
  };
  opts.forEach((o) => o.addEventListener('click', () => apply(o.dataset.font)));
  apply(cur());
}

// Render a list of codepoints as a clickable keyboard (favorites / history).
function renderCharBoard(el, list, favorites, emptyHtml) {
  if (!list.length) {
    el.innerHTML = `<p class="fav-empty">${emptyHtml}</p>`;
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'fav-grid';
  for (const cp of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cell' + (favorites.has(cp) ? ' fav' : '');
    b.dataset.cp = cp;
    b.innerHTML = `<span class="glyph">${D.glyphFor(cp)}</span><span class="cp">${D.hex(cp)}</span>`;
    wrap.appendChild(b);
  }
  el.replaceChildren(wrap);
}

// Wire tap-to-insert + long-press/right-click menu on a char keyboard.
function bindCharBoard(root, insert, menuItems) {
  let timer = null, suppress = false, xy = null;
  const cpOf = (t) => { const b = t.closest('.cell[data-cp]'); return b ? Number(b.dataset.cp) : null; };

  root.addEventListener('pointerdown', (e) => {
    const cp = cpOf(e.target); if (cp == null) return;
    suppress = false; xy = { x: e.clientX, y: e.clientY };
    if (e.pointerType !== 'mouse') {
      clearTimeout(timer);
      timer = setTimeout(() => { suppress = true; openMenu(xy.x, xy.y, menuItems(cp)); }, 450);
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
    openMenu(e.clientX, e.clientY, menuItems(cp));
  });
}

main().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<p style="padding:2rem;color:#f88">読み込みに失敗しました: ${err.message}</p>`;
});

})();
