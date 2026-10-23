"""Where a worker lives — a Verifix address reduced to a REGION and a DISTRICT.

THE rule behind the «Yashash joyi» card of the Workers page's «Tarkib» tab
(`services/workforce.py`). Verifix keeps two addresses per person as free text
— `address` (where they live, 97 % filled on 2026-10-23) and `legal_address`
(their propiska, 94 %) — typed by HR in four spellings at once: Uzbek Latin
(«Toshkent viloyati Bo'ka tumani»), Uzbek Cyrillic («Тошкент вилояти Бўка
тумани»), Russian («Ташкентская обл., Букинский р-н») and Russian in Latin
letters («Bukinskiy rayon»). `region_name` (a Verifix district, 31 % filled) is
a hint where the text says nothing.

**Only the place leaves this module, never the text.** `place(text)` answers
(region key, district key) and the caller stores those two keys — the street,
house, mahalla and flat are thrown away here, so the stored read cannot say
where anybody's door is.

How a text is read, in order:

1. Everything is transliterated to Latin (`app.translit`) and SQUASHED
   (`squash`): lower case, apostrophes gone, x/kh → h, q → k, hyphens → spaces —
   so «Shayxontohur», «Шайхантахурский» and «Shaykhantakhurskiy» meet.
2. A district of the GAZETTEER (`DISTRICTS`: Tashkent city's 12 and Tashkent
   region's districts and towns — where nine in ten workers live) names the
   district AND its region.
3. A region named with its word («Samarqand viloyati», «Ташкентская область»,
   «г. Ташкент») names the region; a bare region name counts only among the
   first three words, where addresses put it («Navoiy ko'chasi» is a street).
   Inside Tashkent the district decides (people write «viloyati» for the city).
4. Any other «X tumani / туман / район / rayon» is a district of its own
   (`x:` key), named by its most common Uzbek spelling across everybody
   (`canon`, run once per read); a Russian adjective («Пахтачийский») is
   matched to that spelling by its stem, else left without a district.
5. «Toshkent» alone at the start, with nothing else, is the city.

A text it cannot place answers (None, None) — counted as «not stated», never
guessed.
"""
from __future__ import annotations

import re
from collections import defaultdict
from typing import Optional

from app.translit import transliterate_text

# ── regions ───────────────────────────────────────────────────────────────────
# key → the stems that name it (squashed, matched at a word start).
TOSH_CITY, TOSH_REG, ABROAD = "toshkent_sh", "toshkent_v", "abroad"
REGIONS: dict[str, tuple[str, ...]] = {
    "samarqand":       ("samarkand", "samarqand"),
    "qashqadaryo":     ("kashkadar",),
    "jizzax":          ("jizzah", "jizzak", "djizak", "dzhizak", "jizak"),
    "surxondaryo":     ("surhondar", "surhandar"),
    "navoiy":          ("navoiy", "navoi", "navoyi"),
    "qoraqalpogiston": ("korakalpog", "karakalpak", "korakalpak", "nukus"),
    "buxoro":          ("buhoro", "buhar"),
    "sirdaryo":        ("sirdar", "syrdar", "guliston", "gulistan"),
    "xorazm":          ("horazm", "horezm", "urganch", "urgench"),
    "andijon":         ("andijon", "andijan"),
    "namangan":        ("namangan",),
    "fargona":         ("fargona", "fargana", "fergana"),
    ABROAD:            ("kazakstan", "kozogiston", "kazahstan", "rossiya", "russia", "kyrgyz", "kirgiz",
                        "kyrgyzstan", "kirgizistan", "tojikiston", "tadzhikistan", "tajikistan",
                        "turkmeniston", "turkmenistan"),
}
REGION_ORDER = (TOSH_CITY, TOSH_REG, *REGIONS)
_REGION_WORD = r"(?:viloyati|viloyat|vil|oblast|obl|oblasti|respublikasi|resp|respublika)"
_CITY_WORD = r"(?:shahri|shahar|shahr|sh|city|gorod|g)"

