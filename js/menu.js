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

function openMenu(x, y, items) {
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
  const px = Math.min(x, window.innerWidth - rect.width - 8);
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
