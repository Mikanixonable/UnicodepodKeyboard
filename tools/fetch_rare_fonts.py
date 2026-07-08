#!/usr/bin/env python3
"""Download and bundle Noto fonts for rare/historic scripts (Tangut,
Hentaigana, and ~85 other Supplementary Multilingual Plane scripts), plus a
few symbol/math/music "catch-all" families, so their glyphs render even with
no matching font installed locally.

Deliberately excludes Noto Sans/Serif CJK and Noto Color Emoji -- verified
(via fontTools cmap inspection) that Noto Sans/Serif CJK does NOT cover the
CJK Unified Ideographs Extension B-H blocks anyway (planes 2-3), so bundling
it wouldn't even achieve full coverage; it and Color Emoji are also each
tens of MB, so both stay local-font-only (see the "Noto" font mode). Full
CJK Ext B-H coverage needs a different, non-Noto font (e.g. HanaMin) -- not
handled by this script; see dev.md for that discussion.

For each family: fetches Google Fonts' CSS2 endpoint. Most rare-script
families come back pre-split by subset with a unicode-range per block --
this keeps only the @font-face block(s) NOT covering generic
Latin/Cyrillic/etc (i.e. the actual script) and downloads that woff2
directly. A few "catch-all" families (Noto Sans Symbols/Symbols 2/Math, Noto
Music) instead come back as one unsplit TTF covering many unrelated blocks
at once with no unicode-range -- those are converted to woff2 (via
fontTools, for a much smaller download) and bundled whole, so the browser
downloads them once when it first falls all the way through the font stack.
Either way, the result is one combined stylesheet (css/fonts-extended.css)
with @font-face rules pointing at the local files.

Usage: python3 tools/fetch_rare_fonts.py
"""
import os
import re
import sys
import urllib.request

from fontTools.ttLib import TTFont

FONTS_DIR = os.path.join(os.path.dirname(__file__), "..", "fonts")
CSS_OUT = os.path.join(os.path.dirname(__file__), "..", "css", "fonts-extended.css")

# Subsets that are NOT the script itself -- skip these @font-face blocks.
GENERIC_SUBSETS = {
    "latin", "latin-ext", "cyrillic", "cyrillic-ext", "greek", "greek-ext",
    "vietnamese", "devanagari",
}

# Family -> Google Fonts family name (as used in the CSS2 API).
FAMILIES = [
    "Noto Serif Tangut", "Noto Serif Hentaigana", "Noto Serif Ahom", "Noto Sans Nushu",
    "Noto Sans Cuneiform", "Noto Sans Egyptian Hieroglyphs", "Noto Sans Anatolian Hieroglyphs",
    "Noto Sans Linear A", "Noto Sans Linear B", "Noto Sans Cypriot", "Noto Sans Cypro Minoan",
    "Noto Sans Phoenician", "Noto Sans Lydian", "Noto Sans Lycian", "Noto Sans Carian",
    "Noto Sans Old Italic", "Noto Sans Gothic", "Noto Sans Runic",
    "Noto Sans Old Permic", "Noto Sans Ugaritic", "Noto Sans Old Persian",
    "Noto Sans Deseret", "Noto Sans Shavian", "Noto Sans Osmanya", "Noto Sans Osage",
    "Noto Sans Elbasan", "Noto Sans Caucasian Albanian", "Noto Sans Vithkuqi",
    "Noto Sans Imperial Aramaic", "Noto Sans Palmyrene", "Noto Sans Nabataean", "Noto Sans Hatran",
    "Noto Sans Old North Arabian", "Noto Sans Old South Arabian",
    "Noto Sans Manichaean", "Noto Sans Avestan",
    "Noto Sans Inscriptional Parthian", "Noto Sans Inscriptional Pahlavi", "Noto Sans Psalter Pahlavi",
    "Noto Sans Old Turkic", "Noto Sans Old Hungarian", "Noto Sans Hanifi Rohingya",
    "Noto Sans Old Sogdian", "Noto Sans Sogdian", "Noto Sans Chorasmian", "Noto Sans Elymaic",
    "Noto Sans Brahmi", "Noto Sans Kaithi", "Noto Sans Sora Sompeng", "Noto Sans Chakma",
    "Noto Sans Mahajani", "Noto Sans Sharada", "Noto Sans Khojki", "Noto Sans Multani",
    "Noto Sans Khudawadi", "Noto Sans Grantha", "Noto Sans Newa", "Noto Sans Tirhuta",
    "Noto Sans Siddham", "Noto Sans Modi", "Noto Sans Takri", "Noto Serif Dogra",
    "Noto Sans Warang Citi", "Noto Serif Dives Akuru", "Noto Sans Nandinagari",
    "Noto Sans Zanabazar Square", "Noto Sans Soyombo", "Noto Sans Pau Cin Hau",
    "Noto Sans Bhaiksuki", "Noto Sans Marchen", "Noto Sans Masaram Gondi", "Noto Sans Gunjala Gondi",
    "Noto Serif Makasar", "Noto Sans Mro", "Noto Sans Bassa Vah", "Noto Sans Pahawh Hmong",
    "Noto Sans Medefaidrin", "Noto Sans Miao", "Noto Sans Duployan",
    "Noto Serif Nyiakeng Puachue Hmong", "Noto Sans Wancho", "Noto Sans Mende Kikakui",
    "Noto Sans Adlam", "Noto Sans SignWriting", "Noto Sans Tai Viet",
]

