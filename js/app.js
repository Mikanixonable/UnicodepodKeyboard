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
const { FavHighlight } = window.App.FavHighlight;
const { BlockFavorites } = window.App.BlockFavorites;
const { UnicodeArt } = window.App.Art;
const { ArtLists } = window.App.ArtLists;
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
  const favHighlight = new FavHighlight();
  const blockFavorites = new BlockFavorites();
  const art = new UnicodeArt();
  const artLists = new ArtLists();
  const currentBoard = $('#current-board');
  let revealInAll = null;
  let closeMobileDrawers = null;

  function drawCurrent(text) {
    renderCharBoard(currentBoard, distinctCodepoints(text), mylists, colorMode,
      '出力欄に文字を入力すると、ここに使われている文字が表示されます。', favHighlight.get());
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
  function openOutputMyListMenu(x, y, mode, align) {
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
    openMenu(x, y, items, { align });
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
  // chains into the same per-mylist menu as the desktop buttons. It sits at
  // the top bar's right edge, so the menu is right-aligned (anchored at the
  // button's right edge, hanging down-left) to match.
  $('#mobile-mylist-btn').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.right, y = r.bottom + 6;
    openMenu(x, y, [
      { label: '★＋ 全て追加', onClick: () => openOutputMyListMenu(x, y, 'add', 'right') },
      { label: '★－ 全て削除', onClick: () => openOutputMyListMenu(x, y, 'remove', 'right') },
    ], { align: 'right' });
  });

  // Mobile: undo/redo are likewise hidden from .output-bar (see the
  // max-width:768px media query) in favor of one combined ↺ button in the
  // top bar, offering the choice first -- same pattern as ★ above. This one
  // sits at the top bar's left edge, so the menu stays left-aligned (the
  // default).
  $('#mobile-undo-redo-btn').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(r.left, r.bottom + 6, [
      { label: '↶ 元に戻す', onClick: () => output.undo() },
      { label: '↷ やり直す', onClick: () => output.redo() },
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
  const sidebar = new BlockSidebar($('#block-sidebar'), {
    onJump: (cp) => {
      revealInAll && revealInAll(cp);
      // Mobile: this sidebar lives in the right-hand drawer, so picking a
      // block should close it and drop straight into the newly-scrolled
      // 符号表 grid instead of leaving the drawer covering it.
      closeMobileDrawers && closeMobileDrawers();
    },
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
    favHighlight,
    onTopCpChange: (cp) => { header.setTopCp(cp); sidebar.setTopCp(cp); },
  });

  // Mobile: opening the right drawer shows this same sidebar -- scroll it
  // to the block currently in view in the 符号表 grid, instead of leaving
  // it wherever it last was, so it reflects "where you are" right away
  // (same shortcut as the sidebar's own 現在地 button). Wired after
  // setupMobileDrawers() below so this listener fires after its own
  // 'open(right)' one (registration order), i.e. once the drawer is
  // actually opening.

  // ---- color-coding mode (none / category / age) -------------------------
  colorMode.subscribe(() => {
    drawFav();
    drawHist();
    drawCurrent(output.ta.value);
  });

  // ---- お気に入りハイライト (符号表/入力内容/入力履歴 only; off by default) ----
  favHighlight.subscribe(() => {
    grid.rerender();
    drawHist();
    drawCurrent(output.ta.value);
  });
  setupFavHighlightToggle(favHighlight);

  // ---- mylist & history keyboards ---------------------------------------
  const favPanel = $('#panel-fav');
  favPanel.innerHTML = `
    <div class="mylist-toolbar">
      <label class="mylist-picker">
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

  // false: every item shown here is already a member of whichever list is
  // active (お気に入り or another マイリスト), so highlighting them all
  // would just be noise -- see renderCharBoard's `highlight` param.
  const drawFav = () => renderCharBoard(favBoard, mylists.activeList.items, mylists, colorMode,
    `${mylists.activeLabel} はまだありません。<br>文字を右クリック（または長押し）して「${mylists.activeLabel}に追加」してください。`, false);
  const drawHist = () => renderCharBoard(histBoard, history.list, mylists, colorMode,
    '入力履歴はまだありません。<br>文字を入力すると、ここに新しい順で表示されます。', favHighlight.get());

  // mylist changes affect the badge on all three boards
  mylists.subscribe(() => { renderMyListControls(); drawFav(); drawHist(); drawCurrent(output.ta.value); });
  history.subscribe(drawHist);
  mylistSelect.addEventListener('change', () => { mylists.setActive(mylistSelect.value); });
  mylistAddBtn.addEventListener('click', () => {
    const suggested = nextMylistName(mylists.lists);
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
    { label: '符号表', onClick: () => revealInAll(cp) },
    { label: 'マイリストへ追加…', onClick: () => openMyListMenu(cp, x, y) },
  ]);
  bindCharBoard(favBoard, insert, (cp) => [
    { label: '詳細を表示', onClick: () => modal.open(cp) },
    { label: '符号表', onClick: () => revealInAll(cp) },
    { label: '← 前へ移動', onClick: () => mylists.move(cp, -1) },
    { label: '次へ移動 →', onClick: () => mylists.move(cp, 1) },
    { label: `${mylists.activeList.icon} ${mylists.activeList.name}から外す`, onClick: () => mylists.remove(cp) },
  ]);
  bindCharBoard(histBoard, insert, (cp, x, y) => [
    { label: '詳細を表示', onClick: () => modal.open(cp) },
    { label: '符号表', onClick: () => revealInAll(cp) },
    { label: 'マイリストへ追加…', onClick: () => openMyListMenu(cp, x, y) },
    { label: '履歴から削除', onClick: () => history.remove(cp) },
  ]);

  $('#clear-history').addEventListener('click', () => {
    if (history.list.length) history.clear();
  });

  // ---- Unicode Art (saved output-area snapshots, shown as tiles) --------
  function insertArt(id) {
    const work = art.items.find((w) => w.id === id);
    if (!work) return;
    output.insert(work.text);
    for (const cp of distinctCodepoints(work.text)) history.record(cp);
  }

  function renameArt(work) {
    const name = window.prompt('題名を入力してください（空欄で無題）', work.title || '');
    if (name === null) return;
    art.rename(work.id, name.trim());
  }

  // ---- Unicode Art edit modal (rewrite a saved work's whole text) --------
  const artEditModal = $('#art-edit-modal');
  const artEditTextarea = $('#art-edit-textarea');
  let artEditingId = null;

  function openArtEditModal(work) {
    artEditingId = work.id;
    artEditTextarea.value = work.text;
    artEditModal.hidden = false;
    artEditTextarea.focus();
  }
  function closeArtEditModal() {
    artEditModal.hidden = true;
    artEditingId = null;
  }
  $('#art-edit-close').addEventListener('click', closeArtEditModal);
  artEditModal.querySelector('.modal-backdrop').addEventListener('click', closeArtEditModal);
  $('#art-edit-save').addEventListener('click', () => {
    const text = artEditTextarea.value;
    if (!text) { showToast('内容が空です'); return; }
    art.editText(artEditingId, text);
    closeArtEditModal();
    showToast('作品を更新しました');
  });
  document.addEventListener('keydown', (e) => {
    if (!artEditModal.hidden && e.key === 'Escape') closeArtEditModal();
  });

  // Shared by every Unicode Art tile across all three sub-tabs (全て/お気に
  // 入り/マイリスト): rename, share, per-list add/remove (uses artLists --
  // a separate store from the character mylists, since these are different
  // features with different record types), and delete.
  function artMenuItems(id) {
    const work = art.items.find((w) => w.id === id);
    if (!work) return [];
    const items = [
      { label: '📝 編集', onClick: () => openArtEditModal(work) },
      { label: '✎ 名前を変更', onClick: () => renameArt(work) },
      {
        label: '🔗 共有用リンクをコピー',
        onClick: async () => {
          const ok = await copyTextToClipboard(buildArtShareUrl(work.text));
          showToast(ok ? '共有用リンクをコピーしました' : 'リンクのコピーに失敗しました');
        },
      },
    ];
    for (const list of artLists.lists) {
      const has = artLists.hasIn(list.id, id);
      items.push({
        label: `${list.icon} ${list.name}${has ? 'から外す' : 'に追加'}`,
        onClick: () => artLists.toggleIn(list.id, id),
      });
    }
    items.push({ label: '削除', onClick: () => art.remove(id) });
    return items;
  }

  // Single dropdown (全て + every artLists list, お気に入り included since
  // it's just artLists' built-in first entry) replaces separate sub-tabs --
  // selecting a list also makes it artLists.activeId, so create/rename/
  // delete always act on whatever's currently shown.
  const ART_ALL_VIEW = 'all';
  let artView = ART_ALL_VIEW;

  const artBoard = $('#art-board');
  const artViewSelect = $('#art-view-select');
  const artMylistAddBtn = $('#art-mylist-add');
  const artMylistRenameBtn = $('#art-mylist-rename');
  const artMylistDeleteBtn = $('#art-mylist-delete');

  function renderArtViewSelect() {
    const options = [`<option value="${ART_ALL_VIEW}">全て</option>`].concat(
      artLists.lists.map((list) => `<option value="${list.id}">${escapeHtml(`${list.icon} ${list.name}`)}</option>`)
    );
    artViewSelect.innerHTML = options.join('');
    artViewSelect.value = artView;
    const list = artView === ART_ALL_VIEW ? null : artLists.findList(artView);
    const locked = !list || list.builtIn; // 全て・お気に入り (built-in) can't be renamed/deleted
    artMylistRenameBtn.disabled = locked;
    artMylistRenameBtn.title = locked ? '名前を変更できません' : `${list.name} の名前を変更`;
    artMylistDeleteBtn.disabled = locked;
    artMylistDeleteBtn.title = locked ? '削除できません' : `${list.name} を削除`;
  }

  function drawArtBoard() {
    if (artView === ART_ALL_VIEW) {
      renderArtBoard(artBoard, art.items,
        '保存された作品はまだありません。<br>「＋ 現在の出力部を保存」を押してください。');
      return;
    }
    const list = artLists.findList(artView);
    const items = list ? art.items.filter((w) => list.set.has(w.id)) : [];
    renderArtBoard(artBoard, items,
      `${list ? list.name : 'マイリスト'} はまだありません。<br>作品を長押し（または右クリック）して追加してください。`);
  }
  bindArtBoard(artBoard, insertArt, artMenuItems);

  // Named so both the desktop buttons and the mobile "マイリスト操作" combined
  // menu (see #art-mylist-menu-btn below) can share the same logic.
  function doArtMylistAdd() {
    const suggested = nextMylistName(artLists.lists);
    const name = window.prompt('新しいマイリスト名を入力してください', suggested);
    if (!name) return;
    const list = artLists.createList(name);
    artView = list.id;
    renderArtViewSelect();
    drawArtBoard();
  }
  function doArtMylistRename() {
    const list = artView === ART_ALL_VIEW ? null : artLists.findList(artView);
    if (!list || list.builtIn) return;
    const name = window.prompt('新しい名前を入力してください', list.name);
    if (!name) return;
    artLists.renameList(list.id, name);
  }
  function doArtMylistDelete() {
    const list = artView === ART_ALL_VIEW ? null : artLists.findList(artView);
    if (!list || list.builtIn) return;
    if (!window.confirm(`「${list.name}」を削除しますか？`)) return;
    artLists.removeList(list.id);
    artView = ART_ALL_VIEW;
    renderArtViewSelect();
    drawArtBoard();
  }

  artViewSelect.addEventListener('change', () => {
    artView = artViewSelect.value;
    if (artView !== ART_ALL_VIEW) artLists.setActive(artView);
    renderArtViewSelect();
    drawArtBoard();
  });
  artMylistAddBtn.addEventListener('click', doArtMylistAdd);
  artMylistRenameBtn.addEventListener('click', doArtMylistRename);
  artMylistDeleteBtn.addEventListener('click', doArtMylistDelete);

  // Mobile: the three buttons above are hidden (see .board-bar .mylist-actions
  // in the max-width:768px media query) in favor of one combined "マイリスト
  //操作" button, offering the three choices first -- same ★/↺ pattern as
  // elsewhere in the top bar.
  $('#art-mylist-menu-btn').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const list = artView === ART_ALL_VIEW ? null : artLists.findList(artView);
    const locked = !list || list.builtIn;
    openMenu(r.left, r.bottom + 6, [
      { label: '＋ 作成', onClick: doArtMylistAdd },
      ...(locked ? [] : [
        { label: '名前変更', onClick: doArtMylistRename },
        { label: '削除', onClick: doArtMylistDelete },
      ]),
    ]);
  });

  artLists.subscribe(() => { renderArtViewSelect(); drawArtBoard(); });
  art.subscribe(drawArtBoard);
  renderArtViewSelect();
  drawArtBoard();

  $('#save-art-btn').addEventListener('click', () => {
    const text = output.ta.value;
    if (!text) { showToast('出力部が空です'); return; }
    art.add(text);
    showToast('作品を保存しました');
  });

  // ---- font toggle (system glyphs vs installed Noto fonts) --------------
  setupFontToggle();
  setupThemeToggle();

  // ---- mobile drawers (left = settings, right = block picker) ------------
  closeMobileDrawers = setupMobileDrawers();
  setupResponsiveCount();

  // Once the right drawer is open, scroll its block list to whatever's
  // currently displayed in the 符号表 grid -- same shortcut as the
  // sidebar's own 現在地 button, just automatic on open.
  $('#menu-right-toggle').addEventListener('click', () => {
    requestAnimationFrame(() => sidebar.scrollToCurrentBlock());
  });

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
  // via the normal "＋ 現在の出力部を保存" button, same as any other output.
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
  const cur = () => FONTS.includes(document.documentElement.dataset.font) ? document.documentElement.dataset.font : 'extended';
  const apply = (font) => {
    document.documentElement.dataset.font = font;
    try { localStorage.setItem(KEY, font); } catch { /* ignore */ }
    opts.forEach((o) => o.classList.toggle('active', o.dataset.font === font));
  };
  opts.forEach((o) => o.addEventListener('click', () => apply(o.dataset.font)));
  apply(cur());
}

// Light/dark theme switch (see the [data-theme] rules in css/styles.css and
// the pre-paint <script> in index.html's <head>). Unlike setupFontToggle,
// an unset choice isn't forced to one value -- it just follows the OS via
// prefers-color-scheme until the user actually picks a button, at which
// point that pick is saved and always wins.
function setupThemeToggle() {
  const KEY = 'unicode-app:theme:v1';
  const THEMES = ['light', 'dark'];
  const opts = document.querySelectorAll('.theme-opt');
  const stored = () => THEMES.includes(document.documentElement.dataset.theme) ? document.documentElement.dataset.theme : null;
  const systemTheme = () => (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  const render = () => {
    const theme = stored() || systemTheme();
    opts.forEach((o) => o.classList.toggle('active', o.dataset.themeOpt === theme));
  };
  const apply = (theme) => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
    render();
  };
  opts.forEach((o) => o.addEventListener('click', () => apply(o.dataset.themeOpt)));
  render();
}

// OFF/ON toggle for お気に入り強調 (see favhighlight.js) -- same button-group
// pattern as setupFontToggle, just backed by the FavHighlight store instead
// of a plain localStorage key so other code can subscribe to changes.
function setupFavHighlightToggle(favHighlight) {
  const opts = document.querySelectorAll('.fav-highlight-opt');
  const render = () => {
    const on = favHighlight.get();
    opts.forEach((o) => o.classList.toggle('active', (o.dataset.favHighlight === 'on') === on));
  };
  opts.forEach((o) => o.addEventListener('click', () => favHighlight.set(o.dataset.favHighlight === 'on')));
  favHighlight.subscribe(render);
  render();
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
  return close;
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

// Lowest unused "マイリスト N" (N starting at 1), checked against actual
// existing names -- not list count, which counts the built-in お気に入り
// too and drifts out of sync with the numbering as soon as any list is
// renamed or deleted, producing suggestions like "マイリスト 2" repeatedly
// or "マイリスト 2 2" once createList()'s own collision suffix kicks in.
function nextMylistName(lists) {
  const existing = new Set(lists.map((l) => l.name));
  let n = 1;
  while (existing.has(`マイリスト ${n}`)) n++;
  return `マイリスト ${n}`;
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
// `highlight` controls the fav-star box-shadow (see .cell.fav): callers
// showing a mylist's own contents (お気に入り or another マイリスト) pass
// false, since every item there is trivially "favorited" by definition and
// highlighting all of them is just noise -- only 符号表/入力内容/入力履歴
// respect the actual お気に入り強調 setting.
function renderCharBoard(el, list, mylists, colorMode, emptyHtml, highlight = true) {
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
    b.className = 'cell' + (highlight && mylists.has(cp) ? ' fav' : '');
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
// render/bind rather than reusing renderCharBoard/bindCharBoard -- but the
// *interaction* (tap to insert, long-press/right-click for a menu of
// secondary actions) matches every other board in the app for consistency,
// rather than a scattering of small corner buttons.
const ART_MAX_LINES = 20;

function renderArtBoard(el, items, emptyHtml) {
  if (!items.length) {
    el.innerHTML = `<p class="fav-empty">${emptyHtml}</p>`;
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'art-grid';
  for (const work of items) {
    const tile = document.createElement('div');
    tile.className = 'art-tile';
    tile.dataset.artId = work.id;
    const lines = work.text.split('\n');
    const displayText = lines.length > ART_MAX_LINES
      ? lines.slice(0, ART_MAX_LINES).join('\n') + '\n…'
      : work.text;
    tile.innerHTML =
      (work.title ? `<div class="art-tile-title">${escapeHtml(work.title)}</div>` : '') +
      `<div class="art-tile-text">${escapeHtml(displayText)}</div>`;
    wrap.appendChild(tile);
  }
  el.replaceChildren(wrap);

  // Shrink each tile's font-size just enough that its widest line fits
  // without wrapping -- word-wrapping an Art piece would shift later
  // characters onto a new line and visibly wreck its alignment, so
  // scaling the whole tile down is the lesser evil. Needs the tiles to
  // already be in the (now-attached) DOM to measure real layout widths.
  // Never shrinks past half-size though -- an extreme one-line piece would
  // otherwise scale down to an illegibly tiny font; overflow:hidden clips
  // whatever's still too wide beyond that floor instead.
  const ART_MIN_SCALE = 0.5;
  for (const textEl of wrap.querySelectorAll('.art-tile-text')) {
    const available = textEl.clientWidth;
    const natural = textEl.scrollWidth;
    if (available > 0 && natural > available) {
      const fontSize = parseFloat(getComputedStyle(textEl).fontSize);
      const scale = Math.max(ART_MIN_SCALE, available / natural);
      textEl.style.fontSize = `${fontSize * scale}px`;
    }
  }
}

// Same long-press-vs-tap pattern as bindCharBoard, keyed by data-art-id
// instead of data-cp.
function bindArtBoard(root, insert, menuItems) {
  let timer = null, suppress = false, xy = null;
  const idOf = (t) => { const el = t.closest('.art-tile[data-art-id]'); return el ? el.dataset.artId : null; };

  root.addEventListener('pointerdown', (e) => {
    const id = idOf(e.target); if (id == null) return;
    suppress = false; xy = { x: e.clientX, y: e.clientY };
    if (e.pointerType !== 'mouse') {
      clearTimeout(timer);
      timer = setTimeout(() => { suppress = true; openMenu(xy.x, xy.y, menuItems(id, xy.x, xy.y)); }, 450);
    }
  });
  root.addEventListener('pointermove', (e) => {
    if (timer && xy && Math.hypot(e.clientX - xy.x, e.clientY - xy.y) > 10) clearTimeout(timer);
  });
  root.addEventListener('pointerup', () => clearTimeout(timer));
  root.addEventListener('click', (e) => {
    const id = idOf(e.target); if (id == null) return;
    if (suppress) { suppress = false; return; }
    insert(id);
  });
  root.addEventListener('contextmenu', (e) => {
    const id = idOf(e.target); if (id == null) return;
    e.preventDefault();
    openMenu(e.clientX, e.clientY, menuItems(id, e.clientX, e.clientY));
  });
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
