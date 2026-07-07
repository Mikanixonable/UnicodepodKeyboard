// Core Unicode data + codepoint helpers.
// Keep SEGMENTS in sync with tools/gen_data.py.

export const SEGMENTS = [[0x0000, 0xFFFF], [0x1D000, 0x1FBFF]];
export const COLS = 16;
export const ROW_H = 58; // px, must match --row-h in CSS

let blocks = [];
let catRuns = [];         // sorted [start, end, "Cat"]
let namesMap = null;      // lazy
let namesPromise = null;

// ---- loading -------------------------------------------------------------

export async function loadCore() {
  const [b, c] = await Promise.all([
    fetch('data/blocks.json').then(r => r.json()),
    fetch('data/categories.json').then(r => r.json()),
  ]);
  blocks = b;
  catRuns = c;
}

export function ensureNames() {
  if (namesMap) return Promise.resolve(namesMap);
  if (!namesPromise) {
    namesPromise = fetch('data/names.json')
      .then(r => r.json())
      .then(m => (namesMap = m));
  }
  return namesPromise;
}

// ---- basic helpers -------------------------------------------------------

export function hex(cp) {
  return cp.toString(16).toUpperCase().padStart(4, '0');
}

export function inScope(cp) {
  return SEGMENTS.some(([s, e]) => cp >= s && cp <= e);
}

export function categoryOf(cp) {
  let lo = 0, hi = catRuns.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, r = catRuns[mid];
    if (cp < r[0]) hi = mid - 1;
    else if (cp > r[1]) lo = mid + 1;
    else return r[2];
  }
  return 'Cn';
}

export function isAssigned(cp) {
  return categoryOf(cp) !== 'Cn';
}

// Cells that get no interactive glyph at all.
export function isEmptyCell(cp) {
  const c = categoryOf(cp);
  return c === 'Cn' || c === 'Cs' || c === 'Cc';
}

// Assigned + something meaningful to insert.
export function isInsertable(cp) {
  return !isEmptyCell(cp);
}

// Category that renders no visible ink (space / format) -> show a placeholder.
export function isBlankGlyph(cp) {
  const c = categoryOf(cp);
  return c === 'Zs' || c === 'Zl' || c === 'Zp' || c === 'Cf';
}

export function isCombining(cp) {
  return categoryOf(cp)[0] === 'M';
}

export function glyphFor(cp) {
  const ch = String.fromCodePoint(cp);
  return isCombining(cp) ? '◌' + ch : ch;
}

// ---- blocks --------------------------------------------------------------

export function blockOf(cp) {
  let lo = 0, hi = blocks.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1, b = blocks[m];
    if (cp < b.s) hi = m - 1;
    else if (cp > b.e) lo = m + 1;
    else return b;
  }
  return null;
}

export function getBlocks() {
  return blocks;
}

// ---- row model (virtual grid) -------------------------------------------

export const segRows = SEGMENTS.map(([s, e]) => Math.ceil((e - s + 1) / COLS));
export const totalRows = segRows.reduce((a, b) => a + b, 0);

export function rowToBaseCp(row) {
  let acc = 0;
  for (let i = 0; i < SEGMENTS.length; i++) {
    if (row < acc + segRows[i]) return SEGMENTS[i][0] + (row - acc) * COLS;
    acc += segRows[i];
  }
  return null;
}

export function cpToRow(cp) {
  let acc = 0;
  for (let i = 0; i < SEGMENTS.length; i++) {
    const [s, e] = SEGMENTS[i];
    if (cp >= s && cp <= e) return acc + Math.floor((cp - s) / COLS);
    acc += segRows[i];
  }
  return null;
}

// ---- stepping across scope (for modal prev/next) -------------------------

function stepCp(cp, dir) {
  const n = cp + dir;
  for (const [s, e] of SEGMENTS) if (n >= s && n <= e) return n;
  if (dir > 0) {
    for (const [s] of SEGMENTS) if (s > cp) return s;
    return null;
  }
  for (let i = SEGMENTS.length - 1; i >= 0; i--) if (SEGMENTS[i][1] < cp) return SEGMENTS[i][1];
  return null;
}

