(function () {

const D = window.App.Data;
const { MyLists } = window.App.MyLists;
const { History } = window.App.History;
const { OutputArea } = window.App.Output;
const { Grid } = window.App.Grid;
const { BlockHeader, Legend, BlockSidebar } = window.App.Blocks;
const { DetailModal } = window.App.Modal;
const { openMenu } = window.App.Menu;
const { ColorMode } = window.App.ColorMode;
const { BlockFavorites } = window.App.BlockFavorites;
const { UnicodeArt } = window.App.Art;
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
  const blockFavorites = new BlockFavorites();
  const art = new UnicodeArt();
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
  $('#caret-up-btn').addEventListener('click', () => output.moveCaretLine(-1));
  $('#caret-down-btn').addEventListener('click', () => output.moveCaretLine(1));
  $('#del-btn').addEventListener('click', () => output.deleteBackward());
  $('#clear-btn').addEventListener('click', () => output.clearAll());
  $('#undo-btn').addEventListener('click', () => output.undo());
  $('#redo-btn').addEventListener('click', () => output.redo());

  // Bulk add/remove: every distinct codepoint currently in the output area,
  // to/from whichever mylist the user picks from the popup menu.
  function openOutputMyListMenu(x, y, mode) {
    const cps = distinctCodepoints(output.ta.value);
    const items = mylists.lists.map((list) => ({
      label: `${list.icon} ${list.name}${mode === 'add' ? 'へ追加' : 'から削除'}`,
      onClick: () => {
        if (!cps.length) return;
        for (const cp of cps) {
          if (mode === 'add') mylists.addTo(list.id, cp);
          else mylists.removeFrom(list.id, cp);
        }
        showToast(mode === 'add' ? `${cps.length} 文字を追加しました` : `${cps.length} 文字を削除しました`);
      },
    }));
    openMenu(x, y, items);
  }
  $('#output-add-mylist-btn').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    openOutputMyListMenu(r.left, r.bottom + 6, 'add');
  });
  $('#output-remove-mylist-btn').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    openOutputMyListMenu(r.left, r.bottom + 6, 'remove');
  });

  // Mobile: the two buttons above are hidden (see .output-bar .btn-group in
  // the max-width:768px media query) in favor of a single combined ★ button
  // in the top bar; tapping it offers the 追加/削除 choice first, then
  // chains into the same per-mylist menu as the desktop buttons.
  $('#mobile-mylist-btn').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left, y = r.bottom + 6;
    openMenu(x, y, [
      { label: '★＋ 全て追加', onClick: () => openOutputMyListMenu(x, y, 'add') },
      { label: '★－ 全て削除', onClick: () => openOutputMyListMenu(x, y, 'remove') },
    ]);
  });

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
    jumpRoot: $('#jump-form-slot'),
    blockFavorites,
  });
  // right-menu-zone block list: same jump behavior as the modal, but also
  // switches to the 符号表 tab first (revealInAll), since it's reachable
  // from any tab.
  new BlockSidebar($('#block-sidebar'), {
    onJump: (cp) => revealInAll && revealInAll(cp),
    colorMode,
    blockFavorites,
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

  // ---- Unicode Art (saved output-area snapshots, shown as tiles) --------
  const artBoard = $('#art-board');
  const drawArt = () => renderArtBoard(artBoard, art.items, {
    onInsert: (text) => { output.insert(text); for (const cp of distinctCodepoints(text)) history.record(cp); },
    onDelete: (id) => art.remove(id),
    onShare: async (text) => {
      const ok = await copyTextToClipboard(buildArtShareUrl(text));
      showToast(ok ? '共有用リンクをコピーしました' : 'リンクのコピーに失敗しました');
    },
  });
  art.subscribe(drawArt);
  drawArt();

  $('#save-art-btn').addEventListener('click', () => {
    const text = output.ta.value;
    if (!text) { showToast('出力部が空です'); return; }
    art.add(text);
    showToast('作品を保存しました');
  });

  // ---- font toggle (system glyphs vs installed Noto fonts) --------------
  setupFontToggle();

  // ---- mobile drawers (left = settings, right = block picker) ------------
  setupMobileDrawers();
  setupResponsiveCount();

  // ---- mode toggle -------------------------------------------------------
  const tabs = document.querySelectorAll('.mode-tab');
  const panels = {
    all: $('#panel-all'), current: $('#panel-current'),
    history: $('#panel-history'), fav: $('#panel-fav'), art: $('#panel-art'),
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

  // Shared Unicode Art link (see buildArtShareUrl): load the shared text
  // into the output area and land on the Art tab, then strip the `art`
  // param so a later reload/back-navigation doesn't re-insert it again.
  // It's shown, not auto-saved -- the recipient decides whether to keep it
  // via the normal "＋ 現在の内容を保存" button, same as any other output.
  const sharedArt = UrlState.get('art');
  if (sharedArt) {
    output.insert(sharedArt);
    for (const cp of distinctCodepoints(sharedArt)) history.record(cp);
    setMode('art');
    UrlState.set('art', null);
  }

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

// Slide-in drawers for the left (settings) and right (block picker) menu
// zones, shown only on narrow screens (see the max-width:768px media query).
// Opening one closes the other; a backdrop, the close buttons, and Escape all
// dismiss whichever is open.
function setupMobileDrawers() {
  const left = document.querySelector('.menu-left');
  const right = document.querySelector('.menu-right');
  const backdrop = document.querySelector('#drawer-backdrop');

  const close = () => {
    left.classList.remove('open');
    right.classList.remove('open');
    backdrop.classList.remove('open');
  };
  const open = (drawer) => {
    close();
    drawer.classList.add('open');
    backdrop.classList.add('open');
  };

  document.querySelector('#menu-left-toggle').addEventListener('click', () => open(left));
  document.querySelector('#menu-right-toggle').addEventListener('click', () => open(right));
  backdrop.addEventListener('click', close);
  for (const btn of document.querySelectorAll('.drawer-close'))
    btn.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

// Relocates the #count node (文字数/コードポイント数) between its normal
// spot in .output-bar and a slot in the mobile top bar, since that's blank
// space on narrow screens where .output-bar has none to spare.
function setupResponsiveCount() {
  const count = document.querySelector('#count');
  const mobileSlot = document.querySelector('#mobile-bar-count-slot');
  const outputBar = document.querySelector('.output-bar');
  const mq = window.matchMedia('(max-width: 768px)');
  const apply = () => (mq.matches ? mobileSlot : outputBar).appendChild(count);
  mq.addEventListener('change', apply);
  apply();
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

// Unicode Art tiles: each is a saved whole-string snapshot of the output
// area (not per-codepoint like the other boards), so it gets its own
// render+bind rather than reusing renderCharBoard/bindCharBoard. Tapping the
// tile body inserts the saved text at the caret; the visible delete button
// (always shown, not hover-only, so it stays reachable on touch) removes it.
function renderArtBoard(el, items, { onInsert, onDelete, onShare }) {
  if (!items.length) {
    el.innerHTML = '<p class="fav-empty">保存された作品はまだありません。<br>出力部に文字を入力し、「＋ 現在の内容を保存」を押してください。</p>';
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'art-grid';
  for (const work of items) {
    const tile = document.createElement('div');
    tile.className = 'art-tile';
    tile.innerHTML =
      `<button type="button" class="art-tile-share" aria-label="共有用リンクをコピー" title="共有用リンクをコピー">🔗</button>` +
      `<button type="button" class="art-tile-delete" aria-label="削除">×</button>` +
      `<div class="art-tile-text">${escapeHtml(work.text)}</div>`;
    tile.querySelector('.art-tile-text').addEventListener('click', () => onInsert(work.text));
    tile.querySelector('.art-tile-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      onDelete(work.id);
    });
    tile.querySelector('.art-tile-share').addEventListener('click', (e) => {
      e.stopPropagation();
      onShare(work.text);
    });
    wrap.appendChild(tile);
  }
  el.replaceChildren(wrap);
}

// Builds a self-contained shareable URL: #mode=art&art=<text>, so opening it
// lands directly on the Unicode Art tab with the shared text ready to view
// (see the "art" URL param handling in main()). URLSearchParams handles the
// percent-encoding (including astral/surrogate-pair characters) itself.
function buildArtShareUrl(text) {
  const params = new URLSearchParams();
  params.set('mode', 'art');
  params.set('art', text);
  return `${location.origin}${location.pathname}${location.search}#${params.toString()}`;
}

// Same copy-with-fallback approach as OutputArea.copy() (Clipboard API,
// falling back to a hidden textarea + execCommand for browsers/contexts
// without clipboard permission).
async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
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
