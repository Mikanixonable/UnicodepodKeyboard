#!/usr/bin/env python3
"""Generate static Unicode data for the app.

Outputs (into ../data):
  blocks.json      [{ "n": name, "s": start, "e": end }]  in-scope blocks
  categories.json  RLE ranges [[start, end, "Cat"], ...] over scope
  names.json       { "<hex>": "NAME" }  assigned, non-algorithmic chars only

Scope: full BMP (U+0000..U+FFFF) plus the supplementary symbol/emoji region
(U+1D000..U+1FBFF). Algorithmic name ranges (CJK ideographs, CJK compatibility
ideographs, Hangul syllables) are excluded from names.json; the browser derives
those names on the fly.

Requires network only for Blocks.txt (Python's unicodedata has no block API).
"""
import json
import os
import sys
import unicodedata
import urllib.request

BLOCKS_URL = "https://www.unicode.org/Public/UCD/latest/ucd/Blocks.txt"
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

# Scope segments (inclusive). Kept in sync with js/data.js SEGMENTS.
SEGMENTS = [(0x0000, 0xFFFF), (0x1D000, 0x1FBFF)]

# Ranges whose names the browser computes algorithmically -> omit from names.json.
ALGORITHMIC = [
    (0x3400, 0x4DBF),   # CJK Ext A            -> CJK UNIFIED IDEOGRAPH-XXXX
    (0x4E00, 0x9FFF),   # CJK Unified          -> CJK UNIFIED IDEOGRAPH-XXXX
    (0xF900, 0xFAFF),   # CJK Compatibility    -> CJK COMPATIBILITY IDEOGRAPH-XXXX
    (0xAC00, 0xD7A3),   # Hangul Syllables     -> HANGUL SYLLABLE ...
]


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

    def dump(name, obj):
        path = os.path.join(OUT_DIR, name)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        print(f"  {name}: {len(obj)} entries, {os.path.getsize(path):,} bytes",
              file=sys.stderr)

    dump("blocks.json", blocks)
    dump("categories.json", cats)
    dump("names.json", names)
    print("done.", file=sys.stderr)


if __name__ == "__main__":
    main()
