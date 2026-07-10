// Singleton context menu shared by the grid and the mylist keyboard.

(function () {

let el = null;

function ensure() {
  if (el) return el;
  el = document.createElement('div');
  el.className = 'ctx-menu';
  el.hidden = true;
  document.body.appendChild(el);
  const close = () => hideMenu();
  window.addEventListener('pointerdown', (e) => {
    if (!el.hidden && !el.contains(e.target)) hideMenu();
  }, true);
  window.addEventListener('scroll', close, true);
  window.addEventListener('resize', close);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideMenu(); });
  return el;
}

// align: 'left' (default) anchors the menu's left edge at x -- for triggers
// near the left of the screen. 'right' anchors the menu's *right* edge at x
// instead -- for triggers near the right (e.g. the mobile top bar's ★
// button), so the menu hangs down toward the same side as its button
// instead of potentially overshooting past the right edge and getting
// clamped back to a position that no longer lines up with the trigger.
function openMenu(x, y, items, { align = 'left' } = {}) {
  const m = ensure();
  m.innerHTML = '';
  for (const it of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ctx-item';
    b.textContent = it.label;
    b.addEventListener('click', () => { hideMenu(); it.onClick(); });
    m.appendChild(b);
  }
  m.hidden = false;
  // position, keeping the menu on-screen
  const rect = m.getBoundingClientRect();
  const left = align === 'right' ? x - rect.width : x;
  const px = Math.min(left, window.innerWidth - rect.width - 8);
  const py = Math.min(y, window.innerHeight - rect.height - 8);
  m.style.left = Math.max(8, px) + 'px';
  m.style.top = Math.max(8, py) + 'px';
}

function hideMenu() {
  if (el) el.hidden = true;
}

window.App = window.App || {};
window.App.Menu = { openMenu, hideMenu };

})();
