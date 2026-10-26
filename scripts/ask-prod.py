#!/usr/bin/env python3
"""Ask production a question through the report door (CLAUDE.md «The report door»).

    scripts/ask-prod.py sql  --to burkhon --why "…" "SELECT …"
    scripts/ask-prod.py get  --to abbos   --why "…" /api/heatmap date_from=2026-10-01 date_to=2026-10-25
    scripts/ask-prod.py wait <token>      # keep waiting for a tap, then take
    scripts/ask-prod.py take <token>      # take an answer already allowed
    scripts/ask-prod.py status <token>
    scripts/ask-prod.py door              # open or closed, the reader role, the bounds

The person named by --to gets a Telegram card with the whole question; the
script waits for their tap (up to --wait seconds, default 540 — under the
Bash tool's 10-minute cap), then takes the answer ONCE and prints it as JSON
(or writes it to --out). Ask the operator WHICH person every time.

The ask key comes from $SAFIA_OPS_KEY, else ~/.safia/ops.key. In a cloud
session the environment's credential may inject it instead (header X-Ops-Key,
or Authorization: Bearer); with no key here the request goes without one.
Base URL: $SAFIA_PROD_URL (default https://production.safiacorporate.uz).
Stdlib only.

Exit codes: 0 answered · 1 the question ran and failed · 2 refused / denied /
expired · 3 still waiting (resume with `wait`) · 4 the network failed.
"""
from __future__ import annotations

import argparse
import http.client
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = os.environ.get("SAFIA_PROD_URL", "https://production.safiacorporate.uz").rstrip("/")
UA = "safia-ask-prod/1"
# Answers that mean «not now», never «no»: a deploy swap, Cloudflare between
# us and the origin, a worker respawning.
TRANSIENT = {0, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524}
EXIT_NETWORK = 4


class NetworkError(Exception):
    pass


def _key() -> str:
    k = (os.environ.get("SAFIA_OPS_KEY") or "").strip()
    if k:
        return k
    f = Path.home() / ".safia" / "ops.key"
    try:
        return f.read_text().strip()
    except OSError:
        return ""


def _asker() -> str:
    label = os.environ.get("SAFIA_OPS_ASKER")
    if label:
        return label
    return "Claude · cloud" if os.environ.get("CLAUDE_CODE_REMOTE") == "true" else "Claude · laptop"


def call(method: str, path: str, body: dict | None = None, timeout: float = 120.0):
    headers = {"User-Agent": UA, "Accept": "application/json"}
    key = _key()
    if key:
        headers["X-Ops-Key"] = key
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read()
            try:
                return res.status, json.loads(raw or b"null")
            except ValueError:
                return res.status, {"detail": raw[:500].decode("utf-8", "replace")}
    except urllib.error.HTTPError as e:
        try:
            raw = e.read()
        except (OSError, http.client.HTTPException):
            raw = b""
        try:
            return e.code, json.loads(raw or b"null")
        except ValueError:
            return e.code, {"detail": raw[:500].decode("utf-8", "replace")}
    except urllib.error.URLError as e:
        reason = getattr(e, "reason", e)
        if "403" in str(reason) or "tunnel" in str(reason).lower():
            reason = (f"{reason} — in a cloud session production.safiacorporate.uz must be on "
                      "the environment's Allowed domains")
        raise NetworkError(str(reason))
    except (OSError, http.client.HTTPException) as e:      # reset, timeout mid-answer
        raise NetworkError(f"{e.__class__.__name__}: {e}")


def call_retry(method: str, path: str, body: dict | None = None, tries: int = 5):
    """`call` for a request that is safe to repeat (a status read): a network
    blip or a transient 5xx is tried again with a growing wait."""
    wait_s = 2
    for i in range(tries):
        try:
            code, res = call(method, path, body)
            if code not in TRANSIENT or i == tries - 1:
                return code, res
        except NetworkError:
            if i == tries - 1:
                raise
        time.sleep(wait_s)
        wait_s = min(wait_s * 2, 20)
    return 0, None


def _detail(payload) -> str:
    d = (payload or {}).get("detail") if isinstance(payload, dict) else payload
    if isinstance(d, dict):
        return f"{d.get('code')}: {d.get('message')}"
    return str(d)


def _emit(result: dict, out: str | None) -> None:
    text = json.dumps(result, ensure_ascii=False, indent=1)
    if out:
        Path(out).write_text(text)
        n = result.get("row_count", result.get("status"))
        print(f"written to {out} ({len(text)} bytes, {n} {'rows' if 'row_count' in result else 'HTTP'})",
              file=sys.stderr)
    else:
        print(text)
    if result.get("truncated"):
        print(f"NOTE: cut ({result['truncated']}) — narrow the question for the rest.", file=sys.stderr)
    if result.get("masked"):
        print(f"NOTE: masked: {', '.join(result['masked'])}", file=sys.stderr)


