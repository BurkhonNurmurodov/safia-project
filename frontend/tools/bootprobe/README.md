# Boot probe — reproduce "App failed to start" reports

Two small tools for the boot-diagnostics overlay in `frontend/index.html`
(the ES5 script that paints the slow-connection / stale-version / recovery
screens). Neither ships to users; they exist so a pasted overlay report can be
reproduced in a minute instead of guessed at.

## `wkprobe.swift` — load the app in a real WKWebView

Telegram for macOS and iOS both run the mini app in WKWebView, so this is the
same engine class as the reports that say `AppleWebKit/605.1.15`. It loads a
URL cold (non-persistent store), mirrors every console line / `window.error` /
unhandled rejection / CSP violation to stdout, and at the given offsets prints
`__bootStage`, whether `#root` mounted, which boot screen (if any) is up, and
the Resource Timing of every asset.

```bash
swiftc -O -o /tmp/wkprobe frontend/tools/bootprobe/wkprobe.swift
/tmp/wkprobe https://production.safiacorporate.uz/ 3,8,12,20     # snapshot times in seconds
```

## `slowserve.py` — a static server that misbehaves on purpose

Serves `frontend/dist` (build first: `cd frontend && npx vite build`) with the
SPA fallback, and breaks the ENTRY chunk in one chosen way:

| `MODE`    | what happens to `/assets/index-*.js`                    | expected screen                          |
|-----------|---------------------------------------------------------|------------------------------------------|
| `delay`   | held for `DELAY` seconds (default 14), then served       | "Loading… slow connection" at 10s, then the app; overlay removed on mount |
| `404`     | 404 (stale hash after a redeploy)                        | "A new version is available" → one reload → "Update needed" |
| `drop`    | connection cut mid-body; `HEAD` still answers 200        | recovery card, details say `re-check: HTTP 200` |
| `corrupt` | garbage prepended (parse error)                          | recovery card, details carry the SyntaxError |

```bash
MODE=delay DELAY=14 PORT=8765 python3 frontend/tools/bootprobe/slowserve.py &
/tmp/wkprobe http://127.0.0.1:8765/ 8,11.5,19
```

`/api/*` answers 404 JSON, so the app boots to its login/error state — enough
to prove the bundle ran and React painted, which is all the overlay cares about.
