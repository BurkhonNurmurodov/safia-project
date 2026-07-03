"""
translit.py — Python mirror of frontend/src/utils/transliterate.js

Converts Cyrillic (Russian / Uzbek) DB values to Latin so that dynamic strings
embedded in backend-generated text (notification bodies: worker names,
supervisor names, job titles) render in the Latin alphabet for the "uz" and
"en" languages — matching what the dashboard shows via the frontend tl() helper.

Keep this map in sync with transliterate.js.
"""

# Cyrillic (lower-case) → Latin. Upper-case is handled by preserving the case of
# the source character on the first letter of the replacement.
_CYRILLIC_TO_LATIN = {
    "а": "a",  "б": "b",  "в": "v",  "г": "g",  "д": "d",
    "е": "ye", "ё": "yo", "ж": "zh", "з": "z",  "и": "i",
    "й": "y",  "к": "k",  "л": "l",  "м": "m",  "н": "n",
    "о": "o",  "п": "p",  "р": "r",  "с": "s",  "т": "t",
    "у": "u",  "ф": "f",  "х": "kh", "ц": "ts", "ч": "ch",
    "ш": "sh", "щ": "shch", "ы": "y", "ь": "",
    "э": "e",  "ю": "yu", "я": "ya",
    # Uzbek-specific Cyrillic letters
    "ў": "o'", "қ": "q",  "ғ": "g'", "ҳ": "h",
    "ъ": "'",
}


def _translit_word(word: str) -> str:
    out = []
    for ch in word:
        low = ch.lower()
        latin = _CYRILLIC_TO_LATIN.get(low)
        if latin is None:
            out.append(ch)            # non-Cyrillic: pass through
        elif ch != low and latin:
            out.append(latin[0].upper() + latin[1:])   # preserve capitalisation
        else:
            out.append(latin)
    return "".join(out)


# Uzbek-Latin letters that MISREAD in English → their conventional English
# renderings (x→kh, q→k, oʻ→u, gʻ→g, tutuq apostrophe dropped), so "Burxon"
# and its Cyrillic twin "Бурхон" both render "Burkhon" for lang="en".
# Mirror of EN_MULTI / EN_SINGLE in transliterate.js.
_EN_MULTI = [
    ("oʻ", "u"), ("o'", "u"), ("o‘", "u"), ("o’", "u"), ("o`", "u"),
    ("gʻ", "g"), ("g'", "g"), ("g‘", "g"), ("g’", "g"), ("g`", "g"),
]
_EN_SINGLE = {"x": "kh", "q": "k", "ʼ": "", "'": "", "’": "", "‘": "", "`": ""}


def _english_word(word: str) -> str:
    chars = list(word)
    out = []
    i = 0
    while i < len(chars):
        ch = chars[i]
        low = ch.lower()
        pair = "".join(chars[i:i + 2]).lower()
        rep = next((r for lat, r in _EN_MULTI if lat == pair), None)
        if rep is not None:
            out.append(rep if ch == low else rep.upper())
            i += 2
            continue
        single = _EN_SINGLE.get(low)
        if single is None:
            out.append(ch)
        elif ch == low or not single:
            out.append(single)
        else:
            nxt = chars[i + 1] if i + 1 < len(chars) else ""
            # "XURSHID" → "KHURSHID", "Xurshid" → "Khurshid"
            out.append(single.upper() if nxt and nxt != nxt.lower()
                       else single[0].upper() + single[1:])
        i += 1
    return "".join(out)


def transliterate(value, lang: str):
    """Latinise a Cyrillic string for uz/en; keep the original for ru/uz_cyrl.
    English additionally remaps the Uzbek-Latin letters that misread in
    English (x→kh, q→k, oʻ→u, gʻ→g).

    Non-string / empty values are returned unchanged so this is safe to apply
    blindly over a params dict.
    """
    if not value or not isinstance(value, str):
        return value
    if lang == "ru" or lang == "uz_cyrl":
        return value
    # Split on whitespace, transliterating each word so spacing is preserved.
    latin = "".join(
        tok if tok.isspace() else _translit_word(tok)
        for tok in _split_keep_ws(value)
    )
    if lang == "en":
        return "".join(
            tok if tok.isspace() else _english_word(tok)
            for tok in _split_keep_ws(latin)
        )
    return latin


def _split_keep_ws(s: str):
    """Yield alternating non-space / space runs (re.split with capture, no regex)."""
    if not s:
        return
    buf = s[0]
    cur_space = s[0].isspace()
    for ch in s[1:]:
        if ch.isspace() == cur_space:
            buf += ch
        else:
            yield buf
            buf = ch
            cur_space = ch.isspace()
    yield buf
