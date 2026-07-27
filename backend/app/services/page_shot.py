"""Server-side screenshots of real SPA pages, for the bot's page commands.

``capture()`` mints a render token (``app/render_token.py``), then shells out to
this very module's ``__main__`` to drive a headless Chromium over the live page
and returns the PNG bytes.

Why a subprocess and not an in-process Playwright call:

  * The bot's handlers run **inline inside the webhook request** (see the
    threaded=False note in ``telegram_bot.py``). Playwright's sync API refuses
    to start when an asyncio loop is already running on the thread, and its
    async API would need the whole bot to be async. A subprocess sidesteps both.
  * Chromium peaks around 400 MB. In-process that memory stays attached to a
    long-lived Passenger worker; as a subprocess the OS reclaims all of it the
    moment the shot is done.
  * A Chromium that hangs or segfaults takes the subprocess down, not the web
    worker — the timeout below turns it into a normal error reply.

The page is loaded in "render mode" (``?render=<token>``), which the frontend
uses to log in without Telegram initData, hide the app chrome, freeze
animations, and expose ``window.__RENDER_READY__`` once its data has landed.
See ``frontend/src/utils/renderMode.js``.
"""
import logging
import os
import subprocess
import sys
import tempfile
import time

from app.config import settings
from app.render_token import make_render_token

logger = logging.getLogger(__name__)

# Desktop-width shot: the dashboards lay out their KPI cards in a row here, so
# the image reads like the page does on a laptop rather than a phone. The height
# only seeds the viewport — the capture is full-page.
VIEWPORT = (1440, 1400)

# Chromium needs the page settled, not just loaded: React has to mount, the data
# queries have to resolve and ApexCharts has to draw. The frontend flips
# __RENDER_READY__ when that is done; these bound the wait if it never does.
READY_TIMEOUT_MS = 45_000
SETTLE_MS = 900


class ShotError(RuntimeError):
    """Raised when the screenshot could not be produced. The message is safe to
    log; callers show the user a generic failure instead."""


def _interpreter() -> str:
    """Python that runs the screenshot subprocess — and it must be the venv's.

    ``sys.executable`` is NOT reliable here: under Passenger it reported an
    interpreter whose site-packages had no playwright, so the child imported
    ``app.services.page_shot`` fine (cwd is on sys.path) and then died on
    ``import playwright``. ``sys.prefix`` points at the venv root in the same
    process, so its ``bin/python`` is the interpreter that actually holds the
    installed dependencies. RENDER_PYTHON overrides everything for the case
    where neither is right.
    """
    candidates = [
        settings.render_python,
        os.path.join(sys.prefix, "bin", "python"),
        os.path.join(sys.prefix, "bin", "python3"),
        sys.executable,
    ]
    for path in candidates:
        if path and os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    return sys.executable


def page_url(path: str, telegram_id: int) -> str:
    origin = settings.render_origin
    if not origin:
        raise ShotError("No render origin configured (set WEBAPP_URL or RENDER_BASE_URL)")
    return f"{origin}{path}?render={make_render_token(telegram_id)}"


def capture(path: str, telegram_id: int) -> bytes:
    """PNG of ``path`` (e.g. "/downtime") rendered as the given Telegram user.

    Raises ShotError with a diagnosable message on any failure — a missing
    Chromium, a timeout, a crash, or a page that never signalled ready.
    """
    url = page_url(path, telegram_id)
    python = _interpreter()
    fd, out = tempfile.mkstemp(prefix="pageshot-", suffix=".png")
    os.close(fd)
    try:
        proc = subprocess.run(
            [python, "-m", "app.services.page_shot", url, out],
            cwd=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            capture_output=True,
            text=True,
            timeout=settings.render_timeout_sec,
        )
        if proc.returncode != 0:
            # stderr carries Playwright's own message — "Executable doesn't
            # exist" when chromium was never installed, the missing .so when the
            # system libraries are absent. Keep it: it is the whole diagnosis.
            raise ShotError(
                f"Screenshot subprocess failed (exit {proc.returncode}, "
                f"python={python}): {(proc.stderr or proc.stdout or '').strip()[-1500:]}"
            )
        # A shot can succeed and still be wrong — e.g. the page never signalled
        # ready and we captured skeletons. That only shows up on stderr, so
        # surface it rather than letting a blank-looking PNG go unexplained.
        if proc.stderr and proc.stderr.strip():
            logger.warning("Screenshot of %s produced warnings: %s",
                           path, proc.stderr.strip()[-500:])
        with open(out, "rb") as fh:
            data = fh.read()
        if not data:
            raise ShotError("Screenshot subprocess produced an empty file")
        return data
    except subprocess.TimeoutExpired:
        raise ShotError(f"Screenshot timed out after {settings.render_timeout_sec}s")
    except FileNotFoundError as exc:
        raise ShotError(f"Screenshot subprocess could not start: {exc}")
    finally:
        try:
            os.unlink(out)
        except OSError:
            pass


# ── Subprocess entry point ────────────────────────────────────────────────────
# Runs in its own interpreter: `python -m app.services.page_shot <url> <out.png>`
# Importing playwright lazily here keeps the web process free of it entirely.

# --no-sandbox: shared/cPanel kernels routinely disallow the user namespaces
# Chromium's sandbox needs, and it refuses to start without this there. The page
# we load is our own app, not untrusted content.
LAUNCH_ARGS = ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"]


