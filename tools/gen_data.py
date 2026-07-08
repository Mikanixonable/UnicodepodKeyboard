#!/usr/bin/env python3
"""Generate static Unicode data for the app.

Outputs (into ../data) as classic-script JS files, each assigning to a
`window.UNICODE_*` global. This (rather than plain .json) lets index.html
load them via <script src> / dynamic script injection instead of fetch(),
which is what makes the app work when opened directly as a local file
(file://) with no server.

  segments.js    window.UNICODE_SEGMENTS = [[start, end], ...]  covered ranges
  blocks.js      window.UNICODE_BLOCKS = [{ "n": name, "s": start, "e": end }, ...]
  categories.js  window.UNICODE_CATEGORIES = RLE ranges [[start, end, "Cat"], ...]
  names.js       window.UNICODE_NAMES = { "<hex>": "NAME" }  assigned, non-algorithmic chars only

Scope: BMP plus supplementary planes 1-3 (historic scripts, symbols, emoji,
CJK Ext B-H) and plane 14, each trimmed to its last assigned codepoint
(see compute_segments). Algorithmic name ranges (CJK ideographs, CJK
compatibility ideographs, Hangul syllables) are excluded from names.js; the
browser derives those names on the fly.

Requires network only for Blocks.txt (Python's unicodedata has no block API).
"""
import json
import os
import sys
import unicodedata
import urllib.request

BLOCKS_URL = "https://www.unicode.org/Public/UCD/latest/ucd/Blocks.txt"
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

# Candidate plane ranges to cover. Each is trimmed down to its last assigned
# codepoint (so we don't render the huge unassigned tails of planes), then
# emitted to data/segments.js and read back by js/data.js -- single source of
# truth, no hand-kept duplication.
#   Plane 0  BMP            : Latin ... CJK ... Hangul
#   Planes 1-3             : historic scripts (Cuneiform, Egyptian, ...),
#                            symbols, emoji, and CJK Ext B-H
#   Plane 14              : Tags + Variation Selectors Supplement
# Unassigned planes 4-13 and the supplementary Private Use planes 15-16 are
# intentionally excluded (nothing meaningful to show).
CANDIDATE_PLANES = [
    (0x00000, 0x0FFFF),
    (0x10000, 0x3FFFF),
    (0xE0000, 0xE01FF),
]

# Ranges whose names the browser computes algorithmically -> omit from names.js.
# Mirrored by algorithmicName() in js/data.js. The CJK "areas" are drawn a
# little wider than the assigned sub-blocks; the extra codepoints are all
# unassigned, so names are never looked up for them.
ALGORITHMIC = [
    (0x3400, 0x4DBF),    # CJK Ext A               -> CJK UNIFIED IDEOGRAPH-XXXX
    (0x4E00, 0x9FFF),    # CJK Unified
    (0x20000, 0x2A6DF),  # CJK Ext B
    (0x2A700, 0x2EE5F),  # CJK Ext C/D/E/F (+ future)
    (0x30000, 0x323AF),  # CJK Ext G/H
    (0xF900, 0xFAFF),    # CJK Compatibility       -> CJK COMPATIBILITY IDEOGRAPH-XXXX
    (0x2F800, 0x2FA1F),  # CJK Compatibility Suppl.
    (0xAC00, 0xD7A3),    # Hangul Syllables        -> HANGUL SYLLABLE ...
]


def compute_segments():
    """Trim each candidate plane range to [start, last-assigned-rounded-to-16]."""
    segs = []
    for lo, hi in CANDIDATE_PLANES:
        last = None
        for cp in range(hi, lo - 1, -1):
            if unicodedata.category(chr(cp)) != "Cn":
                last = cp
                break
        if last is None:
            continue
        end = min(hi, ((last >> 4) << 4) + 15)
        segs.append([lo, end])
    return segs


SEGMENTS = compute_segments()


def in_scope(cp):
    return any(s <= cp <= e for s, e in SEGMENTS)


def in_algorithmic(cp):
    return any(s <= cp <= e for s, e in ALGORITHMIC)


def fetch_blocks():
    print("Fetching Blocks.txt ...", file=sys.stderr)
    with urllib.request.urlopen(BLOCKS_URL, timeout=30) as r:
        text = r.read().decode("utf-8")
    blocks = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        rng, _, name = line.partition(";")
        name = name.strip()
        start_hex, _, end_hex = rng.strip().partition("..")
        start, end = int(start_hex, 16), int(end_hex, 16)
        # keep a block if any part is in scope
        if in_scope(start) or in_scope(end):
            blocks.append({"n": name, "s": start, "e": end})
    blocks.sort(key=lambda b: b["s"])
    return blocks


def build_categories():
    """Run-length encode General_Category over the scope."""
    runs = []
    for seg_start, seg_end in SEGMENTS:
        cur_cat = None
        cur_start = None
        for cp in range(seg_start, seg_end + 1):
            cat = unicodedata.category(chr(cp))
            if cat != cur_cat:
                if cur_cat is not None:
                    runs.append([cur_start, cp - 1, cur_cat])
                cur_cat, cur_start = cat, cp
        runs.append([cur_start, seg_end, cur_cat])
    return runs


def build_names():
    names = {}
    for seg_start, seg_end in SEGMENTS:
        for cp in range(seg_start, seg_end + 1):
            if in_algorithmic(cp):
                continue
            ch = chr(cp)
            if unicodedata.category(ch) == "Cn":  # unassigned
                continue
            try:
                nm = unicodedata.name(ch)
            except ValueError:
                continue  # assigned but unnamed (control, surrogate, private use)
            names["%04X" % cp] = nm
    return names


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    blocks = fetch_blocks()
    cats = build_categories()
    names = build_names()

    def dump(filename, varname, obj):
        path = os.path.join(OUT_DIR, filename)
        with open(path, "w", encoding="utf-8") as f:
            f.write(f"window.{varname} = ")
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
            f.write(";\n")
        print(f"  {filename}: {len(obj)} entries, {os.path.getsize(path):,} bytes",
              file=sys.stderr)

    dump("segments.js", "UNICODE_SEGMENTS", SEGMENTS)
    dump("blocks.js", "UNICODE_BLOCKS", blocks)
    dump("categories.js", "UNICODE_CATEGORIES", cats)
    dump("names.js", "UNICODE_NAMES", names)
    print("done.", file=sys.stderr)


if __name__ == "__main__":
    main()
