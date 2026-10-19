"""Inline buttons the Bot API has and our pinned telebot (4.25) does not.

Two fields, both sent as raw JSON through telebot's own serialisation — every
keyboard goes out through `InlineKeyboardMarkup.to_dict()`, which calls each
button's `to_dict()`, so a button built here rides every existing
`send_message` / `edit_message_*` call with nothing else changed:

- `style` (Bot API 9.4): "success" (green), "danger" (red), "primary" (blue).
  Used on an APPROVE (green) and a REJECT (red) button and nowhere else — a
  colour is a statement about what a tap does, and two colours that mean two
  opposite decisions are the only statement worth making on a card.
- `disabled` (Bot API 10.3): the button is shown and does nothing. It is a
  button TYPE of its own — exactly one action field per button — so a
  disabled button carries no `callback_data`, `url` or `web_app`: a tap sends
  nothing to anybody, whatever app draws it. That is the whole safety
  argument for an app too old to know the field: it has nothing to act on.

Upgrading telebot instead was considered and rejected: twelve releases of
changes under the whole bot (webhook parsing, every handler) to gain two
fields, on a pipeline that deploys straight to production.

Incoming updates are unaffected: telebot's `InlineKeyboardButton.__init__`
swallows unknown keys (`**kwargs`), so a callback from a message that carries
a disabled button parses exactly as before.
"""
from __future__ import annotations

from telebot import types

STYLES = ("success", "danger", "primary")

# Telegram draws a button on one line and cuts what does not fit; 60 is the
# cap `_lt_btn` already applies, kept for every label built here.
_MAX = 60


class Button(types.InlineKeyboardButton):
    """An inline button that may also carry `style` and `disabled`."""

    def __init__(self, text: str, *, style: str | None = None,
                 disabled: bool = False, **kwargs):
        super().__init__(str(text)[:_MAX], **kwargs)
        self.style = style if style in STYLES else None
        self.disabled = bool(disabled)

    def to_dict(self):
        d = super().to_dict()
        if self.disabled:
            # A type of its own: no action field may ride along, or the Bot
            # API refuses the whole keyboard.
            d = {"text": d["text"], "disabled": {}}
        if self.style:
            d["style"] = self.style
        return d


def disabled(text: str) -> Button:
    """A button that states something and does nothing — never coloured."""
    return Button(text, disabled=True)


def approve(text: str, callback_data: str) -> Button:
    return Button(text, style="success", callback_data=callback_data)


def reject(text: str, callback_data: str) -> Button:
    return Button(text, style="danger", callback_data=callback_data)


def surname_initial(name) -> str:
    """«Aripova Manzura» → «Aripova M.» — the twin of
    `utils/personName.js#surnameInitial`; keep the two in step. A one-word
    name is left as it is."""
    parts = str(name or "").split()
    if len(parts) < 2:
        return parts[0] if parts else ""
    return f"{parts[0]} {parts[1][0].upper()}."


def outcome_label(label: str, who=None, lang: str = "uz") -> str:
    """The text of a decided card's button: the outcome, then who decided it,
    in the reader's script — «✅ Tasdiqlandi · Aripova M.». The name is cut to
    surname + initial because a button is one line on a phone."""
    if not who:
        return label
    from app.translit import transliterate
    name = surname_initial(transliterate(str(who), lang) or who)
    return f"{label} · {name}" if name else label


class ReplyPrompt(types.InlineKeyboardMarkup):
    """An inline keyboard that also opens the reader's reply field (Bot API
    10.3, `InlineKeyboardMarkup.force_reply`) — a question with a «Bekor
    qilish» button under it, which a plain `ForceReply` cannot carry. The
    field is fixed when the message is SENT (the spec: it "can't be changed
    when the inline keyboard is edited"), so it belongs on a prompt, never on a
    card. `plain()` drops it: an app or API that refuses it still gets the
    question and the button, and the answer is read the same way."""

    def to_dict(self):
        d = super().to_dict()
        d["force_reply"] = True
        return d


def _uses_new(markup) -> bool:
    if isinstance(markup, ReplyPrompt):
        return True
    rows = getattr(markup, "keyboard", None) or []
    return any(isinstance(b, Button) and (b.disabled or b.style)
               for row in rows for b in row)


def plain(markup):
    """The same keyboard as telebot 4.25 would have sent it: disabled buttons
    dropped, colours removed. The fallback `send` retries with."""
    if not _uses_new(markup):
        return markup
    kb = types.InlineKeyboardMarkup()
    for row in markup.keyboard:
        out = []
        for b in row:
            if isinstance(b, Button) and b.disabled:
                continue
            d = types.InlineKeyboardButton.to_dict(b)
            out.append(types.InlineKeyboardButton.de_json(d))
        if out:
            kb.keyboard.append(out)
    return kb if kb.keyboard else None


def send(fn, *args, reply_markup=None, **kwargs):
    """Call a telebot send / edit with a keyboard that may carry the new
    fields; if Telegram REFUSES the request (a 400 other than «not modified»)
    while it carries them, log it and send it again as `plain()` — what the
    screen showed before this module existed. Built because these fields could
    not be tried against Telegram from where they were written: a refusal must
    cost the colour or the disabled button, never the leader's screen or a
    decided card's outcome."""
    from telebot.apihelper import ApiTelegramException
    try:
        return fn(*args, reply_markup=reply_markup, **kwargs)
    except ApiTelegramException as exc:
        text = str(getattr(exc, "description", "") or exc).lower()
        if (getattr(exc, "error_code", None) != 400 or "not modified" in text
                or not _uses_new(reply_markup)):
            raise
        import logging
        logging.getLogger(__name__).warning(
            "Telegram refused a styled/disabled keyboard (%s) — sent it plain",
            text[:200])
        return fn(*args, reply_markup=plain(reply_markup), **kwargs)