def _launch(p):
    """First Chromium that actually starts, cheapest first.

    Disk quota is the binding constraint on cPanel, so we prefer builds that
    take the least of it:

      1. ``CHROME_PATH`` — a browser already on the box (a host-provided
         chromium, a shared Chrome). Costs zero quota.
      2. ``chromium-headless-shell`` — Playwright's headless-only build,
         roughly a third of the full download. We never render headful, so
         this is all we need: `playwright install --only-shell chromium`.
      3. Full chromium — what `playwright install chromium` fetches.

    Every attempt's error is kept, so a total failure reports all three reasons
    instead of just the last one.
    """
    from playwright.sync_api import Error as PlaywrightError

    attempts, errors = [], []
    if settings.chrome_path:
        attempts.append(("CHROME_PATH", {"executable_path": settings.chrome_path}))
    attempts.append(("headless-shell", {"channel": "chromium-headless-shell"}))
    attempts.append(("chromium", {}))

    for label, kwargs in attempts:
        try:
            return p.chromium.launch(headless=True, args=LAUNCH_ARGS, **kwargs)
        except PlaywrightError as exc:
            errors.append(f"[{label}] {str(exc).strip()[:400]}")
    raise ShotError("No usable Chromium. Tried:\n" + "\n".join(errors))


def _run(url: str, out_path: str, debug: bool = False) -> None:
    from playwright.sync_api import Error as PlaywrightError, sync_playwright

    width, height = VIEWPORT
    with sync_playwright() as p:
        browser = _launch(p)
        try:
            ctx = browser.new_context(
                viewport={"width": width, "height": height},
                device_scale_factor=2,  # retina-sharp text in the Telegram photo
                locale="ru-RU",
                # Chromium advertises "HeadlessChrome" by default, which the
                # host's Imunify360 WebShield treats as a bot — it answers with
                # a challenge page instead of the app, and the load never
                # settles. We are rendering our OWN app, so present the ordinary
                # desktop Chrome UA the same build would send headful.
                user_agent=(
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
                ),
            )
            page = ctx.new_page()

            if debug:
                # Everything needed to tell "the bundle has no render mode" from
                # "render mode ran but readiness never fired" apart.
                page.on("console", lambda m: print(f"[console.{m.type}] {m.text}",
                                                   file=sys.stderr))
                page.on("pageerror", lambda e: print(f"[pageerror] {e}", file=sys.stderr))
                page.on("requestfailed", lambda r: print(
                    f"[reqfail] {r.url} — {r.failure}", file=sys.stderr))
                page.on("framenavigated", lambda f: (
                    f == page.main_frame and print(f"[nav] {f.url}", file=sys.stderr)))
                page.on("response", lambda r: r.status >= 400 and print(
                    f"[http {r.status}] {r.url}", file=sys.stderr))

            # index.html pulls Inter from fonts.googleapis.com, and that <link>
            # sits ABOVE the scripts — a stylesheet the datacenter can't reach
            # blocks every script after it, so React never mounts and
            # DOMContentLoaded never fires. Answer those requests ourselves with
            # empty CSS: the page falls back to the system sans (near-identical
            # metrics to Inter) and renders immediately. A screenshot must never
            # depend on a third party being reachable.
            for pattern in ("**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**"):
                page.route(pattern, lambda route: route.fulfill(
                    status=200, content_type="text/css", body=""))

            # "commit" = as soon as the response starts, NOT once sub-resources
            # settle. Readiness is __RENDER_READY__'s job (below); waiting on
            # load events here only re-introduces the third-party stall.
            page.goto(url, wait_until="commit", timeout=READY_TIMEOUT_MS)

            # Poll from Python on a wall-clock deadline instead of
            # page.wait_for_function(). Its timeout did NOT hold in practice: a
            # page that navigates (a reload, a redirect) restarts the wait, so a
            # reloading app kept one 45 s wait alive for minutes. This loop can't
            # be extended by anything the page does.
            ready_timeout = (READY_TIMEOUT_MS if not debug else 15_000) / 1000
            deadline = time.monotonic() + ready_timeout
            ready = False
            while time.monotonic() < deadline:
                try:
                    if page.evaluate("window.__RENDER_READY__ === true"):
                        ready = True
                        break
                except PlaywrightError:
                    pass  # mid-navigation; the context is briefly gone
                page.wait_for_timeout(250)

            if not ready:
                # Shoot what is on screen rather than failing outright — a
                # partial page beats no reply, and the state below says why.
                print("warning: __RENDER_READY__ never became true", file=sys.stderr)
                try:
                    state = page.evaluate(
                        "({url: location.href, title: document.title,"
                        " ready: typeof window.__RENDER_READY__,"
                        " rootHtml: (document.getElementById('root')||{}).innerHTML"
                        "            ? 'non-empty' : 'EMPTY',"
                        " bodyText: document.body ? document.body.innerText.slice(0,300) : ''})"
                    )
                    print(f"page state: {state}", file=sys.stderr)
                except PlaywrightError as exc:
                    print(f"page state unavailable: {exc}", file=sys.stderr)

            page.wait_for_timeout(SETTLE_MS)
            page.screenshot(path=out_path, full_page=True)
        finally:
            browser.close()


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--debug"]
    if len(args) != 2:
        print("usage: python -m app.services.page_shot <url> <out.png> [--debug]",
              file=sys.stderr)
        raise SystemExit(2)
    _run(args[0], args[1], debug="--debug" in sys.argv)