# ── the gazetteer: districts and towns ────────────────────────────────────────
# (key, Uzbek Latin name, region, stems). ORDER MATTERS: a longer stem that
# contains a shorter one comes first («O'rtachirchiq» before «Chirchiq»).
DISTRICTS: tuple[tuple[str, str, str, tuple[str, ...]], ...] = (
    # Tashkent city
    ("uchtepa", "Uchtepa", TOSH_CITY, ("uchtep",)),
    ("chilonzor", "Chilonzor", TOSH_CITY, ("chilonzor", "chilanzar", "chilonzar")),
    ("olmazor", "Olmazor", TOSH_CITY,
     ("olmazor", "almazar", "almazor", "olmazar", "sobir rahim", "sabir rahim")),
    ("shayxontohur", "Shayxontohur", TOSH_CITY,
     ("shayhontohur", "shayhontahur", "shayhantahur", "shayhantohur", "shaihantahur", "shayhontoh")),
    ("yunusobod", "Yunusobod", TOSH_CITY, ("yunusobod", "yunusabad", "yunusabod")),
    ("mirzo_ulugbek", "Mirzo Ulug'bek", TOSH_CITY, ("mirzo ulug", "mirzoulug", "mirzo ulug")),
    ("sergeli", "Sergeli", TOSH_CITY, ("sergeli", "sergel")),
    ("yakkasaroy", "Yakkasaroy", TOSH_CITY, ("yakkasaroy", "yakkasaray")),
    ("mirobod", "Mirobod", TOSH_CITY, ("mirobod", "mirabad")),
    ("yashnobod", "Yashnobod", TOSH_CITY, ("yashnobod", "yashnabad", "hamza tuman", "hamzinsk")),
    ("bektemir", "Bektemir", TOSH_CITY, ("bektemir",)),
    ("yangihayot", "Yangihayot", TOSH_CITY, ("yangihayot", "yangihaet", "yangihayet")),
    # Tashkent region — districts first, the three Chirchiq ones before the town
    ("ortachirchiq", "O'rtachirchiq", TOSH_REG,
     ("ortachirchik", "orta chirchik", "urtachirchik", "urta chirchik", "srednechirchik")),
    ("yuqorichirchiq", "Yuqorichirchiq", TOSH_REG,
     ("yukorichirchik", "yukori chirchik", "verhnechirchik", "verhne chirchik")),
    ("quyichirchiq", "Quyichirchiq", TOSH_REG,
     ("kuyichirchik", "kuyi chirchik", "nizhnechirchik", "nijnechirchik", "nizhne chirchik")),
    ("toshkent_t", "Toshkent tumani", TOSH_REG,
     ("toshkent tuman", "tashkentskiy rayon", "tashkentskiy r n", "tashkent tuman", "toshkent rayon")),
    ("boka", "Bo'ka", TOSH_REG, ("boka", "buka", "bukin")),
    ("piskent", "Piskent", TOSH_REG, ("piskent", "pskent")),
    ("chinoz", "Chinoz", TOSH_REG, ("chinoz", "chinaz")),
    ("zangiota", "Zangiota", TOSH_REG, ("zangiota", "zangiata", "zangota")),
    ("qibray", "Qibray", TOSH_REG, ("kibray",)),
    ("parkent", "Parkent", TOSH_REG, ("parkent",)),
    ("bostonliq", "Bo'stonliq", TOSH_REG, ("bostonl", "bustanl", "bostanl", "gazalkent")),
    ("oqqorgon", "Oqqo'rg'on", TOSH_REG, ("okkorgon", "akkurgan", "okkurgon", "okkorgan")),
    ("bekobod", "Bekobod", TOSH_REG, ("bekobod", "bekabad")),
    ("ohangaron", "Ohangaron", TOSH_REG, ("ohangaron", "ahangaran", "ohangaran")),
    ("yangiyol", "Yangiyo'l", TOSH_REG, ("yangiyol", "yangiyul")),
    ("chirchiq", "Chirchiq", TOSH_REG, ("chirchik",)),
    ("olmaliq", "Olmaliq", TOSH_REG, ("olmalik", "almalyk", "almalik")),
    ("angren", "Angren", TOSH_REG, ("angren",)),
    ("nurafshon", "Nurafshon", TOSH_REG, ("nurafshon", "nurafshan", "toytepa")),
    ("keles", "Keles", TOSH_REG, ("keles",)),
)
GAZ_NAME = {k: name for k, name, _, _ in DISTRICTS}
GAZ_REGION = {k: reg for k, _, reg, _ in DISTRICTS}

