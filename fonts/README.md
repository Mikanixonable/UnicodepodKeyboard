# Bundled fonts

These `.woff2` files are the rare/historic-script Noto fonts listed in
`tools/fetch_rare_fonts.py` (Tangut, Hentaigana, and ~80 others), fetched
from Google Fonts and subsetted to just that script's codepoints via each
font's own `unicode-range`. Regenerate with:

```
python3 tools/fetch_rare_fonts.py
```

Licensed under the SIL Open Font License 1.1 (see `OFL.txt`), same as
upstream Noto.
