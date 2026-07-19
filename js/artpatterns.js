// パターン工房 (Unicode Art pattern studio): named generation rules stored in
// localStorage, plus the pure expansion engine that turns a rule body into
// text.
//
// Body syntax (lenient -- anything that doesn't parse stays literal text, so
// ordinary art never needs escaping):
//   {名前}        expand the pattern with that name (recursion allowed;
//                 unknown names render literally, depth is capped)
//   {名前*N}      expand it N times (random parts re-rolled each time)
//   [abc]         pick ONE code point from the listed characters at random
//   [abc*N]       pick N times (texture lines in a single token)
//   [x|yz|{p}]    with '|', each alternative is a whole sequence (may nest
//                 refs/brackets); pick one at random
//   {_}           input placeholder: a pattern containing it (directly or via
//                 references) is a 技 (effect) applied to existing text
//                 instead of generated from nothing.
// Probabilistic recursion is the intended idiom: [╱╲|╱{やまなみ}╲] keeps
// growing until the dice or the depth cap stop it.

(function () {

const KEY = 'unicode-app:art-patterns:v1';
const MODES = ['whole', 'char', 'line'];
const MAX_DEPTH = 24;      // {ref} nesting cap: where probabilistic recursion is forced to end
const MAX_OUTPUT = 8000;   // per-expansion output cap (UTF-16 units)
const MAX_TOTAL = 16000;   // cumulative cap across one applyToText() run
const MAX_OPS = 200000;    // node-visit cap: stops zero-output recursion bombs ({a}={a}{a})
const MAX_COUNT = 999;     // *N repeat cap (also enforced by the \d{1,3} in the parser)

const seg = (typeof Intl !== 'undefined' && Intl.Segmenter)
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

function graphemes(str) {
  if (seg) return [...seg.segment(str)].map((s) => s.segment);
  return [...str]; // fallback: code points
}

// ---- parser --------------------------------------------------------------
// Nodes: {t:'text',v} | {t:'input',count} | {t:'ref',name,count,raw}
//        | {t:'choice',alts:[nodes...],count}

function parseBody(src) {
  return parseSeq(String(src), 0, false).nodes;
}

// When inBracket, stops (without consuming) at a top-level '|', ']' or the
// '*N]' count suffix, which parseChoice handles.
function parseSeq(src, start, inBracket) {
  const nodes = [];
  let text = '';
  let i = start;
  const flush = () => { if (text) { nodes.push({ t: 'text', v: text }); text = ''; } };
  while (i < src.length) {
    const ch = src[i];
    if (inBracket && (ch === '|' || ch === ']')) break;
    if (inBracket && ch === '*' && /^\*\d{1,3}\]/.test(src.slice(i, i + 6))) break;
    if (ch === '{') {
      const close = src.indexOf('}', i + 1);
      // Name may not contain syntax metacharacters (sanitizeName strips them
      // from real names anyway); a non-matching {...} stays literal.
      const m = close === -1 ? null : /^([^*{}[\]|]+?)(?:\*(\d{1,3}))?$/.exec(src.slice(i + 1, close));
      if (m) {
        flush();
        const count = Math.min(m[2] ? parseInt(m[2], 10) : 1, MAX_COUNT);
        if (m[1] === '_') nodes.push({ t: 'input', count });
        else nodes.push({ t: 'ref', name: m[1], count, raw: src.slice(i, close + 1) });
        i = close + 1;
        continue;
      }
    } else if (ch === '[') {
      const choice = parseChoice(src, i);
      if (choice) { flush(); nodes.push(choice.node); i = choice.i; continue; }
    }
    text += ch;
    i += 1;
  }
  flush();
  return { nodes, i };
}

function parseChoice(src, start) {
  let i = start + 1; // past '['
  const alts = [];
  let sawPipe = false;
  let count = 1;
  for (;;) {
    const seq = parseSeq(src, i, true);
    alts.push(seq.nodes);
    i = seq.i;
    if (i >= src.length) return null; // unmatched '[' -> literal
    const ch = src[i];
    if (ch === '|') { sawPipe = true; i += 1; continue; }
    if (ch === '*') {
      const m = /^\*(\d{1,3})\]/.exec(src.slice(i, i + 6));
      if (!m) return null; // unreachable given parseSeq's break condition, but guard anyway
      count = Math.min(parseInt(m[1], 10), MAX_COUNT);
      i += m[0].length;
    } else { // ']'
      i += 1;
    }
    break;
  }
  if (!sawPipe) {
    // No '|': pure text content is a code-point class (each code point is an
    // alternative -- code points, not graphemes, so a dice of bare combining
    // marks like [◌̀◌́...] offers each mark separately instead of clumping).
    // Content with refs/brackets but no pipe stays a single sequence.
    const only = alts[0];
    if (only.every((n) => n.t === 'text')) {
      const chars = [...only.map((n) => n.v).join('')];
      if (!chars.length) return null; // '[]' / '[*3]' -> literal
      return { node: { t: 'choice', alts: chars.map((c) => [{ t: 'text', v: c }]), count }, i };
    }
  }
  return { node: { t: 'choice', alts, count }, i };
}

