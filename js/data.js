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
// Mutable (not const): the mobile layout switches this to 8 (see
// setCols()/grid.js), which changes how many codepoints fit per row and
// therefore the whole row model below (segRows/totalRows).
let COLS = 16;
const ROW_H = 58; // px, must match --row-h in CSS

let blocks = [];
let catRuns = [];         // sorted [start, end, "Cat"]
let ageRuns = [];         // sorted [start, end, "X.Y"], gaps = unassigned
let namesMap = null;      // lazy
let namesPromise = null;
let descMap = null;       // lazy
let descPromise = null;

// ---- loading -------------------------------------------------------------

function loadCore() {
  blocks = window.UNICODE_BLOCKS || [];
  catRuns = window.UNICODE_CATEGORIES || [];
  ageRuns = window.UNICODE_AGE || [];
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

function ensureDescriptions() {
  if (descMap) return Promise.resolve(descMap);
  if (!descPromise) {
    descPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'data/descriptions.js';
      s.onload = () => { descMap = window.UNICODE_DESCRIPTIONS || {}; resolve(descMap); };
      s.onerror = () => reject(new Error('data/descriptions.js の読み込みに失敗しました'));
      document.head.appendChild(s);
    });
  }
  return descPromise;
}

// Best-effort synchronous description (uses the map only if already loaded).
function descriptionSync(cp) {
  return descMap ? (descMap[hex(cp)] || null) : null;
}

async function getDescription(cp) {
  const map = await ensureDescriptions();
  return map[hex(cp)] || null;
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
  return c === 'Cn' || c === 'Cs';
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

// Up to n representative codepoints from a block, for a small glyph preview
// in the block picker. Skips control/blank codepoints (nothing to show) and
// combining marks (nothing to combine with here); stops scanning as soon as
// n are found, so this stays cheap even for huge CJK ideograph blocks.
function sampleGlyphs(block, n = 3) {
  const out = [];
  for (let cp = block.s; cp <= block.e && out.length < n; cp++) {
    if (!isInsertable(cp) || isBlankGlyph(cp) || isCombining(cp)) continue;
    if (categoryOf(cp) === 'Cc') continue;
    out.push(cp);
  }
  return out;
}

// ---- planes ---------------------------------------------------------------

const PLANE_LABELS = {
  0: ['基本多言語面', 'Basic Multilingual Plane (BMP)'],
  1: ['追加多言語面', 'Supplementary Multilingual Plane (SMP)'],
  2: ['追加漢字面', 'Supplementary Ideographic Plane (SIP)'],
  3: ['第三漢字面', 'Tertiary Ideographic Plane (TIP)'],
  14: ['追加特殊用途面', 'Supplementary Special-purpose Plane (SSP)'],
  15: ['私用面 A', 'Supplementary Private Use Area-A'],
  16: ['私用面 B', 'Supplementary Private Use Area-B'],
};

function planeOf(cp) {
  return cp >>> 16;
}

function planeInfo(plane) {
  const [ja, en] = PLANE_LABELS[plane] || ['未割り当て面', 'Unassigned Plane'];
  return { num: plane, ja, en };
}

// ---- attribute groups (for color coding) ---------------------------------

// Official Unicode blocks whose content is predominantly emoji/pictographs.
// General_Category alone can't tell "So (symbol)" apart from "So (emoji)",
// so this is a name-based override applied after category classification.
const EMOJI_BLOCK_RE = /Emoticons|Pictographs|Transport and Map/i;

// Display labels for each category group -- single source shared by the
// legend, block picker, and character detail modal, so wording and icon
// color always stay in sync wherever a group appears.
const GROUP_LABELS = {
  letter: ['文字', 'Letter'], mark: ['記号(結合)', 'Mark'], number: ['数字', 'Number'], punct: ['句読点', 'Punctuation'],
  symbol: ['記号', 'Symbol'], emoji: ['絵文字', 'Emoji'], separator: ['区切り', 'Separator'], control: ['制御', 'Control'],
  format: ['書式', 'Format'], surrogate: ['サロゲート', 'Surrogate'], private: ['私用領域', 'Private Use'], unassigned: ['未割り当て', 'Unassigned'],
};

function groupLabel(key) {
  const [ja, en] = GROUP_LABELS[key] || [key, key];
  return { ja, en };
}

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

// ---- Unicode age / "added in version" color coding ------------------------

// Version each codepoint was first assigned in ("6.0" etc.), or null for
// codepoints with no entry in DerivedAge.txt (i.e. still unassigned).
function ageOf(cp) {
  let lo = 0, hi = ageRuns.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, r = ageRuns[mid];
    if (cp < r[0]) hi = mid - 1;
    else if (cp > r[1]) lo = mid + 1;
    else return r[2];
  }
  return null;
}