export function neighborInsertable(cp, dir) {
  let n = stepCp(cp, dir);
  while (n != null) {
    if (isInsertable(n)) return n;
    n = stepCp(n, dir);
  }
  return null;
}

// ---- names ---------------------------------------------------------------

function hangulName(cp) {
  const SBase = 0xAC00, LCount = 19, VCount = 21, TCount = 28, NCount = VCount * TCount;
  const L = ['G', 'GG', 'N', 'D', 'DD', 'R', 'M', 'B', 'BB', 'S', 'SS', '', 'J', 'JJ', 'C', 'K', 'T', 'P', 'H'];
  const V = ['A', 'AE', 'YA', 'YAE', 'EO', 'E', 'YEO', 'YE', 'O', 'WA', 'WAE', 'OE', 'YO', 'U', 'WEO', 'WE', 'WI', 'YU', 'EU', 'YI', 'I'];
  const T = ['', 'G', 'GG', 'GS', 'N', 'NJ', 'NH', 'D', 'L', 'LG', 'LM', 'LB', 'LS', 'LT', 'LP', 'LH', 'M', 'B', 'BS', 'S', 'SS', 'NG', 'J', 'C', 'K', 'T', 'P', 'H'];
  const idx = cp - SBase;
  const l = Math.floor(idx / NCount);
  const v = Math.floor((idx % NCount) / TCount);
  const t = idx % TCount;
  return 'HANGUL SYLLABLE ' + L[l] + V[v] + T[t];
}

export function algorithmicName(cp) {
  if ((cp >= 0x3400 && cp <= 0x4DBF) || (cp >= 0x4E00 && cp <= 0x9FFF))
    return `CJK UNIFIED IDEOGRAPH-${hex(cp)}`;
  if (cp >= 0xF900 && cp <= 0xFAFF)
    return `CJK COMPATIBILITY IDEOGRAPH-${hex(cp)}`;
  if (cp >= 0xAC00 && cp <= 0xD7A3)
    return hangulName(cp);
  return null;
}

// Best-effort synchronous name (uses names map only if already loaded).
export function nameSync(cp) {
  const a = algorithmicName(cp);
  if (a) return a;
  if (namesMap) return namesMap[hex(cp)] || null;
  return null;
}

export async function getName(cp) {
  const a = algorithmicName(cp);
  if (a) return a;
  const map = await ensureNames();
  return map[hex(cp)] || null;
}

// ---- encoding info (for modal) ------------------------------------------

const CAT_DESC = {
  Lu: 'Letter, Uppercase', Ll: 'Letter, Lowercase', Lt: 'Letter, Titlecase',
  Lm: 'Letter, Modifier', Lo: 'Letter, Other',
  Mn: 'Mark, Nonspacing', Mc: 'Mark, Spacing Combining', Me: 'Mark, Enclosing',
  Nd: 'Number, Decimal Digit', Nl: 'Number, Letter', No: 'Number, Other',
  Pc: 'Punctuation, Connector', Pd: 'Punctuation, Dash', Ps: 'Punctuation, Open',
  Pe: 'Punctuation, Close', Pi: 'Punctuation, Initial quote', Pf: 'Punctuation, Final quote',
  Po: 'Punctuation, Other', Sm: 'Symbol, Math', Sc: 'Symbol, Currency',
  Sk: 'Symbol, Modifier', So: 'Symbol, Other', Zs: 'Separator, Space',
  Zl: 'Separator, Line', Zp: 'Separator, Paragraph', Cc: 'Other, Control',
  Cf: 'Other, Format', Cs: 'Other, Surrogate', Co: 'Other, Private Use',
  Cn: 'Other, Not Assigned',
};

export function categoryDesc(cat) {
  return CAT_DESC[cat] || cat;
}

export function utf8Bytes(cp) {
  return [...new TextEncoder().encode(String.fromCodePoint(cp))]
    .map(b => b.toString(16).toUpperCase().padStart(2, '0'));
}

export function utf16Units(cp) {
  const s = String.fromCodePoint(cp), u = [];
  for (let i = 0; i < s.length; i++)
    u.push(s.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0'));
  return u;
}