// ---- expansion -----------------------------------------------------------

// resolveBody(name) -> body string, or null when no such pattern exists.
// Returns { text, truncated }: truncated=true when a depth/length/ops cap cut
// the expansion short.
function expand(bodySrc, resolveBody, input = '') {
  const parseCache = new Map(); // {ref*N} re-walks the same body N times
  const parsed = (s) => {
    let nodes = parseCache.get(s);
    if (!nodes) { nodes = parseBody(s); parseCache.set(s, nodes); }
    return nodes;
  };
  let out = '';
  let truncated = false;
  let ops = 0;
  const emit = (s) => {
    if (!s) return;
    if (out.length + s.length > MAX_OUTPUT) {
      out += s.slice(0, MAX_OUTPUT - out.length);
      truncated = true;
    } else {
      out += s;
    }
  };
  function walk(nodes, depth) {
    for (const n of nodes) {
      if (truncated) return;
      if ((ops += 1) > MAX_OPS) { truncated = true; return; }
      if (n.t === 'text') {
        emit(n.v);
      } else if (n.t === 'input') {
        for (let k = 0; k < n.count && !truncated; k += 1) emit(input);
      } else if (n.t === 'ref') {
        const body = resolveBody(n.name);
        if (body == null) { emit(n.raw); continue; } // unknown name -> literal
        if (depth >= MAX_DEPTH) continue;            // recursion cap: cut silently
        for (let k = 0; k < n.count && !truncated; k += 1) walk(parsed(body), depth + 1);
      } else if (n.t === 'choice') {
        for (let k = 0; k < n.count && !truncated; k += 1) {
          walk(n.alts[Math.floor(Math.random() * n.alts.length)], depth);
        }
      }
    }
  }
  walk(parsed(bodySrc), 0);
  return { text: out, truncated };
}

// True when expanding the body would consume input -- {_} directly or via a
// referenced pattern. Such patterns are 技 (applied to text) rather than
// generators. The visited set guards reference cycles.
function needsInput(bodySrc, resolveBody) {
  const visited = new Set();
  const walkNodes = (nodes) => nodes.some((n) => {
    if (n.t === 'input') return true;
    if (n.t === 'choice') return n.alts.some(walkNodes);
    if (n.t === 'ref') {
      if (visited.has(n.name)) return false;
      visited.add(n.name);
      const body = resolveBody(n.name);
      return body != null && walkNodes(parseBody(body));
    }
    return false;
  });
  return walkNodes(parseBody(bodySrc));
}

// Apply a 技 to text. mode:
//   'whole' -- one expansion with {_} = the whole text
//   'char'  -- one expansion per grapheme (whitespace/newlines pass through
//              untouched, so combining-mark effects don't decorate spaces)
//   'line'  -- one expansion per line (empty lines pass through)
// Randomness re-rolls per expansion, so char mode gives per-character dice.
function applyToText(bodySrc, resolveBody, text, mode) {
  if (mode === 'char') {
    let out = '';
    let truncated = false;
    for (const g of graphemes(text)) {
      if (/^\s+$/.test(g)) { out += g; continue; }
      const r = expand(bodySrc, resolveBody, g);
      out += r.text;
      if (r.truncated) truncated = true;
      if (out.length > MAX_TOTAL) { out = out.slice(0, MAX_TOTAL); truncated = true; break; }
    }
    return { text: out, truncated };
  }
  if (mode === 'line') {
    let truncated = false;
    let total = 0;
    const lines = text.split('\n').map((line) => {
      if (!line || total > MAX_TOTAL) return line;
      const r = expand(bodySrc, resolveBody, line);
      if (r.truncated) truncated = true;
      total += r.text.length;
      return r.text;
    });
    return { text: lines.join('\n'), truncated };
  }
  return expand(bodySrc, resolveBody, text);
}

// ---- store ---------------------------------------------------------------