// Buckets Unicode's ~50 version numbers into a handful of "eras" so the
// color legend stays readable. Boundaries follow major/notable releases.
const ERAS = [
  { key: 'e1', max: 1.1, ja: '1.x', en: 'v1.x (1991–93)' },
  { key: 'e2', max: 3.2, ja: '2–3.x', en: 'v2–3.x (1996–2002)' },
  { key: 'e3', max: 5.2, ja: '4–5.x', en: 'v4–5.x (2003–2009)' },
  { key: 'e4', max: 6.3, ja: '6.x', en: 'v6.x (2010–2013)' },
  { key: 'e5', max: 8.0, ja: '7–8.x', en: 'v7–8.x (2014–2015)' },
  { key: 'e6', max: 10.0, ja: '9–10.x', en: 'v9–10.x (2016–2017)' },
  { key: 'e7', max: 12.1, ja: '11–12.x', en: 'v11–12.x (2018–2019)' },
  { key: 'e8', max: 14.0, ja: '13–14.x', en: 'v13–14.x (2020–2021)' },
  { key: 'e9', max: 16.0, ja: '15–16.x', en: 'v15–16.x (2022–2024)' },
  { key: 'e10', max: Infinity, ja: '17.x以降', en: 'v17.x+ (2025–)' },
];

function eraForVersion(v) {
  for (const e of ERAS) if (v <= e.max) return e.key;
  return ERAS[ERAS.length - 1].key;
}

// Age "attribute group" of a single codepoint (drives grid cell color coding
// in age mode). Mirrors groupOf()'s role for category mode.
function eraOf(cp) {
  const age = ageOf(cp);
  return age == null ? 'unassigned' : eraForVersion(parseFloat(age));
}

function eraLabel(key) {
  if (key === 'unassigned') return { ja: '未割り当て', en: 'Unassigned' };
  const e = ERAS.find((x) => x.key === key);
  return e ? { ja: e.ja, en: e.en } : { ja: '?', en: '?' };
}

// First run index whose end is >= s (ageRuns is sorted, non-overlapping).
function ageRunLowerBound(s) {
  let lo = 0, hi = ageRuns.length - 1, idx = ageRuns.length;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ageRuns[mid][1] >= s) { idx = mid; hi = mid - 1; } else lo = mid + 1;
  }
  return idx;
}

// Dominant era across a whole codepoint range (drives the block picker
// swatch in age mode). Same "assigned codepoints only" logic as
// dominantGroupForRange.
function dominantEraForRange(s, e) {
  const totals = {};
  let assignedTotal = 0;
  for (let i = ageRunLowerBound(s); i < ageRuns.length; i++) {
    const [rs, re, ver] = ageRuns[i];
    if (rs > e) break;
    const os = Math.max(rs, s), oe = Math.min(re, e);
    if (os > oe) continue;
    const era = eraForVersion(parseFloat(ver));
    const len = oe - os + 1;
    totals[era] = (totals[era] || 0) + len;
    assignedTotal += len;
  }
  if (assignedTotal === 0) return 'unassigned';
  let best = null, bestLen = -1;
  for (const era in totals) if (totals[era] > bestLen) { best = era; bestLen = totals[era]; }
  return best;
}

