// Sticky block-name header with a searchable dropdown that jumps the grid.

(function () {

const D = window.App.Data;

class BlockHeader {
  constructor(root, { onJump }) {
    this.root = root;
    this.onJump = onJump;
    this.open = false;
    this.current = null;

    root.innerHTML = `
      <div class="block-bar">
        <button type="button" class="block-btn" aria-haspopup="listbox" aria-expanded="false">
          <span class="block-name">—</span>
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
        <input type="text" class="block-search" placeholder="ブロックを検索…" aria-label="ブロック検索">
        <ul class="block-list" role="listbox"></ul>
      </div>`;

    this.btn = root.querySelector('.block-btn');
    this.nameEl = root.querySelector('.block-name');
    this.pop = root.querySelector('.block-pop');
    this.search = root.querySelector('.block-search');
    this.listEl = root.querySelector('.block-list');
    this.jumpForm = root.querySelector('.jump');
    this.jumpInput = root.querySelector('.jump-input');

    this.buildList();

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
  }

  buildList() {
    const frag = document.createDocumentFragment();
    for (const b of D.getBlocks()) {
      const li = document.createElement('li');
      li.role = 'option';
      li.className = 'block-item';
      li.dataset.cp = b.s;
      li.textContent = b.n;
      li.title = `U+${D.hex(b.s)}–U+${D.hex(b.e)}`;
      li.addEventListener('click', () => {
        this.onJump(b.s);
        this.close();
      });
      frag.appendChild(li);
    }
    this.listEl.appendChild(frag);
    this.items = [...this.listEl.children];
  }

  filter(q) {
    const s = q.trim().toLowerCase();
    for (const li of this.items)
      li.hidden = s ? !li.textContent.toLowerCase().includes(s) : false;
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
    if (name === this.current) return;
    this.current = name;
    this.nameEl.textContent = name;
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
    this.search.focus();
    const active = this.listEl.querySelector('.active');
    if (active) active.scrollIntoView({ block: 'center' });
  }

  close() {
    this.open = false;
    this.pop.hidden = true;
    this.btn.setAttribute('aria-expanded', 'false');
  }
}

window.App.Blocks = { BlockHeader };

})();
