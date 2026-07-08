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

    // `typing` tracks an actual native-keyboard session, distinct from
    // activeElement === ta -- see updateFakeCaret() for why the two can
    // disagree (iOS's swipe-to-dismiss-keyboard gesture doesn't blur).
    this.typing = false;
    this.ta.addEventListener('input', () => {
      this.onUserInput();
      this.typing = true;
      this.caretEl.style.display = 'none';
      clearTimeout(this.typingIdleTimer);
      this.typingIdleTimer = setTimeout(() => { this.typing = false; this.updateFakeCaret(); }, 400);
    });
    this.ta.addEventListener('focus', () => { this.typing = true; this.updateFakeCaret(); });
    this.ta.addEventListener('blur', () => {
      this.commit();
      clearTimeout(this.typingIdleTimer);
      this.typing = false;
      this.updateFakeCaret();
    });
    // The textarea can scroll (long text, vertical resize) independently of
    // any caret-moving operation; updateFakeCaret() already subtracts
    // ta.scrollLeft/scrollTop; it just needs to actually re-run on scroll.
    this.ta.addEventListener('scroll', () => this.updateFakeCaret());
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

  // A custom blinking caret, shown whenever there isn't an active native
  // typing session (mobile: maybeFocus() deliberately skips focus() on
  // programmatic edits to avoid popping the keyboard, so the browser's
  // native caret never appears there; and even for genuine typing, iOS's
  // swipe-to-dismiss-keyboard gesture hides the keyboard/native caret
  // *without* blurring the textarea, so gating on document.activeElement
  // alone would leave no cursor visible at all until some other edit
  // happens -- see the input/focus/blur listeners above for how `typing`
  // is tracked instead). Positioned with a hidden mirror div that
  // replicates the textarea's box/font metrics, since a <textarea> can't
  // host child nodes to measure against directly.
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
    if (!window.matchMedia('(max-width: 768px)').matches || this.typing) {
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
    this.mirror.style.opacity = '';
    this.mirror.style.pointerEvents = ''; // clears moveCaretLine()'s temporary 'auto' override
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

    const fontSize = parseFloat(cs.fontSize);
    const lineHeight = parseFloat(cs.lineHeight) || fontSize * 1.2;
    // Using the full line-height as the caret's height (anchored at the
    // line box's top edge) made it ~1.4x taller than the actual glyphs and
    // sitting visibly above them. Splitting the leftover space evenly
    // above/below (half-leading) still left it looking too high -- glyph
    // ink sits closer to the line box's bottom (near the baseline) than to
    // its vertical center, since a font's ascent is taller than its
    // descent. Push the caret down by the full leftover space instead
    // (bottom-aligned within the line box) to actually bracket the glyph.
    const caretHeight = fontSize * 1.15;
    const leading = lineHeight - caretHeight;
    this.caretEl.style.left = `${this.ta.offsetLeft + marker.offsetLeft - this.ta.scrollLeft}px`;
    this.caretEl.style.top = `${this.ta.offsetTop + marker.offsetTop + leading - this.ta.scrollTop}px`;
    this.caretEl.style.height = `${caretHeight}px`;
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

  // Move the caret up (-1) or down (+1) one *visual* line (i.e. accounting
  // for wrapped long lines, not just explicit \n), keeping roughly the same
  // horizontal position -- like a text editor's up/down arrow keys, which a
  // plain <textarea> doesn't expose an API for directly. Reuses the same
  // hidden mirror div as the fake caret (see updateFakeCaret), since a real
  // rendered copy of the text is what lets us hit-test a pixel position
  // back to a character offset via caretPositionFromPoint/caretRangeFromPoint.
  moveCaretLine(dir) {
    const cs = getComputedStyle(this.ta);
    const props = [
      'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
    ];
    for (const p of props) this.mirror.style[p] = cs[p];
    // Unlike updateFakeCaret's own use of the mirror (absolute + hidden +
    // pointer-events:none via the .ta-mirror class -- fine, since nothing
    // needs to hit-test it there), this needs
    // caretRangeFromPoint/caretPositionFromPoint to actually find text in
    // it, which means overriding both of those:
    // - pointer-events:none excludes an element from hit-testing entirely
    //   (that's the .ta-mirror class default), so it must go to 'auto' here.
    // - even then, a live <textarea> always wins hit-testing at its own
    //   screen position over any sibling laid on top of it, regardless of
    //   position/z-index (a browser quirk with native form controls) -- so
    //   the real textarea has to be made visibility:hidden (paint-only,
    //   doesn't affect layout/focus) for this one synchronous measurement,
    //   restored immediately after.
    const taRect = this.ta.getBoundingClientRect();
    const prevVisibility = this.ta.style.visibility;
    this.ta.style.visibility = 'hidden';
    this.mirror.style.position = 'fixed';
    this.mirror.style.visibility = 'visible';
    this.mirror.style.opacity = '0';
    this.mirror.style.pointerEvents = 'auto';
    this.mirror.style.whiteSpace = 'pre-wrap';
    this.mirror.style.wordWrap = 'break-word';
    this.mirror.style.left = `${taRect.left - this.ta.scrollLeft}px`;
    this.mirror.style.top = `${taRect.top - this.ta.scrollTop}px`;
    this.mirror.style.height = 'auto';

    this.mirror.textContent = this.ta.value;
    const textNode = this.mirror.firstChild;
    if (textNode) {
      const pos = this.ta.selectionStart;
      const posRange = document.createRange();
      posRange.setStart(textNode, 0);
      posRange.setEnd(textNode, pos);
      const rects = posRange.getClientRects();
      const rect = rects[rects.length - 1] || this.mirror.getBoundingClientRect();

      const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      const targetX = rect.right;
      const targetY = rect.top + lineHeight * dir + lineHeight / 2;

      let hit = null;
      if (document.caretPositionFromPoint) {
        const r = document.caretPositionFromPoint(targetX, targetY);
        if (r) hit = { node: r.offsetNode, offset: r.offset };
      } else if (document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(targetX, targetY);
        if (r) hit = { node: r.startContainer, offset: r.startOffset };
      }
      if (hit && this.mirror.contains(hit.node)) {
        const hitRange = document.createRange();
        hitRange.setStart(textNode, 0);
        hitRange.setEnd(hit.node, hit.offset);
        this.ta.setSelectionRange(hitRange.toString().length, hitRange.toString().length);
      } // else: no line in that direction -- no-op, like moveCaret()'s edges
    }
    this.ta.style.visibility = prevVisibility;
    this.maybeFocus();
    this.updateFakeCaret(); // restores the mirror's normal absolute/hidden/pointer-events state
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
