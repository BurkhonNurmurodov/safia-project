"""What «Yordamchi» computes WITH (2026-10-19).

Two things that belong together, because the second is useless without the
first:

* **The run's data, kept whole.** Every JSON answer `call_api` brings back is
  stored for the run under a short name — ``r1``, ``r2``… — however much of
  it the model was shown (a long list is cut to fit the model's budget; the
  figure it needs is usually in the part that was cut). A `compute` result is
  kept the same way as ``c1``, ``c2``…, and a document table takes a
  ``rows_ref`` naming either, so a figure travels from the endpoint into the
  file without the model ever retyping it. In memory, per process, bounded
  (`PER_RUN_BYTES`, `TOTAL_BYTES`), dropped when the run ends. A run picked
  up on another process after a deploy finds none — the tool says so and
  the model fetches again, which is also the honest answer.

* **`compute` — exact arithmetic.** The reason the assistant used to refuse a
  table nobody exported: «21 brigadir × 30 kun by hand is not reliable» —
  true, and the fix is not to guess but to calculate. The model writes a
  short Python script over its refs; it runs in a SUBPROCESS (``python -I -S``:
  no site-packages, no environment, no user site), with a CPU limit, a memory
  limit, a wall-clock timeout, no imports, no files, no network, a whitelist
  of builtins and no ``__`` anywhere in the source (the dunder walk every
  Python sandbox escape starts from; a format string can carry one too, so
  the TEXT is checked, not only the syntax tree). The script's ``result`` —
  a number, a string, a list, a dict, or ``{"columns", "rows"}`` for a
  table — comes back JSON-serialised and is kept as a ref.

The assistant is admin-only today; running a model's code on the server is
the second reason to re-check that before opening it to anybody else.
"""
from __future__ import annotations

import ast
import json
import logging
import re
import subprocess
import sys
import threading
import time
from collections import OrderedDict
from typing import Any, Optional

log = logging.getLogger(__name__)

# ── the run's data ───────────────────────────────────────────────────────────

PER_RUN_BYTES = 24 * 1024 * 1024
TOTAL_BYTES = 96 * 1024 * 1024
RUN_TTL_S = 60 * 60
RESULT_MAX_BYTES = 8 * 1024 * 1024

_LOCK = threading.Lock()
# run_id → {"items": OrderedDict(name → (obj, size)), "n": {"r": int, "c": int},
#           "bytes": int, "touched": float}
_RUNS: dict[int, dict] = {}


def _size(obj: Any) -> int:
    try:
        return len(json.dumps(obj, ensure_ascii=False, default=str))
    except (TypeError, ValueError):
        return len(str(obj))


def put(run_id: int, kind: str, obj: Any) -> str:
    """Keep ``obj`` for the run; returns its name (``r3``, ``c1``). Oldest
    refs of the run go first when it is over its budget, oldest RUNS when the
    process is over its own."""
    size = _size(obj)
    now = time.monotonic()
    with _LOCK:
        for rid in [k for k, v in _RUNS.items() if now - v["touched"] > RUN_TTL_S]:
            _RUNS.pop(rid, None)
        run = _RUNS.setdefault(run_id, {"items": OrderedDict(), "n": {"r": 0, "c": 0},
                                        "bytes": 0, "touched": now})
        run["touched"] = now
        run["n"][kind] = run["n"].get(kind, 0) + 1
        name = f"{kind}{run['n'][kind]}"
        while run["items"] and run["bytes"] + size > PER_RUN_BYTES:
            _, (_, s) = run["items"].popitem(last=False)
            run["bytes"] -= s
        run["items"][name] = (obj, size)
        run["bytes"] += size
        total = sum(v["bytes"] for v in _RUNS.values())
        for rid, _ in sorted(((k, v["touched"]) for k, v in _RUNS.items() if k != run_id),
                             key=lambda kv: kv[1]):
            if total <= TOTAL_BYTES:
                break
            total -= _RUNS[rid]["bytes"]
            _RUNS.pop(rid, None)
    return name


def get(run_id: int, name: str) -> tuple[bool, Any]:
    with _LOCK:
        run = _RUNS.get(run_id)
        if not run:
            return False, None
        run["touched"] = time.monotonic()
        hit = run["items"].get(str(name or "").strip())
        return (True, hit[0]) if hit else (False, None)


def names(run_id: int) -> list[str]:
    with _LOCK:
        run = _RUNS.get(run_id)
        return list(run["items"].keys()) if run else []


def drop(run_id: int) -> None:
    with _LOCK:
        _RUNS.pop(run_id, None)


