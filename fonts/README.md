# Bundled fonts

These `.woff2` files are the Noto fonts listed in `tools/fetch_rare_fonts.py`:
~85 rare/historic scripts (Tangut, Hentaigana, and others), plus Symbols,
Symbols 2, Math, and Music for numeral systems, mathematical alphanumeric
symbols, and musical notation. Fetched from Google Fonts and subsetted to
just the relevant codepoints via each font's own `unicode-range`.
Not included: CJK Unified Ideograph Extensions B-H (planes 2-3) -- Noto
Sans/Serif CJK's cmap doesn't cover these at all (verified), so no Noto font
can bundle them; see dev.md. Regenerate with:

```
python3 tools/fetch_rare_fonts.py
```

Licensed under the SIL Open Font License 1.1 (see `OFL.txt`), same as
upstream Noto.
