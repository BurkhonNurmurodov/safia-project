"""How a generated workbook reaches the person who asked for it.

Inside Telegram the answer has always been a DM: there is no useful "downloads
folder" in a mini-app WebView, and the file lands in a chat the person already
has open on their phone. That stays exactly as it was.

In a browser it is the wrong answer. Someone sitting at a laptop asking for an
Excel file wants the Excel file, not a detour through their phone — and
working with these files is most of why the dashboard is on the web at all. So
a browser session gets the bytes.

One helper decides, so the rule lives in one place instead of being re-derived
(or forgotten) at each of the half-dozen export endpoints.
"""
import logging
from urllib.parse import quote

from fastapi import Request, Response

log = logging.getLogger(__name__)

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def wants_download(request: Request, payload: dict) -> bool:
    """True when this caller should receive the file itself.

    Both halves are required: the token must be a BROWSER session (a Telegram
    session has no way to save a download), and the client must have asked with
    ``?download=1`` — it has to opt in before the request, because it decides
    then whether to read the response as a blob or as JSON.
    """
    return bool(payload.get("web")) and request.query_params.get("download") == "1"


def xlsx_response(filename: str, data: bytes) -> Response:
    """The workbook as a downloadable response.

    ``filename*=UTF-8''…`` carries the real name — these are Cyrillic and Uzbek
    filenames, which the bare ``filename=`` parameter cannot express — and
    Content-Disposition is exposed to JS so the browser-side helper can use it
    instead of inventing a name.
    """
    encoded = quote(filename)
    return Response(
        content=data,
        media_type=XLSX_MIME,
        headers={
            "Content-Disposition": f"attachment; filename=\"{encoded}\"; filename*=UTF-8''{encoded}",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


def deliver_xlsx(request: Request, payload: dict, filename: str, data: bytes,
                 caption: str = "", chat_id: int | None = None):
    """Download it, or DM it — and say which one happened.

    Returns either the file Response or the usual ``{"ok": True}`` JSON, so an
    endpoint adopts this by returning whatever comes back.
    """
    if wants_download(request, payload):
        return xlsx_response(filename, data)

    target = chat_id if chat_id is not None else int(payload["sub"])
    from app.telegram_bot import bot
    bot.send_document(chat_id=target, document=(filename, data), caption=caption)
    return {"ok": True, "sent": True}
