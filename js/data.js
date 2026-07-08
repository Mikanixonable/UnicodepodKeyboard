// Core Unicode data + codepoint helpers.
// Keep SEGMENTS in sync with tools/gen_data.py.
//
// This runs as a classic <script> (no import/export) so the app can be
// opened directly as a local file (file://), where ES module loading and
// fetch() of local resources are blocked by browsers. Unicode data is
// loaded the same way: data/blocks.js and data/categories.js are plain
// <script> tags that assign to window.UNICODE_* before this file runs;
// data/names.js (large, lazily needed) is injected as a <script> tag on
// demand instead of fetched.

(function () {

// Covered ranges come from data/segments.js (generated), so scope lives in a
// single place. Fallback matches the generator's default plane trimming.
const SEGMENTS = window.UNICODE_SEGMENTS || [[0x0000, 0xFFFF], [0x10000, 0x323AF], [0xE0000, 0xE01EF]];
const COLS = 16;
const ROW_H = 58; // px, must match --row-h in CSS

let blocks = [];
let catRuns = [];         // sorted [start, end, "Cat"]
let namesMap = null;      // lazy
let namesPromise = null;

// ---- loading -------------------------------------------------------------

function loadCore() {
  blocks = window.UNICODE_BLOCKS || [];
  catRuns = window.UNICODE_CATEGORIES || [];
  return Promise.resolve();
}

function ensureNames() {
  if (namesMap) return Promise.resolve(namesMap);
  if (!namesPromise) {
    namesPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'data/names.js';
      s.onload = () => { namesMap = window.UNICODE_NAMES || {}; resolve(namesMap); };
      s.onerror = () => reject(new Error('data/names.js の読み込みに失敗しました'));
      document.head.appendChild(s);
    });
  }
  return namesPromise;
}

// ---- basic helpers -------------------------------------------------------

function hex(cp) {
  return cp.toString(16).toUpperCase().padStart(4, '0');
}

function inScope(cp) {
  return SEGMENTS.some(([s, e]) => cp >= s && cp <= e);
}

function categoryOf(cp) {
  let lo = 0, hi = catRuns.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, r = catRuns[mid];
    if (cp < r[0]) hi = mid - 1;
    else if (cp > r[1]) lo = mid + 1;
    else return r[2];
  }
  return 'Cn';
}

function isAssigned(cp) {
  return categoryOf(cp) !== 'Cn';
}

// Cells that get no interactive glyph at all.
function isEmptyCell(cp) {
  const c = categoryOf(cp);
  return c === 'Cn' || c === 'Cs' || c === 'Cc';
}

// Assigned + something meaningful to insert.
function isInsertable(cp) {
  return !isEmptyCell(cp);
}

// Category that renders no visible ink (space / format) -> show a placeholder.
function isBlankGlyph(cp) {
  const c = categoryOf(cp);
  return c === 'Zs' || c === 'Zl' || c === 'Zp' || c === 'Cf';
}

function isCombining(cp) {
  return categoryOf(cp)[0] === 'M';
}

function glyphFor(cp) {
  const ch = String.fromCodePoint(cp);
  return isCombining(cp) ? '◌' + ch : ch;
}

// ---- blocks --------------------------------------------------------------

function blockOf(cp) {
  let lo = 0, hi = blocks.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1, b = blocks[m];
    if (cp < b.s) hi = m - 1;
    else if (cp > b.e) lo = m + 1;
    else return b;
  }
  return null;
}

function getBlocks() {
  return blocks;
}

// ---- attribute groups (for color coding) ---------------------------------

// Official Unicode blocks whose content is predominantly emoji/pictographs.
// General_Category alone can't tell "So (symbol)" apart from "So (emoji)",
// so this is a name-based override applied after category classification.
const EMOJI_BLOCK_RE = /Emoticons|Pictographs|Transport and Map/i;

// Collapses a General_Category code down to one of a small set of groups
// used for color coding, in both the grid and the block picker.
function categoryGroup(cat) {
  if (cat === 'Cs') return 'surrogate';
  if (cat === 'Co') return 'private';
  if (cat === 'Cc') return 'control';
  if (cat === 'Cf') return 'format';
  if (cat === 'Cn') return 'unassigned';
  switch (cat[0]) {
    case 'L': return 'letter';
    case 'M': return 'mark';
    case 'N': return 'number';
    case 'P': return 'punct';
    case 'S': return 'symbol';
    case 'Z': return 'separator';
    default: return 'unassigned';
  }
}

// Attribute group of a single codepoint (drives grid cell color coding).
function groupOf(cp) {
  const g = categoryGroup(categoryOf(cp));
  if (g === 'symbol') {
    const b = blockOf(cp);
    if (b && EMOJI_BLOCK_RE.test(b.n)) return 'emoji';
  }
  return g;
}

// First run index whose end is >= s (catRuns is sorted, non-overlapping).
function catRunLowerBound(s) {
  let lo = 0, hi = catRuns.length - 1, idx = catRuns.length;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (catRuns[mid][1] >= s) { idx = mid; hi = mid - 1; } else lo = mid + 1;
  }
  return idx;
}