def describe(obj: Any, depth: int = 2) -> str:
    """The SHAPE of a payload in one line — keys, list lengths, a value's
    type — so the model can write a script over data it was shown only the
    head of."""
    def d(o: Any, lvl: int) -> str:
        if isinstance(o, dict):
            if lvl >= depth:
                return "{…%d keys}" % len(o)
            parts = [f"{k}: {d(v, lvl + 1)}" for k, v in list(o.items())[:24]]
            if len(o) > 24:
                parts.append(f"… {len(o) - 24} more keys")
            return "{" + ", ".join(parts) + "}"
        if isinstance(o, list):
            if not o:
                return "[]"
            return f"[{len(o)} × {d(o[0], lvl + 1)}]"
        if isinstance(o, bool):
            return "bool"
        if isinstance(o, (int, float)):
            return "number"
        if isinstance(o, str):
            return "str"
        if o is None:
            return "null"
        return type(o).__name__
    return d(obj, 0)[:1500]


def missing_message(run_id: int, name: str) -> str:
    have = names(run_id)
    if have:
        return (f"«{name}» is not kept for this answer (available: {', '.join(have)}) — "
                f"fetch it again with call_api, or compute it again")
    return (f"«{name}» is not kept any more (the server was updated while you worked) — "
            f"fetch the data again with call_api and compute again")


# ── the sandbox ──────────────────────────────────────────────────────────────

CPU_S = 10
WALL_S = 15
MEM_BYTES = 1024 * 1024 * 1024
CODE_MAX = 20_000
OUTPUT_MAX = 20_000

_REF_NAME = re.compile(r"\b([rc]\d{1,3})\b")

_BANNED_NODES = (ast.Import, ast.ImportFrom, ast.AsyncFunctionDef, ast.Await,
                 ast.AsyncFor, ast.AsyncWith)
_BANNED_NAMES = frozenset({
    "exec", "eval", "compile", "open", "input", "breakpoint", "exit", "quit", "help",
    "globals", "locals", "vars", "dir", "getattr", "setattr", "delattr", "hasattr",
    "memoryview", "super", "classmethod", "staticmethod", "property", "id", "hash",
})

# What the script may use; everything else a Python program has is absent.
_SAFE_BUILTINS = (
    "abs", "all", "any", "bool", "bytes", "callable", "chr", "dict", "divmod",
    "enumerate", "filter", "float", "format", "frozenset", "int", "isinstance",
    "issubclass", "iter", "len", "list", "map", "max", "min", "next", "ord", "pow",
    "range", "repr", "reversed", "round", "set", "slice", "sorted", "str", "sum",
    "tuple", "type", "zip", "True", "False", "None",
    "Exception", "ValueError", "TypeError", "KeyError", "IndexError",
    "ZeroDivisionError", "ArithmeticError", "StopIteration", "AttributeError",
    "LookupError", "RuntimeError", "AssertionError", "NotImplementedError",
)

_RUNNER = r'''
import json, sys, io, math, statistics, re, itertools, functools, resource
from datetime import date, datetime, timedelta
from collections import Counter, defaultdict, OrderedDict
from decimal import Decimal

env = json.loads(sys.stdin.buffer.read().decode("utf-8"))
resource.setrlimit(resource.RLIMIT_AS, (env["mem"], env["mem"]))
resource.setrlimit(resource.RLIMIT_CPU, (env["cpu"], env["cpu"] + 2))
resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
try:
    resource.setrlimit(resource.RLIMIT_NPROC, (0, 0))
except (ValueError, OSError):
    pass

out = io.StringIO()
def _print(*a, sep=" ", end="\n", **k):
    if out.tell() < env["out_max"]:
        out.write(sep.join(str(x) for x in a) + end)

import builtins as _b
safe = {n: getattr(_b, n) for n in env["builtins"] if hasattr(_b, n)}
safe["print"] = _print
ns = {"__builtins__": safe, "math": math, "statistics": statistics, "re": re,
      "json": json, "itertools": itertools, "reduce": functools.reduce,
      "date": date, "datetime": datetime, "timedelta": timedelta,
      "Counter": Counter, "defaultdict": defaultdict, "OrderedDict": OrderedDict,
      "Decimal": Decimal}
ns.update(env["vars"])

def _default(o):
    if isinstance(o, (date, datetime)):
        return o.isoformat()
    if isinstance(o, (set, frozenset, tuple)):
        return list(o)
    if isinstance(o, Decimal):
        return float(o)
    return str(o)

answer = {}
try:
    exec(compile(env["code"], "<compute>", "exec"), ns)
    if "result" not in ns:
        answer = {"ok": False, "error": "the script set no `result` — assign the answer to a variable named result"}
    else:
        body = json.dumps(ns["result"], ensure_ascii=False, default=_default)
        if len(body) > env["result_max"]:
            answer = {"ok": False, "error": "the result is too large (%d MB) — aggregate it, or keep only the columns the user needs" % (len(body) // (1024 * 1024))}
        else:
            answer = {"ok": True, "result": json.loads(body)}
except SyntaxError as exc:
    answer = {"ok": False, "error": "syntax error at line %s: %s" % (exc.lineno, exc.msg)}
except MemoryError:
    answer = {"ok": False, "error": "out of memory — work over fewer rows at a time"}
except BaseException as exc:
    import traceback
    tb = traceback.extract_tb(exc.__traceback__)
    line = next((f.lineno for f in reversed(tb) if f.filename == "<compute>"), None)
    answer = {"ok": False, "error": "%s: %s%s" % (type(exc).__name__, exc, " (line %d)" % line if line else "")}
answer["output"] = out.getvalue()[:env["out_max"]]
sys.stdout.buffer.write(json.dumps(answer, ensure_ascii=False, default=_default).encode("utf-8"))
'''


