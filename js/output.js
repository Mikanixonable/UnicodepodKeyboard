// Output area: editable text, caret-aware insert/delete, undo/redo, copy, counts.

(function () {

const seg = (typeof Intl !== 'undefined' && Intl.Segmenter)
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

const TEXT_KEY = 'unicode-app:output-text:v1';

function graphemes(str) {
  if (seg) return [...seg.segment(str)].map(s => s.segment);
  return [...str]; // fallback: code points
}

class OutputArea {
  constructor(textarea, { countEl, onCopyDone, onPasteFail, onChange } = {}) {
    this.ta = textarea;
    this.countEl = countEl;
    this.onCopyDone = onCopyDone;
    this.onPasteFail = onPasteFail;
    this.onChange = onChange;
    this.coalesceTimer = null;

    try {
      const saved = localStorage.getItem(TEXT_KEY);
      if (saved) this.ta.value = saved;
    } catch { /* storage disabled */ }
    this.history = [this.snapshot()];
    this.hi = 0;

    this.ta.addEventListener('input', () => this.onUserInput());
    this.ta.addEventListener('blur', () => { this.commit(); this.updateFakeCaret(); });
    this.ta.addEventListener('focus', () => this.updateFakeCaret());
    this.updateCount();
    this.setupFakeCaret();
  }

  snapshot() {
    return { value: this.ta.value, sel: this.ta.selectionStart };
  }

  // Push current state as a new history entry (truncating any redo tail).
  push() {
    const snap = this.snapshot();
    const top = this.history[this.hi];
    if (top && top.value === snap.value) { top.sel = snap.sel; return; }
    this.history.length = this.hi + 1;
    this.history.push(snap);
    if (this.history.length > 200) this.history.shift();
    this.hi = this.history.length - 1;
  }

  // Coalesce rapid typing into a single history step.
  onUserInput() {
    this.updateCount();
    clearTimeout(this.coalesceTimer);
    this.coalesceTimer = setTimeout(() => this.push(), 400);
  }

  commit() {
    clearTimeout(this.coalesceTimer);
    this.push();
  }

  focusCaretEnd() {
    this.ta.focus();
    const p = this.ta.value.length;
    this.ta.setSelectionRange(p, p);
  }

  // Focusing the textarea pops the mobile virtual keyboard, which should
  // only happen when the user deliberately taps the output area itself --
  // not on every programmatic edit (grid tap, undo, caret buttons, etc.).
  // On desktop there's no keyboard to avoid, so keep focusing there as
  // before (keeps the blinking caret visible after each edit).
  maybeFocus() {
    if (!window.matchMedia('(max-width: 768px)').matches) this.ta.focus();
  }

  // A custom blinking caret, shown only when the textarea isn't actually
  // focused (mobile: maybeFocus() deliberately skips focus() on programmatic
  // edits to avoid popping the keyboard, so the browser's native caret never
  // appears there -- leaving no visual cue for where the next tap will
  // insert). Positioned with a hidden mirror div that replicates the
  // textarea's box/font metrics, since a <textarea> can't host child nodes
  // to measure against directly.
  setupFakeCaret() {
    const wrap = this.ta.parentElement;
    this.mirror = document.createElement('div');
    this.mirror.className = 'ta-mirror';
    this.mirror.setAttribute('aria-hidden', 'true');
    wrap.appendChild(this.mirror);
    this.caretEl = document.createElement('div');
    this.caretEl.className = 'fake-caret';
    wrap.appendChild(this.caretEl);
    this.updateFakeCaret();
  }

  updateFakeCaret() {
    if (!window.matchMedia('(max-width: 768px)').matches || document.activeElement === this.ta) {
      this.caretEl.style.display = 'none';
      return;
    }
    const cs = getComputedStyle(this.ta);
    const props = [
      'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
    ];
    for (const p of props) this.mirror.style[p] = cs[p];
    this.mirror.style.position = 'absolute';
    this.mirror.style.visibility = 'hidden';
    this.mirror.style.whiteSpace = 'pre-wrap';
    this.mirror.style.wordWrap = 'break-word';
    this.mirror.style.left = `${this.ta.offsetLeft}px`;
    this.mirror.style.top = `${this.ta.offsetTop}px`;
    this.mirror.style.height = 'auto';

    const pos = this.ta.selectionStart;
    this.mirror.textContent = this.ta.value.slice(0, pos);
    const marker = document.createElement('span');
    marker.textContent = '​';
    this.mirror.appendChild(marker);

    const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
    this.caretEl.style.left = `${this.ta.offsetLeft + marker.offsetLeft - this.ta.scrollLeft}px`;
    this.caretEl.style.top = `${this.ta.offsetTop + marker.offsetTop - this.ta.scrollTop}px`;
    this.caretEl.style.height = `${lineHeight}px`;
    this.caretEl.style.display = 'block';
  }

  insert(str) {
    this.commit();
    const { selectionStart: s, selectionEnd: e, value } = this.ta;
    this.ta.value = value.slice(0, s) + str + value.slice(e);
    const pos = s + str.length;
    this.ta.setSelectionRange(pos, pos);
    this.push();
    this.updateCount();
    this.maybeFocus();
    this.updateFakeCaret();
  }

  deleteBackward() {
    this.commit();
    const { selectionStart: s, selectionEnd: e, value } = this.ta;
    if (s !== e) {
      this.ta.value = value.slice(0, s) + value.slice(e);
      this.ta.setSelectionRange(s, s);
    } else if (s > 0) {
      const before = value.slice(0, s);
      const gs = graphemes(before);
      const last = gs[gs.length - 1] || '';
      const cut = s - last.length;
      this.ta.value = value.slice(0, cut) + value.slice(s);
      this.ta.setSelectionRange(cut, cut);
    }
    this.push();
    this.updateCount();
    this.maybeFocus();
    this.updateFakeCaret();
  }

  // Move the caret by one grapheme left (-1) or right (+1); collapses an
  // existing selection to its near edge first, like native arrow-key behavior.
  moveCaret(dir) {
    const { selectionStart: s, selectionEnd: e, value } = this.ta;
    if (s !== e) {
      const p = dir < 0 ? s : e;
      this.ta.setSelectionRange(p, p);
    } else if (dir < 0) {
      if (s === 0) return;
      const gs = graphemes(value.slice(0, s));
      const last = gs[gs.length - 1] || '';
      const p = s - last.length;
      this.ta.setSelectionRange(p, p);
    } else {
      if (s === value.length) return;
      const gs = graphemes(value.slice(s));
      const first = gs[0] || '';
      const p = s + first.length;
      this.ta.setSelectionRange(p, p);
    }
    this.maybeFocus();
    this.updateFakeCaret();
  }

  clearAll() {
    if (!this.ta.value) return;
    this.commit();
    this.ta.value = '';
    this.ta.setSelectionRange(0, 0);
    this.push();
    this.updateCount();
    this.maybeFocus();
    this.updateFakeCaret();
  }

  restore(snap) {
    this.ta.value = snap.value;
    const p = Math.min(snap.sel, snap.value.length);
    this.ta.setSelectionRange(p, p);
    this.updateCount();
    this.maybeFocus();
    this.updateFakeCaret();
  }

  undo() {
    this.commit();
    if (this.hi > 0) this.restore(this.history[--this.hi]);
  }

  redo() {
    if (this.hi < this.history.length - 1) this.restore(this.history[++this.hi]);
  }

  async paste() {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      if (this.onPasteFail) this.onPasteFail();
      return;
    }
    if (text) this.insert(text);
  }

  async copy() {
    const text = this.ta.value;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      this.ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      this.ta.setSelectionRange(text.length, text.length);
    }
    if (this.onCopyDone) this.onCopyDone();
  }

  // Called after every content-changing operation (typing, insert, delete,
  // clear, undo/redo). Drives both the counter label and anything that
  // mirrors the current output text (e.g. the "current characters" tab).
  updateCount() {
    const v = this.ta.value;
    if (this.countEl) {
      const cps = [...v].length;
      const gr = graphemes(v).length;
      this.countEl.textContent = `${gr} 文字 / ${cps} コードポイント`;
    }
    try { localStorage.setItem(TEXT_KEY, v); } catch { /* storage disabled / full */ }
    if (this.onChange) this.onChange(v);
  }
}

window.App = window.App || {};
window.App.Output = { OutputArea };

})();