def take(token: str, out: str | None) -> int:
    for attempt in range(6):
        try:
            code, res = call("POST", f"/api/ops/asks/{token}/take")
        except NetworkError as e:
            print(f"the take failed on the way ({e}). The answer may have been consumed — check "
                  f"with:  scripts/ask-prod.py status {token}  (if it says done, ask again).",
                  file=sys.stderr)
            return EXIT_NETWORK
        d = res.get("detail") if isinstance(res, dict) else None
        code_s = d.get("code") if isinstance(d, dict) else None
        if code == 409 and code_s == "busy" and attempt < 5:
            time.sleep(4)               # another answer is being read; this one stays allowed
            continue
        break
    if code not in (200, 422):
        print(f"take refused ({code}) — {_detail(res)}", file=sys.stderr)
        if code_s == "busy":
            print(f"still allowed — resume with:  scripts/ask-prod.py take {token}", file=sys.stderr)
            return 3
        if code in TRANSIENT:
            print("the answer may already have been read on the server — check with:  "
                  f"scripts/ask-prod.py status {token}  (if it says done, ask again; if approved, "
                  f"take it:  scripts/ask-prod.py take {token})", file=sys.stderr)
            return 3
        return 2
    _emit(res, out)
    if not res.get("ok"):
        print(f"the question ran and failed: {res.get('error')}", file=sys.stderr)
        return 1
    return 0


def wait(token: str, seconds: int, out: str | None) -> int:
    deadline = time.monotonic() + seconds
    last = None
    while True:
        try:
            code, st = call_retry("GET", f"/api/ops/asks/{token}")
        except NetworkError as e:
            print(f"lost the connection ({e}) — resume with:  scripts/ask-prod.py wait {token}",
                  file=sys.stderr)
            return EXIT_NETWORK
        if code != 200:
            print(f"status refused ({code}) — {_detail(st)}", file=sys.stderr)
            if code in TRANSIENT:
                print(f"resume with:  scripts/ask-prod.py wait {token}", file=sys.stderr)
                return 3
            return 2
        s = st.get("status")
        if s != last:
            print(f"[{time.strftime('%H:%M:%S')}] {s}", file=sys.stderr)
            last = s
        if s == "approved":
            return take(token, out)
        if s in ("denied", "expired", "done", "failed", "running"):
            print(f"nothing to take: the question is {s}.", file=sys.stderr)
            return 2
        if time.monotonic() > deadline:
            print(f"still {s} — resume with:  scripts/ask-prod.py wait {token}", file=sys.stderr)
            return 3
        time.sleep(3)


def main() -> int:
    ap = argparse.ArgumentParser(description="Ask production through the report door.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("sql", "get"):
        p = sub.add_parser(name)
        p.add_argument("--to", required=True, choices=["burkhon", "abbos"])
        p.add_argument("--why", default="")
        p.add_argument("--out")
        p.add_argument("--wait", type=int, default=540)
        if name == "sql":
            p.add_argument("--as-app", action="store_true",
                           help="run as the app's user (to read pg_stat_activity), not the reader role")
            p.add_argument("query", help="the SQL, or @file to read it from a file")
        else:
            p.add_argument("path")
            p.add_argument("params", nargs="*", help="name=value; repeat a name for a list")
    for name in ("wait", "take", "status"):
        p = sub.add_parser(name)
        p.add_argument("token")
        p.add_argument("--out")
        p.add_argument("--wait", type=int, default=540)
    sub.add_parser("door")
    a = ap.parse_args()

    try:
        return _run(a)
    except NetworkError as e:
        print(f"cannot reach {BASE}: {e}", file=sys.stderr)
        return EXIT_NETWORK


def _run(a) -> int:
    if a.cmd == "door":
        code, res = call_retry("GET", "/api/ops/door")
        print(json.dumps(res, ensure_ascii=False, indent=1))
        return 0 if code == 200 else 2
    if a.cmd == "status":
        code, res = call_retry("GET", f"/api/ops/asks/{a.token}")
        print(json.dumps(res, ensure_ascii=False, indent=1))
        return 0 if code == 200 else 2
    if a.cmd == "take":
        return take(a.token, a.out)
    if a.cmd == "wait":
        return wait(a.token, a.wait, a.out)

    body = {"verb": a.cmd, "to": a.to, "why": a.why, "asker": _asker()}
    if a.cmd == "sql":
        q = a.query
        if q.startswith("@"):
            q = Path(q[1:]).read_text()
        body["sql"] = q
        body["as_app"] = bool(a.as_app)
    else:
        params: dict = {}
        for kv in a.params:
            k, _, v = kv.partition("=")
            if k in params:
                params[k] = (params[k] if isinstance(params[k], list) else [params[k]]) + [v]
            else:
                params[k] = v
        body["path"] = a.path
        body["params"] = params
    code, res = call("POST", "/api/ops/asks", body)
    if code != 200:
        print(f"ask refused ({code}) — {_detail(res)}", file=sys.stderr)
        return 2
    token = res["token"]
    print(f"asked {res.get('approver')} — card sent, answer by {res.get('expires_at')}. "
          f"token {token}", file=sys.stderr)
    return wait(token, a.wait, a.out)


if __name__ == "__main__":
    sys.exit(main())
