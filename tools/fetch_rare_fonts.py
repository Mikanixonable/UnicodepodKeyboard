#!/usr/bin/env python3
"""Download and bundle Noto fonts for rare/historic scripts (Tangut,
Hentaigana, and ~80 other Supplementary Multilingual Plane scripts) so their
glyphs render even with no matching font installed locally.

Deliberately excludes the large common families (Noto Sans/Serif CJK, Noto
Color Emoji, Noto Sans Symbols/Math/Music) -- those stay local-font-only
(see the "Noto" font mode) since they're commonly pre-installed and are each
tens of MB; bundling every rare-script family stays in the low tens of MB
total, which is the tradeoff the project settled on (full glyph coverage
matters more than a hard "no fonts at all" rule -- see dev.md).

For each family: fetches Google Fonts' CSS2 endpoint, keeps only the
@font-face block(s) NOT covering generic Latin/Cyrillic/etc (i.e. the actual
script), downloads that woff2 into fonts/, and emits one combined stylesheet
(css/fonts-extended.css) with @font-face rules pointing at the local files.

Usage: python3 tools/fetch_rare_fonts.py
"""
import os
import re
import sys
import urllib.request

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
RANGE_RE = re.compile(r"unicode-range:\s*([^;]+);")


def slug(family):
    return family.lower().replace(" ", "-")


def main():
    os.makedirs(FONTS_DIR, exist_ok=True)
    face_rules = []
    total_bytes = 0
    for i, family in enumerate(FAMILIES, 1):
        print(f"[{i}/{len(FAMILIES)}] {family} ...", file=sys.stderr)
        try:
            css = fetch_css(family)
        except Exception as e:
            print(f"  FAILED (css2 fetch): {e}", file=sys.stderr)
            continue
        picked = None
        for m in FONT_FACE_RE.finditer(css):
            if m.group("subset") in GENERIC_SUBSETS:
                continue
            url_m = URL_RE.search(m.group("body"))
            range_m = RANGE_RE.search(m.group("body"))
            if url_m and range_m:
                picked = (m.group("subset"), url_m.group(1), range_m.group(1).strip())
                break  # first non-generic subset is the script itself
        if not picked:
            print("  SKIPPED (no non-generic subset found)", file=sys.stderr)
            continue
        subset, woff2_url, unicode_range = picked
        fname = f"{slug(family)}.woff2"
        fpath = os.path.join(FONTS_DIR, fname)
        try:
            req = urllib.request.Request(woff2_url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
        except Exception as e:
            print(f"  FAILED (woff2 fetch): {e}", file=sys.stderr)
            continue
        with open(fpath, "wb") as f:
            f.write(data)
        total_bytes += len(data)
        print(f"  OK: {fname} ({len(data):,} bytes, subset={subset})", file=sys.stderr)
        face_rules.append(
            "@font-face {\n"
            f"  font-family: '{family}';\n"
            "  font-style: normal;\n"
            "  font-weight: 400;\n"
            "  font-display: swap;\n"
            f"  src: url('../fonts/{fname}') format('woff2');\n"
            f"  unicode-range: {unicode_range};\n"
            "}\n"
        )

    with open(CSS_OUT, "w", encoding="utf-8") as f:
        f.write(
            "/* Auto-generated by tools/fetch_rare_fonts.py -- do not hand-edit.\n"
            "   Bundled Noto fonts for rare/historic scripts (see that script's\n"
            "   module docstring for what's included and why). */\n\n"
        )
        f.write("\n".join(face_rules))
        f.write("\n")

    print(f"done. {len(face_rules)}/{len(FAMILIES)} fonts bundled, "
          f"{total_bytes:,} bytes total.", file=sys.stderr)


if __name__ == "__main__":
    main()
