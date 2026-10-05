"""The assistant's knowledge of HOW the platform works — the rule book.

The operator's call (2026-10-05): the assistant reads the platform's full
internal documentation — ``CLAUDE.md`` at the repo root, every formula, rule
and decision with its date — plus ``docs/zagruzka-and-ojidaniya.md``. Live
numbers come through the user's own endpoints; this answers the "why".

It is ~740 KB, far too much to send with every question, so it is split into
its ``##`` sections and offered as a table of contents plus two tools: a
keyword search and a section reader. Sections that only concern the people
BUILDING the platform (deploys, versioning, the cloud sandbox, the UI-template
contract) are left out — nobody using the platform asks about them, and their
words would only crowd real answers out of the search.

Re-read when the file changes (mtime), so a deploy that edits the rule book is
picked up without a restart.
"""
from __future__ import annotations

import math
import re
import threading
from dataclasses import dataclass
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[3]
_SOURCES = [_ROOT / "CLAUDE.md", _ROOT / "docs" / "zagruzka-and-ojidaniya.md"]

# Developer-only sections, matched on the start of the heading.
_SKIP_PREFIXES = (
    "UI element templates", "Workflow", "Cloud sessions", "Deployment",
    "Zero-downtime deploys", "Versioning", "Context discipline",
)

PART_CHARS = 24000

_CYR = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
    "ж": "j", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "x", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sh", "ъ": "",
    "ы": "i", "ь": "", "э": "e", "ю": "yu", "я": "ya", "ў": "o", "қ": "q",
    "ғ": "g", "ҳ": "h",
}
_WORD = re.compile(r"[0-9A-Za-zЀ-ӿ']+")
# Uzbek is agglutinative («brigadir», «brigadirlar», «brigadirning») and the
# rule book mixes three alphabets, so a token is folded to Latin and cut to a
# stem-length prefix. Crude, and enough for a search whose reader is a model.
_STEM = 6


def _fold(word: str) -> str:
    w = word.lower().replace("'", "").replace("ʻ", "").replace("’", "")
    w = "".join(_CYR.get(ch, ch) for ch in w)
    return w[:_STEM]


def _tokens(text: str) -> list[str]:
    return [t for t in (_fold(w) for w in _WORD.findall(text)) if len(t) >= 2]


def _clean_title(title: str) -> str:
    t = re.sub(r"\s*\([^()]*`[^()]*\)", "", title)
    return t.replace("`", "").strip()


@dataclass
class Section:
    id: int
    title: str
    text: str
    tf: dict
    length: int


class _Index:
    def __init__(self):
        self.lock = threading.Lock()
        self.stamp: tuple = ()
        self.sections: list[Section] = []
        self.df: dict[str, int] = {}
        self.avg = 1.0

    def _mtimes(self) -> tuple:
        out = []
        for p in _SOURCES:
            try:
                out.append((str(p), p.stat().st_mtime))
            except OSError:
                out.append((str(p), 0))
        return tuple(out)

    def ensure(self) -> None:
        stamp = self._mtimes()
        if stamp == self.stamp and self.sections:
            return
        with self.lock:
            if stamp == self.stamp and self.sections:
                return
            sections: list[Section] = []
            for path in _SOURCES:
                try:
                    raw = path.read_text(encoding="utf-8")
                except OSError:
                    continue
                for title, body in _split(raw):
                    if title.startswith(_SKIP_PREFIXES):
                        continue
                    toks = _tokens(body) + _tokens(title) * 3
                    tf: dict[str, int] = {}
                    for t in toks:
                        tf[t] = tf.get(t, 0) + 1
                    sections.append(Section(len(sections) + 1, _clean_title(title),
                                            body.strip(), tf, max(1, len(toks))))
            df: dict[str, int] = {}
            for s in sections:
                for t in s.tf:
                    df[t] = df.get(t, 0) + 1
            self.sections = sections
            self.df = df
            self.avg = (sum(s.length for s in sections) / len(sections)) if sections else 1.0
            self.stamp = stamp


def _split(raw: str):
    """(title, body) per ``## `` heading. Text above the first heading is not
    a section of its own (it is the file's title line)."""
    title = None
    buf: list[str] = []
    for line in raw.splitlines():
        if line.startswith("## "):
            if title is not None:
                yield title, "\n".join(buf)
            title = line[3:].strip()
            buf = []
        elif title is not None:
            buf.append(line)
    if title is not None:
        yield title, "\n".join(buf)


_INDEX = _Index()


def toc() -> str:
    """One line per section — the table of contents the system prompt carries."""
    _INDEX.ensure()
    return "\n".join(f"§{s.id} {s.title}" for s in _INDEX.sections)


def search(query: str, limit: int = 6) -> list[dict]:
    """BM25 over sections; each hit carries a short snippet around the first
    matching word so the model can tell which section to open."""
    _INDEX.ensure()
    q = list(dict.fromkeys(_tokens(query or "")))
    if not q:
        return []
    n = len(_INDEX.sections)
    k1, b = 1.4, 0.7
    scored = []
    for s in _INDEX.sections:
        score = 0.0
        for t in q:
            f = s.tf.get(t)
            if not f:
                continue
            df = _INDEX.df.get(t, 0)
            idf = math.log(1 + (n - df + 0.5) / (df + 0.5))
            score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * s.length / _INDEX.avg))
        if score > 0:
            scored.append((score, s))
    scored.sort(key=lambda x: -x[0])
    out = []
    for score, s in scored[:limit]:
        out.append({"section": s.id, "title": s.title,
                    "parts": max(1, math.ceil(len(s.text) / PART_CHARS)),
                    "snippet": _snippet(s.text, q)})
    return out


def _snippet(text: str, q: list[str]) -> str:
    for m in _WORD.finditer(text):
        if _fold(m.group(0)) in q:
            a = max(0, m.start() - 160)
            return re.sub(r"\s+", " ", text[a:a + 420]).strip()
    return re.sub(r"\s+", " ", text[:300]).strip()


def read(section, part: int = 1) -> dict:
    """A section by number («§12» or 12) or by its title; long sections are
    served in parts of ``PART_CHARS``."""
    _INDEX.ensure()
    sec = None
    key = str(section or "").strip().lstrip("§").strip()
    if key.isdigit():
        i = int(key)
        sec = next((s for s in _INDEX.sections if s.id == i), None)
    if sec is None and key:
        low = key.lower()
        sec = (next((s for s in _INDEX.sections if s.title.lower() == low), None)
               or next((s for s in _INDEX.sections if low in s.title.lower()), None))
    if sec is None:
        return {"error": "no such section — use search_docs or a § number from the contents"}
    parts = max(1, math.ceil(len(sec.text) / PART_CHARS))
    p = min(max(1, int(part or 1)), parts)
    chunk = sec.text[(p - 1) * PART_CHARS:p * PART_CHARS]
    return {"section": sec.id, "title": sec.title, "part": p, "parts": parts, "text": chunk}