// Mode-aware group lookups shared by the grid, boards, and block picker.
// mode: 'none' | 'category' | 'age'. Returns null for 'none' (= no color).
function groupForMode(mode, cp) {
  if (mode === 'none') return null;
  return mode === 'age' ? eraOf(cp) : groupOf(cp);
}

function blockGroupForMode(mode, block) {
  if (mode === 'none') return null;
  return mode === 'age' ? dominantEraForRange(block.s, block.e) : blockGroup(block);
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

function computeSegRows() {
  return SEGMENTS.map(([s, e]) => Math.ceil((e - s + 1) / COLS));
}

let segRows = computeSegRows();
let totalRows = segRows.reduce((a, b) => a + b, 0);

// Switches the row width (16 on desktop, 8 on mobile -- see grid.js), and
// recomputes the row model to match. No-op if unchanged.
function setCols(n) {
  if (n === COLS) return;
  COLS = n;
  segRows = computeSegRows();
  totalRows = segRows.reduce((a, b) => a + b, 0);
}

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

// C0 (0x00-0x1F, 0x7F) and C1 (0x80-0x9F) control codes have no
// General_Category name (UnicodeData.txt leaves them "<control>"); these are
// the standard ISO/IEC 6429 short mnemonics and full aliases instead.
const CONTROL_NAMES = {
  0x00: ['NUL', 'NULL'], 0x01: ['SOH', 'START OF HEADING'], 0x02: ['STX', 'START OF TEXT'],
  0x03: ['ETX', 'END OF TEXT'], 0x04: ['EOT', 'END OF TRANSMISSION'], 0x05: ['ENQ', 'ENQUIRY'],
  0x06: ['ACK', 'ACKNOWLEDGE'], 0x07: ['BEL', 'BELL'], 0x08: ['BS', 'BACKSPACE'],
  0x09: ['HT', 'CHARACTER TABULATION'], 0x0A: ['LF', 'LINE FEED'], 0x0B: ['VT', 'LINE TABULATION'],
  0x0C: ['FF', 'FORM FEED'], 0x0D: ['CR', 'CARRIAGE RETURN'], 0x0E: ['SO', 'SHIFT OUT'],
  0x0F: ['SI', 'SHIFT IN'], 0x10: ['DLE', 'DATA LINK ESCAPE'], 0x11: ['DC1', 'DEVICE CONTROL ONE'],
  0x12: ['DC2', 'DEVICE CONTROL TWO'], 0x13: ['DC3', 'DEVICE CONTROL THREE'],
  0x14: ['DC4', 'DEVICE CONTROL FOUR'], 0x15: ['NAK', 'NEGATIVE ACKNOWLEDGE'],
  0x16: ['SYN', 'SYNCHRONOUS IDLE'], 0x17: ['ETB', 'END OF TRANSMISSION BLOCK'],
  0x18: ['CAN', 'CANCEL'], 0x19: ['EM', 'END OF MEDIUM'], 0x1A: ['SUB', 'SUBSTITUTE'],
  0x1B: ['ESC', 'ESCAPE'], 0x1C: ['FS', 'INFORMATION SEPARATOR FOUR'],
  0x1D: ['GS', 'INFORMATION SEPARATOR THREE'], 0x1E: ['RS', 'INFORMATION SEPARATOR TWO'],
  0x1F: ['US', 'INFORMATION SEPARATOR ONE'], 0x7F: ['DEL', 'DELETE'],
  0x80: ['PAD', 'PADDING CHARACTER'], 0x81: ['HOP', 'HIGH OCTET PRESET'],
  0x82: ['BPH', 'BREAK PERMITTED HERE'], 0x83: ['NBH', 'NO BREAK HERE'],
  0x84: ['IND', 'INDEX'], 0x85: ['NEL', 'NEXT LINE'], 0x86: ['SSA', 'START OF SELECTED AREA'],
  0x87: ['ESA', 'END OF SELECTED AREA'], 0x88: ['HTS', 'CHARACTER TABULATION SET'],
  0x89: ['HTJ', 'CHARACTER TABULATION WITH JUSTIFICATION'], 0x8A: ['VTS', 'LINE TABULATION SET'],
  0x8B: ['PLD', 'PARTIAL LINE FORWARD'], 0x8C: ['PLU', 'PARTIAL LINE BACKWARD'],
  0x8D: ['RI', 'REVERSE LINE FEED'], 0x8E: ['SS2', 'SINGLE SHIFT TWO'],
  0x8F: ['SS3', 'SINGLE SHIFT THREE'], 0x90: ['DCS', 'DEVICE CONTROL STRING'],
  0x91: ['PU1', 'PRIVATE USE ONE'], 0x92: ['PU2', 'PRIVATE USE TWO'],
  0x93: ['STS', 'SET TRANSMIT STATE'], 0x94: ['CCH', 'CANCEL CHARACTER'],
  0x95: ['MW', 'MESSAGE WAITING'], 0x96: ['SPA', 'START OF GUARDED AREA'],
  0x97: ['EPA', 'END OF GUARDED AREA'], 0x98: ['SOS', 'START OF STRING'],
  0x99: ['SGCI', 'SINGLE GRAPHIC CHARACTER INTRODUCER'], 0x9A: ['SCI', 'SINGLE CHARACTER INTRODUCER'],
  0x9B: ['CSI', 'CONTROL SEQUENCE INTRODUCER'], 0x9C: ['ST', 'STRING TERMINATOR'],
  0x9D: ['OSC', 'OPERATING SYSTEM COMMAND'], 0x9E: ['PM', 'PRIVACY MESSAGE'],
  0x9F: ['APC', 'APPLICATION PROGRAM COMMAND'],
};

function controlAbbr(cp) {
  const entry = CONTROL_NAMES[cp];
  return entry ? entry[0] : null;
}

function algorithmicName(cp) {
  if (inAny(cp, CJK_UNIFIED)) return `CJK UNIFIED IDEOGRAPH-${hex(cp)}`;
  if (inAny(cp, CJK_COMPAT)) return `CJK COMPATIBILITY IDEOGRAPH-${hex(cp)}`;
  if (cp >= 0xAC00 && cp <= 0xD7A3) return hangulName(cp);
  const control = CONTROL_NAMES[cp];
  if (control) return `<control-${hex(cp)}> (${control[1]})`;
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
  SEGMENTS, ROW_H,
  loadCore, ensureNames, ensureDescriptions, setCols,
  hex, inScope, categoryOf, isAssigned, isEmptyCell, isInsertable, isBlankGlyph,
  isCombining, glyphFor, controlAbbr, blockOf, getBlocks, sampleGlyphs, planeOf, planeInfo, rowToBaseCp, cpToRow,
  neighborInsertable, algorithmicName, nameSync, getName, descriptionSync, getDescription, categoryDesc,
  utf8Bytes, utf16Units,
  categoryGroup, groupOf, dominantGroupForRange, blockGroup, blockLabel,
  GROUP_LABELS, groupLabel,
  ageOf, eraOf, eraLabel, ERAS, dominantEraForRange, groupForMode, blockGroupForMode,
};
// COLS/segRows/totalRows change at runtime (setCols), so expose them as live
// getters instead of snapshotting their value into the object above.
Object.defineProperties(window.App.Data, {
  COLS: { enumerable: true, get: () => COLS },
  segRows: { enumerable: true, get: () => segRows },
  totalRows: { enumerable: true, get: () => totalRows },
});

})();