_APOS = re.compile(r"[ʻʼ'`’‘´\"]")
_NONWORD = re.compile(r"[^a-z0-9 .]+")
_WS = re.compile(r"\s+")


def squash(text: str) -> str:
    """Latin, lower case, no apostrophes, x/kh → h, q → k — the form every
    stem is written in."""
    s = transliterate_text(str(text or ""), "uz").lower()
    s = _APOS.sub("", s)
    s = s.replace("kh", "h").replace("x", "h").replace("q", "k").replace("-", " ").replace(",", " ")
    s = _NONWORD.sub(" ", s)
    return _WS.sub(" ", s).strip()


def _pattern(stems) -> re.Pattern:
    return re.compile(r"(?<![a-z])(?:" + "|".join(re.escape(squash(x).strip()) for x in stems) + r")")


_DIST_PATS = [(k, reg, _pattern(stems)) for k, _, reg, stems in DISTRICTS]
_REG_PATS = {k: _pattern(stems) for k, stems in REGIONS.items()}
_TOSH = r"(?:toshkent|tashkent|tashkentskaya|toshkentskaya|tashkentskoy)"
_TOSH_REG_RE = re.compile(r"(?<![a-z])" + _TOSH + r"\s*(?:\.\s*)?" + _REGION_WORD + r"(?![a-z])")
_TOSH_CITY_RE = re.compile(
    r"(?<![a-z])(?:" + _TOSH + r"\s*(?:\.\s*)?" + _CITY_WORD + r"(?![a-z])"
    r"|(?:g|gorod|shahar|shahri)\s*\.?\s*" + _TOSH + r"(?![a-z]))")
_TOSH_ANY = re.compile(r"(?<![a-z])" + _TOSH + r"(?![a-z])")
# «<name> tumani / район / rayon / r-n» — a district the gazetteer does not hold.
_GENERIC = re.compile(
    r"(?<![a-z])([a-z][a-z]{2,}(?: [a-z][a-z]{2,})?)\s+(?:tumani|tuman|rayon|rayoni|raion|r n|rn|t)(?![a-z])")
_ADJ = re.compile(r"(?:iyskiy|inskiy|skiy|skiy|ckiy|skij|skogo|skom|sky)$")
_NOT_A_NAME = {"shahar", "shahri", "viloyati", "viloyat", "oblast", "obl", "gorod", "kocha", "kochasi",
               "uy", "dom", "kvartal", "mahalla", "mahallasi", "kishlok", "kishlogi", "ulitsa", "ul",
               "respublika", "respublikasi", "uzbekiston", "uzbekistan", "ozbekiston"}


_DIST_WORD = re.compile(r"[a-z]*\s*\.?\s*(?:tumani|tuman|rayon|rayoni|raion|r n|rn|t|shahri|shahar|sh|gorod)(?![a-z])")


def _gazetteer(s: str) -> Optional[tuple[str, str]]:
    """(district key, region) of the gazetteer district the text names. A
    stem followed by its word («Bo'ka tumani», «Букинский район») beats a bare
    one, then the earliest in the text: an address runs region → district →
    mahalla, and a mahalla is often named after a district elsewhere
    («Bo'ka tumani, Olmazor mahallasi»)."""
    if not s:
        return None
    hits = []
    for k, reg, pat in _DIST_PATS:
        for m in pat.finditer(s):
            marked = bool(_DIST_WORD.match(s, m.end()))
            hits.append((0 if marked else 1, m.start(), -(m.end() - m.start()), k, reg))
    if not hits:
        return None
    hits.sort()
    return hits[0][3], hits[0][4]


