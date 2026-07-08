(function () {

const D = window.App.Data;
const { MyLists } = window.App.MyLists;
const { History } = window.App.History;
const { OutputArea } = window.App.Output;
const { Grid } = window.App.Grid;
const { BlockHeader, Legend } = window.App.Blocks;
const { DetailModal } = window.App.Modal;
const { openMenu } = window.App.Menu;
const { ColorMode } = window.App.ColorMode;
const UrlState = window.App.UrlState;

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
  const mylists = new MyLists();
  const history = new History();
  const colorMode = new ColorMode();
  const currentBoard = $('#current-board');
  let revealInAll = null;

  function drawCurrent(text) {
    renderCharBoard(currentBoard, distinctCodepoints(text), mylists, colorMode,
      '出力欄に文字を入力すると、ここに使われている文字が表示されます。');
  }

  // ---- output area -------------------------------------------------------
  const output = new OutputArea($('#output'), {
    countEl: $('#count'),
    onCopyDone: () => showToast('コピーしました'),
    onPasteFail: () => showToast('クリップボードを読み取れませんでした（Cmd/Ctrl+V で貼付けてください）'),
    onChange: drawCurrent,
  });

  // Every app-driven insertion records the character into history.
  const insert = (cp) => { output.insert(String.fromCodePoint(cp)); history.record(cp); };

  $('#copy-btn').addEventListener('click', () => output.copy());
  $('#paste-btn').addEventListener('click', () => output.paste());
  $('#caret-left-btn').addEventListener('click', () => output.moveCaret(-1));
  $('#caret-right-btn').addEventListener('click', () => output.moveCaret(1));
  $('#del-btn').addEventListener('click', () => output.deleteBackward());
  $('#clear-btn').addEventListener('click', () => output.clearAll());
  $('#undo-btn').addEventListener('click', () => output.undo());
  $('#redo-btn').addEventListener('click', () => output.redo());

  // ---- modal, block header, grid ----------------------------------------
  // Shared legend + color-mode toggle (embeds "なし/種類/追加時期" buttons),
  // shown above all four tabs; the block picker popup has its own instance.
  new Legend($('#attr-legend'), colorMode);

  const modal = new DetailModal($('#modal'), {
    onInsert: insert,
    onReveal: (cp) => revealInAll && revealInAll(cp),
    onAddMenu: (cp, rect) => openMyListMenu(cp, rect.left + rect.width / 2, rect.bottom + 8),
    onCopyDone: () => showToast('コピーしました'),
    mylists,
  });
  const header = new BlockHeader($('#block-header'), {
    onJump: (cp, flash) => grid.scrollToCp(cp, flash),
    colorMode,
  });
  const grid = new Grid($('#grid'), {
    onInsert: insert,
    onDetail: (cp) => modal.open(cp),
    onAddMenu: (cp, x, y) => openMyListMenu(cp, x, y),
    onReveal: (cp, flash) => revealInAll && revealInAll(cp, flash),
    mylists,
    colorMode,
    onTopCpChange: (cp) => header.setTopCp(cp),
  });

  // ---- color-coding mode (none / category / age) -------------------------
  colorMode.subscribe(() => {
    drawFav();
    drawHist();
    drawCurrent(output.ta.value);
  });

  // ---- mylist & history keyboards ---------------------------------------
  const favPanel = $('#panel-fav');
  favPanel.innerHTML = `
    <div class="mylist-toolbar">
      <label class="mylist-picker">
        <span class="mylist-label">マイリスト</span>
        <select id="mylist-select" class="mylist-select"></select>
      </label>
      <div class="mylist-actions">
        <button type="button" id="mylist-add" class="btn small">＋ 作成</button>
        <button type="button" id="mylist-rename" class="btn small">名前変更</button>
        <button type="button" id="mylist-delete" class="btn small danger">削除</button>
      </div>
    </div>
    <div class="mylist-status">
      <span id="mylist-status"></span>
    </div>
    <div id="fav-board" class="fav-board"></div>`;

  const favBoard = $('#fav-board');
  const mylistSelect = $('#mylist-select');
  const mylistAddBtn = $('#mylist-add');
  const mylistRenameBtn = $('#mylist-rename');
  const mylistDeleteBtn = $('#mylist-delete');
  const mylistStatus = $('#mylist-status');
  const histBoard = $('#history-board');

  function renderMyListControls() {
    mylistSelect.innerHTML = mylists.lists.map((list) => {
      const count = list.items.length;
      const label = `${list.icon} ${list.name}`;
      return `<option value="${list.id}">${escapeHtml(label)}</option>`;
    }).join('');
    mylistSelect.value = mylists.activeId;
    const active = mylists.activeList;
    mylistStatus.textContent = `${active.icon} ${active.name} ・ ${active.items.length} 件`;
    mylistDeleteBtn.disabled = !mylists.canDeleteActive();
    mylistDeleteBtn.title = mylists.canDeleteActive() ? `${active.name} を削除` : 'お気に入りは削除できません';
    mylistRenameBtn.disabled = active.builtIn;
    mylistRenameBtn.title = active.builtIn ? 'お気に入りは名前を変更できません' : `${active.name} の名前を変更`;
  }

  const drawFav = () => renderCharBoard(favBoard, mylists.activeList.items, mylists, colorMode,
    `${mylists.activeLabel} はまだありません。<br>文字を右クリック（または長押し）して「${mylists.activeLabel}に追加」してください。`);
  const drawHist = () => renderCharBoard(histBoard, history.list, mylists, colorMode,
    '入力履歴はまだありません。<br>文字を入力すると、ここに新しい順で表示されます。');

  // mylist changes affect the badge on all three boards
  mylists.subscribe(() => { renderMyListControls(); drawFav(); drawHist(); drawCurrent(output.ta.value); });
  history.subscribe(drawHist);
  mylistSelect.addEventListener('change', () => { mylists.setActive(mylistSelect.value); });
  mylistAddBtn.addEventListener('click', () => {
    const suggested = mylists.lists.some((list) => list.name === 'マイリスト 2')
      ? `マイリスト ${mylists.lists.length}`
      : 'マイリスト 2';
    const name = window.prompt('新しいマイリスト名を入力してください', suggested);
    if (!name) return;
    mylists.createList(name);
  });
  mylistRenameBtn.addEventListener('click', () => {
    const active = mylists.activeList;
    if (!active || active.builtIn) return;
    const name = window.prompt('新しい名前を入力してください', active.name);
    if (!name) return;
    mylists.renameList(active.id, name);
  });
  mylistDeleteBtn.addEventListener('click', () => {
    const active = mylists.activeList;
    if (!active || !mylists.canDeleteActive()) return;
    if (!window.confirm(`「${active.name}」を削除しますか？`)) return;
    mylists.removeList(active.id);
  });
  drawFav();
  drawHist();
  renderMyListControls();

  bindCharBoard(currentBoard, insert, (cp, x, y) => [
    { label: '詳細を表示', onClick: () => modal.open(cp) },
    { label: 'マイリストへ追加…', onClick: () => openMyListMenu(cp, x, y) },
  ]);
  bindCharBoard(favBoard, insert, (cp) => [
    { label: '詳細を表示', onClick: () => modal.open(cp) },
    { label: '← 前へ移動', onClick: () => mylists.move(cp, -1) },
    { label: '次へ移動 →', onClick: () => mylists.move(cp, 1) },
    { label: `${mylists.activeList.icon} ${mylists.activeList.name}から外す`, onClick: () => mylists.remove(cp) },
  ]);
  bindCharBoard(histBoard, insert, (cp, x, y) => [
    { label: '詳細を表示', onClick: () => modal.open(cp) },
    { label: 'マイリストへ追加…', onClick: () => openMyListMenu(cp, x, y) },
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
  let currentMode = 'all';
  const setMode = (mode, updateUrl = true) => {
    if (!panels[mode]) return;
    currentMode = mode;
    tabs.forEach((x) => x.classList.toggle('active', x.dataset.mode === mode));
    for (const key in panels) panels[key].hidden = mode !== key;
    if (mode === 'all') grid.refreshLayout(true);
    if (updateUrl) UrlState.set('mode', mode);
  };
  tabs.forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));
  window.addEventListener('hashchange', () => {
    const mode = UrlState.get('mode');
    if (mode && mode !== currentMode && panels[mode]) setMode(mode, false);
  });
  setMode(UrlState.get('mode') || 'all');
  revealInAll = (cp, flash = true) => {
    setMode('all');
    modal.close();
    grid.scrollToCp(cp, flash);
  };

  function openMyListMenu(cp, x, y) {
    const items = [];
    for (const list of mylists.lists) {
      const label = mylists.hasIn(list.id, cp)
        ? `${list.icon} ${list.name} から外す`
        : `${list.icon} ${list.name} に追加`;
      items.push({ label, onClick: () => mylists.toggleIn(list.id, cp) });
    }
    openMenu(x, y, items);
  }

  // start names/descriptions prefetch in the background (non-blocking) for snappy modals
  D.ensureNames();
  D.ensureDescriptions();
  $('#loading').remove();

  // debug handle (harmless in production; used by tests)
  window.__app = { output, mylists, history, grid, header, modal, insert, drawCurrent };
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
  const FONTS = ['system', 'noto', 'extended'];
  const opts = document.querySelectorAll('.font-opt');
  const cur = () => FONTS.includes(document.documentElement.dataset.font) ? document.documentElement.dataset.font : 'system';
  const apply = (font) => {
    document.documentElement.dataset.font = font;
    try { localStorage.setItem(KEY, font); } catch { /* ignore */ }
    opts.forEach((o) => o.classList.toggle('active', o.dataset.font === font));
  };
  opts.forEach((o) => o.addEventListener('click', () => apply(o.dataset.font)));
  apply(cur());
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

// Render a list of codepoints as a clickable keyboard (mylist / history).
function renderCharBoard(el, list, mylists, colorMode, emptyHtml) {
  if (!list.length) {
    el.innerHTML = `<p class="fav-empty">${emptyHtml}</p>`;
    return;
  }
  const mode = colorMode.get();
  const wrap = document.createElement('div');
  wrap.className = 'fav-grid';
  for (const cp of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cell' + (mylists.has(cp) ? ' fav' : '');
    b.dataset.cp = cp;
    b.dataset.group = D.groupForMode(mode, cp) || '';
    b.dataset.badge = mylists.activeList.icon;
    b.style.setProperty('--list-badge-color', mylists.activeList.icon === '★' ? 'var(--fav)' : 'var(--accent)');
    const controlAbbr = D.controlAbbr(cp);
    if (controlAbbr) b.classList.add('control');
    b.innerHTML = `<span class="glyph">${controlAbbr || escapeHtml(D.glyphFor(cp))}</span><span class="cp">U+${D.hex(cp)}</span>`;
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
      timer = setTimeout(() => { suppress = true; openMenu(xy.x, xy.y, menuItems(cp, xy.x, xy.y)); }, 450);
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
    openMenu(e.clientX, e.clientY, menuItems(cp, e.clientX, e.clientY));
  });
}

main().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<p style="padding:2rem;color:#f88">読み込みに失敗しました: ${err.message}</p>`;
});

})();