// Dominant attribute group across a whole codepoint range (drives the block
// picker swatch). Unassigned codepoints don't count towards the total unless
// the entire range is unassigned, so a block with a handful of assigned
// characters still gets a meaningful color instead of always reading empty.
function dominantGroupForRange(s, e) {
  const totals = {};
  let assignedTotal = 0;
  for (let i = catRunLowerBound(s); i < catRuns.length; i++) {
    const [rs, re, cat] = catRuns[i];
    if (rs > e) break;
    const os = Math.max(rs, s), oe = Math.min(re, e);
    if (os > oe || cat === 'Cn') continue;
    const g = categoryGroup(cat);
    const len = oe - os + 1;
    totals[g] = (totals[g] || 0) + len;
    assignedTotal += len;
  }
  if (assignedTotal === 0) return 'unassigned';
  let best = null, bestLen = -1;
  for (const g in totals) if (totals[g] > bestLen) { best = g; bestLen = totals[g]; }
  return best;
}

function blockGroup(block) {
  const g = dominantGroupForRange(block.s, block.e);
  if (g === 'symbol' && EMOJI_BLOCK_RE.test(block.n)) return 'emoji';
  return g;
}

// ---- bilingual block labels -----------------------------------------------

// Hand-curated translations (data/block_names_ja.js) don't cover every one of
// the ~340 official blocks -- many are little-known historic scripts. Where a
// systematic "<base> <suffix>" variant (e.g. "... Extended-A") is missing but
// its base name is known, derive the translation instead of leaving it blank.
const JA_SUFFIXES = [
  [' Supplement', '補助'],
  [' Extended-A', '拡張A'], [' Extended-B', '拡張B'], [' Extended-C', '拡張C'],
  [' Extended-D', '拡張D'], [' Extended-E', '拡張E'], [' Extended-F', '拡張F'],
  [' Extended-G', '拡張G'],
  [' Extension A', '拡張A'], [' Extension B', '拡張B'], [' Extension C', '拡張C'],
  [' Extension D', '拡張D'], [' Extension E', '拡張E'], [' Extension F', '拡張F'],
  [' Extension G', '拡張G'], [' Extension H', '拡張H'],
  [' Additional', '追加'],
];

// { ja, en } for a block name. `ja` is null when no translation is known or
// derivable -- callers should fall back to showing `en` alone rather than
// inventing a translation.
function blockLabel(name) {
  const dict = window.UNICODE_BLOCK_NAMES_JA || {};
  let ja = dict[name] || null;
  if (!ja) {
    for (const [suf, jaSuf] of JA_SUFFIXES) {
      if (name.endsWith(suf) && dict[name.slice(0, -suf.length)]) {
        ja = dict[name.slice(0, -suf.length)] + jaSuf;
        break;
      }
    }
  }
  return { ja, en: name };
}

// ---- row model (virtual grid) -------------------------------------------

const segRows = SEGMENTS.map(([s, e]) => Math.ceil((e - s + 1) / COLS));
const totalRows = segRows.reduce((a, b) => a + b, 0);

function rowToBaseCp(row) {
  let acc = 0;
  for (let i = 0; i < SEGMENTS.length; i++) {
    if (row < acc + segRows[i]) return SEGMENTS[i][0] + (row - acc) * COLS;
    acc += segRows[i];
  }
  return null;
}

function cpToRow(cp) {
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

function neighborInsertable(cp, dir) {
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

// Mirrors ALGORITHMIC in tools/gen_data.py: these codepoints are excluded from
// names.js and their names are reconstructed here.
const CJK_UNIFIED = [[0x3400, 0x4DBF], [0x4E00, 0x9FFF],
  [0x20000, 0x2A6DF], [0x2A700, 0x2EE5F], [0x30000, 0x323AF]];
const CJK_COMPAT = [[0xF900, 0xFAFF], [0x2F800, 0x2FA1F]];
const inAny = (cp, ranges) => ranges.some(([s, e]) => cp >= s && cp <= e);

function algorithmicName(cp) {
  if (inAny(cp, CJK_UNIFIED)) return `CJK UNIFIED IDEOGRAPH-${hex(cp)}`;
  if (inAny(cp, CJK_COMPAT)) return `CJK COMPATIBILITY IDEOGRAPH-${hex(cp)}`;
  if (cp >= 0xAC00 && cp <= 0xD7A3) return hangulName(cp);
  return null;
}

// Best-effort synchronous name (uses names map only if already loaded).
function nameSync(cp) {
  const a = algorithmicName(cp);
  if (a) return a;
  if (namesMap) return namesMap[hex(cp)] || null;
  return null;
}

async function getName(cp) {
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

function categoryDesc(cat) {
  return CAT_DESC[cat] || cat;
}

function utf8Bytes(cp) {
  return [...new TextEncoder().encode(String.fromCodePoint(cp))]
    .map(b => b.toString(16).toUpperCase().padStart(2, '0'));
}

function utf16Units(cp) {
  const s = String.fromCodePoint(cp), u = [];
  for (let i = 0; i < s.length; i++)
    u.push(s.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0'));
  return u;
}

window.App = window.App || {};
window.App.Data = {
  SEGMENTS, COLS, ROW_H, segRows, totalRows,
  loadCore, ensureNames,
  hex, inScope, categoryOf, isAssigned, isEmptyCell, isInsertable, isBlankGlyph,
  isCombining, glyphFor, blockOf, getBlocks, rowToBaseCp, cpToRow,
  neighborInsertable, algorithmicName, nameSync, getName, categoryDesc,
  utf8Bytes, utf16Units,
  categoryGroup, groupOf, dominantGroupForRange, blockGroup, blockLabel,
};

})();
