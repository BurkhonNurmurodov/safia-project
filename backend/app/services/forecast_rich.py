"""The call forecast as a Rich-HTML body (sendRichMessage), with the card as
its figure.

The twin of services/ojidaniya_svodka next door, for the «Smenaga chaqirish»
message: same dialect, same figure mechanism (``tg://photo?id=…`` resolved
against the media attached to the send), same degrade-to-the-classic-DM
contract. Where the plain DM is five labelled lines, this lays the same facts
out as a table and embeds the PNG — so the chart, and with it the history the
recommendation was averaged over, arrives as part of the message instead of as
an attachment beside it.

Three rules, and the first two are what stop this becoming a second answer:

* **The title and the disclaimer are the NOTIFICATION's own.** Both are read
  out of ``_NOTIF_STRINGS["call_forecast"]`` — the template the bell row and
  the classic DM already render — and the disclaimer is simply everything
  after the field block, which carries no placeholders in any of the four
  languages. A brigadir must not be told one thing by the rich message and
  another by the plain one that replaces it when their client cannot render
  rich; copying that wording into this module is how the two would drift, and
  the wording is the part that matters most.

* **Every other word is the CARD's vocabulary** (``forecast_card.L``), so the
  table and the picture beside it name the same figures identically.

* **It computes nothing.** Like the card, it is handed one ``_call_rows`` row.

``with_image`` is False when there is no PNG to attach — the body is then
complete on its own rather than referencing a figure that will not resolve.
"""
from __future__ import annotations

from datetime import date
from html import escape

from app.services.forecast_card import _RU_WD_NOM, _fmt_min, _t, basis_line

# The media id the figure resolves against; the sender attaches the PNG under
# it. Must match the ``id`` in the sendRichMessage media array.
PHOTO_ID = "fc1"


def _esc(v) -> str:
    """Escape for element CONTENT — `&`, `<`, `>` and nothing else.

    ``quote=False`` is load-bearing, not a shortcut: Uzbek Latin is full of
    apostrophes (yo'q, ko'rish, o'rtacha) and the default would turn every one
    of them into `&#x27;`. The shipped classic DM escapes only the interpolated
    values and leaves its own text raw, so escaping quotes here would make the
    rich message and the plain one it degrades to look different in exactly the
    language most of the plant reads. Nothing on this body is built into an
    ATTRIBUTE — every attribute is a literal — so quotes need no escaping.
    """
    return escape(str(v), quote=False)


def _notif(lang: str) -> tuple[str, str]:
    """(title, disclaimer) straight from the notification template, so the rich
    message and the classic DM it degrades to say the same thing."""
    # function-level import: staff.py is heavy and importing it at module level
    # would close a circle through the routers.
    from app.routers.staff import _NOTIF_STRINGS

    strings = _NOTIF_STRINGS["call_forecast"]
    title, body = strings.get(lang) or strings["en"]
    parts = body.split("\n\n", 1)
    return title, (parts[1] if len(parts) > 1 else "")


def body(row: dict, target: date, lang: str = "ru", eff: int = 100,
         weeks: int = 3, with_image: bool = True) -> str:
    """The Rich-HTML body for ONE brigadir's call forecast."""
    from app.services.forecast_card import collect

    t = _t(lang)
    data = collect(row, target, weeks)
    title, disclaimer = _notif(lang)
    wd = target.weekday()
    wd_name = _RU_WD_NOM[wd] if lang == "ru" else t["wd"][wd]
    name = _esc(data["name"])
    fc, hi, plan = data["forecast"], data["band_hi"], data["plan_mean"]
    people = _esc(t["people"])

    parts = [f"<h3>{_esc(title)}</h3>"]
    if with_image:
        parts.append(
            f'<figure><img src="tg://photo?id={PHOTO_ID}"/>'
            f'<figcaption>{name} · {_esc(wd_name)}, {target:%d.%m.%Y}'
            f'<cite>Safia Dashboard</cite></figcaption></figure>')

    parts.append(
        '<table bordered striped>\n'
        f'<tr><td>👤 {_esc(t["sup"])}</td><td align="right"><b>{name}</b></td></tr>\n'
        f'<tr><td>📅 {_esc(t["day"])}</td><td align="right">{target:%d.%m.%Y}</td></tr>\n'
        f'<tr><td>📊 {_esc(t["load"])}</td><td align="right">{eff}%</td></tr>\n'
        f'<tr><td>🧑‍🍳 {_esc(t["rec"])}</td><td align="right">'
        f'<b>{fc if fc is not None else "—"} {people}</b></td></tr>\n'
        f'<tr><td>⚠️ {_esc(t["max"])}</td><td align="right">'
        f'{hi if hi is not None else "—"} {people}</td></tr>\n'
        # The plan the count is for, in the plant's own unit. Brigadirs read
        # trudoyomkost all day on «Zagruzka fayli»; the count alone made them
        # take the minutes on trust.
        f'<tr><td>📄 {_esc(t["plan"])}</td><td align="right">'
        f'{_fmt_min(plan) if plan is not None else "—"} {_esc(t["min"])}</td></tr>\n'
        '</table>')

    if fc is None:
        # No history, so there is no table to show and no average to explain —
        # say why the figures above are blank instead of leaving them bare.
        parts.append(f"<p>{_esc(t['none'])}</p>")
    else:
        # The week-by-week history is NOT repeated as a table here (the
        # operator's call, 2026-09-09): the figure above already draws those
        # points, labelled with both the worker count and the minutes, so a
        # table of the same three rows made the message long enough to bury
        # the one line that matters — the count to call. The basis sentence
        # below still says how many weeks it was averaged over, which is what
        # a reader needs in order to weigh it.
        conf = t["conf"].get(data["confidence"], data["confidence"])
        parts.append(f"<p>{_esc(basis_line(data, t))} · "
                     f"<b>{_esc(conf)}</b></p>")

    if disclaimer:
        parts.append("<blockquote>"
                     + _esc(disclaimer).replace("\n", "<br/>")
                     + "</blockquote>")
    return "\n".join(parts)