function makeId() {
  return `pat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Syntax metacharacters can't appear in names ({名前} references would become
// unparseable), nor can newlines.
function sanitizeName(name) {
  return String(name == null ? '' : name).replace(/[{}[\]|*\r\n]/g, '').trim().slice(0, 30);
}

function normalizeItem(p) {
  return {
    id: p.id,
    name: sanitizeName(p.name) || 'パターン',
    body: p.body,
    mode: MODES.includes(p.mode) ? p.mode : 'whole',
    createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
  };
}

// First-run samples, doubling as live syntax documentation (characters taken
// from arts.md so every glyph is known to exist). Seeded only when the store
// key is absent -- deleting them doesn't bring them back.
function seedItems() {
  return [
    // probabilistic recursion: nests ╱{...}╲ until the dice stop it
    { name: 'やまなみ', body: '[╱╲|╱{やまなみ}╲|╱{やまなみ}╲]' },
    // linear recursion: a mountain ridge that keeps growing to the right
    { name: '連山', body: '[𓈉|𓈊{連山}|𓈋{連山}|𓈉{連山}]' },
    // code-point dice * N = one-token texture line (space is an option too)
    { name: '波もよう', body: '[࿓࿔ *32]' },
    // '|' alternatives weight the blanks; three literal newlines = 3 rows
    { name: '星空', body: '[𒀯|✦|　|　|　*14]\n[✧|𒀯|　|　|　*14]\n[𒀯|✦|　|　|　*14]' },
    { name: '石垣', body: '[𓉡𓉢𓉣*9]\n[𓉡𓉢𓉣*9]\n[𓉡𓉢𓉣*9]' },
    // 技 (contain {_}): applied to the output area's text
    { name: 'ねこダンス', body: '₍₍(ง{_})ว⁾⁾', mode: 'whole' },
    { name: 'こだま', body: '₍₍⁽⁽{_}₎₎⁾⁾', mode: 'char' },
    // U+0FC6 TIBETAN SYMBOL PADMA GDAN (combining), as in ⌬࿆
    { name: 'ゆらぎ', body: '{_}࿆', mode: 'char' },
    // two random combining marks per character (zalgo-lite):
    // U+0300-0304,0308,033D,035B
    { name: 'まじない', body: '{_}[̀́̂̃̄̈̽͛*2]', mode: 'char' },
  ].map((p) => normalizeItem({ ...p, id: makeId() }));
}

class ArtPatterns {
  constructor() {
    this.state = this.load();
    this.subs = new Set();
    // Persist first-run seeds immediately so their ids stay stable across
    // reloads (load() only seeds when the key is entirely absent).
    try { if (!localStorage.getItem(KEY)) this.save(); } catch { /* ignore */ }
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { items: seedItems() };
      const parsed = JSON.parse(raw);
      const items = parsed && Array.isArray(parsed.items) ? parsed.items : [];
      return {
        items: items
          .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string'
            && typeof p.body === 'string' && p.body)
          .map(normalizeItem),
      };
    } catch {
      return { items: seedItems() };
    }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* storage disabled / full */ }
  }

  get items() { return this.state.items; }

  find(id) { return this.state.items.find((p) => p.id === id) || null; }

  // {名前} reference resolution target. Names are kept unique (see
  // uniqueName), so first match is the only match.
  bodyByName(name) {
    const pat = this.state.items.find((p) => p.name === name);
    return pat ? pat.body : null;
  }

  uniqueName(base, excludeId = null) {
    const wanted = sanitizeName(base) || 'パターン';
    const taken = new Set(this.state.items.filter((p) => p.id !== excludeId).map((p) => p.name));
    if (!taken.has(wanted)) return wanted;
    // Count up from the stem, not the whole taken name -- duplicating
    // 「やまなみ 2」 should yield 「やまなみ 3」, not 「やまなみ 2 2」.
    const stem = wanted.replace(/ \d+$/, '');
    let suffix = 2;
    let name = `${stem} ${suffix}`;
    while (taken.has(name)) { suffix += 1; name = `${stem} ${suffix}`; }
    return name;
  }

  // Newest first, same as UnicodeArt works.
  add({ name, body, mode }) {
    if (!body) return null;
    const item = normalizeItem({ id: makeId(), name: this.uniqueName(name), body, mode });
    this.state.items.unshift(item);
    this.save();
    this.emit();
    return item;
  }

  update(id, { name, body, mode }) {
    const item = this.find(id);
    if (!item || !body) return false;
    item.name = this.uniqueName(name, id);
    item.body = body;
    item.mode = MODES.includes(mode) ? mode : item.mode;
    this.save();
    this.emit();
    return true;
  }

  duplicate(id) {
    const item = this.find(id);
    if (!item) return null;
    const copy = normalizeItem({ id: makeId(), name: this.uniqueName(item.name), body: item.body, mode: item.mode });
    this.state.items.splice(this.state.items.indexOf(item) + 1, 0, copy);
    this.save();
    this.emit();
    return copy;
  }

  remove(id) {
    const before = this.state.items.length;
    this.state.items = this.state.items.filter((p) => p.id !== id);
    if (this.state.items.length !== before) {
      this.save();
      this.emit();
    }
  }

  subscribe(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit() { this.subs.forEach((fn) => fn()); }
}

window.App = window.App || {};
window.App.ArtPatterns = {
  ArtPatterns,
  sanitizeName,
  Engine: { parseBody, expand, applyToText, needsInput },
};

})();