def check_code(code: str) -> Optional[str]:
    """Why this script may not run — or None. Checked on the TEXT as well as
    the tree: a dunder inside a format string never reaches the tree."""
    if not code or not code.strip():
        return "the script is empty"
    if len(code) > CODE_MAX:
        return f"the script is too long ({len(code)} chars; at most {CODE_MAX})"
    if "__" in code:
        return "double underscores are not allowed anywhere in the script"
    try:
        tree = ast.parse(code, "<compute>", "exec")
    except SyntaxError as exc:
        return f"syntax error at line {exc.lineno}: {exc.msg}"
    for node in ast.walk(tree):
        if isinstance(node, _BANNED_NODES):
            return ("imports are not allowed — math, statistics, re, json, itertools, reduce, "
                    "date/datetime/timedelta, Counter/defaultdict/OrderedDict and Decimal are "
                    "already available by name")
        if isinstance(node, ast.Name) and node.id in _BANNED_NAMES:
            return f"`{node.id}` is not allowed here"
        if isinstance(node, ast.Attribute) and node.attr.startswith("_"):
            return f"attribute `{node.attr}` is not allowed here"
    return None


def wanted_refs(code: str) -> list[str]:
    seen: list[str] = []
    for m in _REF_NAME.finditer(code or ""):
        if m.group(1) not in seen:
            seen.append(m.group(1))
    return seen


def run(code: str, variables: dict) -> dict:
    """Run the script in the sandbox. Returns {"ok", "result"|"error", "output"}.
    Blocking — call it from a worker thread."""
    env = {"code": code, "vars": variables, "mem": MEM_BYTES, "cpu": CPU_S,
           "out_max": OUTPUT_MAX, "result_max": RESULT_MAX_BYTES,
           "builtins": list(_SAFE_BUILTINS)}
    try:
        payload = json.dumps(env, ensure_ascii=False, default=str).encode("utf-8")
    except (TypeError, ValueError) as exc:
        return {"ok": False, "error": f"the data could not be handed to the script: {exc}", "output": ""}
    t0 = time.monotonic()
    try:
        proc = subprocess.run(
            [sys.executable, "-I", "-S", "-c", _RUNNER],
            input=payload, capture_output=True, timeout=WALL_S,
            env={"LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"},
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "output": "",
                "error": f"the script ran longer than {WALL_S} s and was stopped — simplify it, "
                         f"or work over fewer rows"}
    except OSError as exc:
        log.exception("assistant compute: could not start the sandbox")
        return {"ok": False, "error": f"the sandbox could not start: {exc}", "output": ""}
    secs = round(time.monotonic() - t0, 2)
    raw = proc.stdout.decode("utf-8", errors="replace").strip()
    if raw:
        try:
            answer = json.loads(raw)
            answer["seconds"] = secs
            return answer
        except ValueError:
            pass
    err = proc.stderr.decode("utf-8", errors="replace").strip().splitlines()
    tail = err[-1][:400] if err else ""
    if proc.returncode and proc.returncode < 0:
        tail = tail or f"killed by signal {-proc.returncode}"
    if "MemoryError" in tail or proc.returncode in (-9, 137):
        tail = "out of memory — work over fewer rows at a time"
    elif "CPU time" in tail or proc.returncode in (-24, 152):
        tail = f"used more than {CPU_S} s of CPU — simplify the script"
    return {"ok": False, "error": tail or f"the script ended without an answer (exit {proc.returncode})",
            "output": "", "seconds": secs}