_STREET = re.compile(r"[a-z]*\s*\.?\s*(?:kochasi|kocha|kuchasi|kucha|ko|ul|ulitsa|ulitsasi|street|st|prospekt|"
                     r"pr|shoh kochasi|tor kochasi|berk|massivi|massiv|mahallasi|mahalla|mfy|kvartal)(?![a-z])")


def _region_of(s: str) -> tuple[Optional[str], bool]:
    """(region the text names, named WITH its word). A bare region name counts
    only among the first three words and never before a street word
    («Navoiy ko'chasi» is a street in every city)."""
    if _TOSH_REG_RE.search(s):
        return TOSH_REG, True
    if _TOSH_CITY_RE.search(s):
        return TOSH_CITY, True
    head = " ".join(s.split()[:3])
    weak = None
    for k, pat in _REG_PATS.items():
        for m in pat.finditer(s):
            if re.match(r"[a-z]*\s*\.?\s*" + _REGION_WORD + r"(?![a-z])", s[m.end():]):
                return k, True
            if weak is None and m.start() < len(head) and not _STREET.match(s, m.end()):
                weak = k
    return weak, False


def place(text: Optional[str], hint: Optional[str] = None) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """(region key, district key, generic stem) of one address. A gazetteer
    district is «g:<key>»; another district «x:<stem>» (named by `canon`); the
    third value is the squashed stem of a district read off a Russian
    adjective, for `canon` to resolve — None otherwise."""
    s = squash(text or "")
    if not s:
        s = ""
    region, strong = _region_of(s) if s else (None, False)
    for src in (s, squash(hint) if hint else ""):
        hit = _gazetteer(src)
        if hit and (not strong or region in (TOSH_CITY, TOSH_REG) or region == hit[1]):
            return hit[1], f"g:{hit[0]}", None
    if not s:
        return None, None, None
    m = _GENERIC.search(s)
    if m:
        words = [w for w in m.group(1).split() if w not in _NOT_A_NAME]
        name = words[-1] if words else ""
        if len(name) >= 4 and not _TOSH_ANY.fullmatch(name):
            if _ADJ.search(name):
                stem = _ADJ.sub("", name)
                return region, None, (stem if len(stem) >= 4 else None)
            return region, f"x:{name}", None
    if region is None and _TOSH_ANY.search(" ".join(s.split()[:3])):
        region = TOSH_CITY
    return region, None, None


def canon(rows: list[tuple[Optional[str], Optional[str], Optional[str]]]) -> list[tuple[Optional[str], Optional[str]]]:
    """Resolve the `place` answers of a whole read at once: a Russian
    adjective's stem («pahtach») joins the generic district its Uzbek spelling
    names («x:pahtachi») when exactly one such district in the same region
    starts with it. Returns (region, district) per row."""
    by_region: dict[Optional[str], set[str]] = defaultdict(set)
    for reg, dist, _ in rows:
        if dist and dist.startswith("x:"):
            by_region[reg].add(dist[2:])
    out = []
    for reg, dist, stem in rows:
        if dist is None and stem:
            hits = [d for d in by_region.get(reg, ()) if d.startswith(stem)]
            if len(hits) == 1:
                dist = f"x:{hits[0]}"
                if reg is None:
                    reg = next((r for r, ds in by_region.items() if hits[0] in ds and r), None)
        out.append((reg, dist))
    return out


def generic_label(text: str, stem: str) -> Optional[str]:
    """The spelling a person typed for a generic district: the word of the
    ORIGINAL (transliterated, apostrophes kept) text whose squashed form is
    the stem — «Paxtachi», not «pahtachi»."""
    for word in re.split(r"[\s,.;:()]+", transliterate_text(str(text or ""), "uz")):
        w = word.strip("-")
        if w and squash(w) == stem and not re.search(r"[а-яё]", w, re.I):
            return w[:1].upper() + w[1:].lower()
    return None