# "Catch-all" families covering many unrelated blocks at once instead of one
# script each: general symbols/dingbats/legacy computing, Aegean/Ancient
# Greek/Mayan/etc numeral systems, mathematical alphanumeric symbols, and
# Byzantine/Western/Ancient Greek musical notation. Google's CSS2 endpoint is
# inconsistent about how it serves these -- sometimes pre-split by subset
# (like the FAMILIES above), sometimes as a single unsplit file -- so
# bundle_family() below handles both shapes.
WHOLE_FONT_FAMILIES = [
    "Noto Sans Symbols", "Noto Sans Symbols 2", "Noto Sans Math", "Noto Music",
]

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/120.0.0.0 Safari/537.36")


def fetch_css(family):
    url = "https://fonts.googleapis.com/css2?family=" + family.replace(" ", "+") + "&display=swap"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8")


FONT_FACE_RE = re.compile(
    r"/\*\s*(?P<subset>[\w-]+)\s*\*/\s*"
    r"@font-face\s*\{(?P<body>[^}]*)\}",
    re.MULTILINE,
)
URL_RE = re.compile(r"url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)")
ANY_URL_RE = re.compile(r"url\((https://fonts\.gstatic\.com/[^)]+)\)")
RANGE_RE = re.compile(r"unicode-range:\s*([^;]+);")


def slug(family):
    return family.lower().replace(" ", "-")


def face_rule(family, fname, unicode_range=None):
    lines = [
        "@font-face {",
        f"  font-family: '{family}';",
        "  font-style: normal;",
        "  font-weight: 400;",
        "  font-display: swap;",
        f"  src: url('../fonts/{fname}') format('woff2');",
    ]
    if unicode_range:
        lines.append(f"  unicode-range: {unicode_range};")
    lines.append("}\n")
    return "\n".join(lines)


def bundle_family(family):
    """Fetch and bundle one family. Google's CSS2 endpoint is inconsistent
    about how it shapes the response:
      - usually pre-split by subset (comment + unicode-range per block) --
        download every NON-generic (i.e. actual script/symbol) subset, since
        a "catch-all" family like Noto Sans Symbols 2 can have several
        (braille, math, mayan-numerals, symbols, ...), not just one;
      - occasionally a single unsplit file with no unicode-range -- download
        and re-encode to woff2 via fontTools (smaller than the raw TTF).
    Returns (list of face_rule strings, total bytes downloaded)."""
    try:
        css = fetch_css(family)
    except Exception as e:
        print(f"  FAILED (css2 fetch): {e}", file=sys.stderr)
        return [], 0

    subsets = [
        (m.group("subset"), url_m.group(1), range_m.group(1).strip())
        for m in FONT_FACE_RE.finditer(css)
        if m.group("subset") not in GENERIC_SUBSETS
        for url_m in [URL_RE.search(m.group("body"))]
        for range_m in [RANGE_RE.search(m.group("body"))]
        if url_m and range_m
    ]

    if subsets:
        rules, total = [], 0
        for subset, woff2_url, unicode_range in subsets:
            fname = f"{slug(family)}-{subset}.woff2" if len(subsets) > 1 else f"{slug(family)}.woff2"
            try:
                req = urllib.request.Request(woff2_url, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=30) as r:
                    data = r.read()
            except Exception as e:
                print(f"  FAILED (woff2 fetch, subset={subset}): {e}", file=sys.stderr)
                continue
            with open(os.path.join(FONTS_DIR, fname), "wb") as f:
                f.write(data)
            print(f"  OK: {fname} ({len(data):,} bytes, subset={subset})", file=sys.stderr)
            rules.append(face_rule(family, fname, unicode_range))
            total += len(data)
        return rules, total

    # Fallback: no subset-tagged blocks at all -> single unsplit file.
    m = ANY_URL_RE.search(css)
    if not m:
        print("  SKIPPED (no font URL found)", file=sys.stderr)
        return [], 0
    font_url = m.group(1)
    fname = f"{slug(family)}.woff2"
    fpath = os.path.join(FONTS_DIR, fname)
    tmp_path = fpath + ".tmp"
    try:
        req = urllib.request.Request(font_url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=30) as r:
            with open(tmp_path, "wb") as f:
                f.write(r.read())
        font = TTFont(tmp_path)
        font.flavor = "woff2"
        font.save(fpath)
    except Exception as e:
        print(f"  FAILED (fetch/convert): {e}", file=sys.stderr)
        return [], 0
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
    size = os.path.getsize(fpath)
    print(f"  OK: {fname} ({size:,} bytes, whole font, recompressed)", file=sys.stderr)
    return [face_rule(family, fname)], size


def main():
    os.makedirs(FONTS_DIR, exist_ok=True)
    face_rules = []
    total_bytes = 0

    all_families = FAMILIES + WHOLE_FONT_FAMILIES
    for i, family in enumerate(all_families, 1):
        print(f"[{i}/{len(all_families)}] {family} ...", file=sys.stderr)
        rules, size = bundle_family(family)
        face_rules.extend(rules)
        total_bytes += size

    with open(CSS_OUT, "w", encoding="utf-8") as f:
        f.write(
            "/* Auto-generated by tools/fetch_rare_fonts.py -- do not hand-edit.\n"
            "   Bundled Noto fonts for rare/historic scripts (see that script's\n"
            "   module docstring for what's included and why). */\n\n"
        )
        f.write("\n".join(face_rules))
        f.write("\n")

    print(f"done. {len(face_rules)} font files bundled from {len(all_families)} families, "
          f"{total_bytes:,} bytes total.", file=sys.stderr)


if __name__ == "__main__":
    main()
