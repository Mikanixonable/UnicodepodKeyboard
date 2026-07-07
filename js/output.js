// Output area: editable text, caret-aware insert/delete, undo/redo, copy, counts.

const seg = (typeof Intl !== 'undefined' && Intl.Segmenter)
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

function graphemes(str) {
  if (seg) return [...seg.segment(str)].map(s => s.segment);
  return [...str]; // fallback: code points
}

export class OutputArea {
  constructor(textarea, { countEl, onCopyDone } = {}) {
    this.ta = textarea;
    this.countEl = countEl;
    this.onCopyDone = onCopyDone;
    this.history = [{ value: '', sel: 0 }];
    this.hi = 0;
    this.coalesceTimer = null;

    this.ta.addEventListener('input', () => this.onUserInput());
    this.ta.addEventListener('blur', () => this.commit());
    this.updateCount();
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

  insert(str) {
    this.commit();
    const { selectionStart: s, selectionEnd: e, value } = this.ta;
    this.ta.value = value.slice(0, s) + str + value.slice(e);
    const pos = s + str.length;
    this.ta.setSelectionRange(pos, pos);
    this.push();
    this.updateCount();
    this.ta.focus();
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
    this.ta.focus();
  }

  clearAll() {
    if (!this.ta.value) return;
    this.commit();
    this.ta.value = '';
    this.ta.setSelectionRange(0, 0);
    this.push();
    this.updateCount();
    this.ta.focus();
  }

  restore(snap) {
    this.ta.value = snap.value;
    const p = Math.min(snap.sel, snap.value.length);
    this.ta.setSelectionRange(p, p);
    this.updateCount();
    this.ta.focus();
  }

  undo() {
    this.commit();
    if (this.hi > 0) this.restore(this.history[--this.hi]);
  }

  redo() {
    if (this.hi < this.history.length - 1) this.restore(this.history[++this.hi]);
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

  updateCount() {
    if (!this.countEl) return;
    const v = this.ta.value;
    const cps = [...v].length;
    const gr = graphemes(v).length;
    this.countEl.textContent = `${gr} 文字 / ${cps} コードポイント`;
  }
}
