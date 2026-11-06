# Cloud sessions (claude.ai/code)

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## Cloud sessions (claude.ai/code)

A cloud session is a fresh Ubuntu 24.04 VM holding a checkout of this repo and
nothing else the project keeps outside git — no `backend/.env`, no
`.claude/launch.json`, no venv, no `node_modules`, no postgres running.
`scripts/cloud-setup.sh` rebuilds all of it and is THE definition of "the local
stack, in the cloud": one file, two callers, so the two moments cannot drift.

### gitea, not GitHub

The platform's BUILT-IN clone and pull-request path is GitHub-only, and the docs
say so plainly: non-GitHub repositories "can be sent to cloud sessions as a local
bundle, but the session can't push results back to the remote". That restriction
is about the platform's own git plumbing — the credential proxy and the PR
button. `git.safiabakery.uz` is a public HTTPS host, so a session can still talk
to gitea directly once the environment allows the domain and holds a token, and
`setup_git` in the script is that wiring: it names the `gitea` remote (a bundle
arrives with none, a mirror-cloned session arrives with `origin`), sets a
credential, fetches, and fast-forwards **only** — the `auto-pull.sh` rule, for
the same reason.

Two ways to start a session; both end up working against gitea:

1. **Bundle — no GitHub anywhere.** `CCR_FORCE_BUNDLE=1 claude --cloud "<task>"`
   from this checkout uploads the full history across all branches plus
   uncommitted changes to **tracked** files (untracked files are NOT included —
   `git add` them first; the bundle must stay under 100 MB). There is no
   terminal here to type that in, so **ask this session to run it**.
2. **The web picker, with the mirror as a delivery van.** Start from the GitHub
   mirror at claude.ai/code. The session sits on a `claude/...` branch cut from
   the mirror's main, and `setup_git` fast-forwards THAT branch onto
   `gitea/main` whenever it holds nothing of its own, so a lagging mirror costs
   nothing. The branch the platform pushes to GitHub is its own copy of the
   work; **never open or merge a PR on GitHub**. Nobody reads that repo, and the
   deploy has already happened on gitea.

**Without a `GITEA_TOKEN` the checkout is offline** — the stack still runs, but
there is no fetch, no push, and no way home except the session's own diff view.
The token is what makes a gitea cloud session usable, and it is also the whole
security question, below.

### The three values to paste, once

claude.ai/code → the cloud icon above the message box → **Add cloud environment**:

- **Network access**: `Custom`, with `git.safiabakery.uz` in **Allowed domains**
  (add `*.frame.claudeusercontent.com` if the session should read artifacts) and
  **Also include default list of common package managers** CHECKED — the
  provisioning needs npm, PyPI and `storage.googleapis.com` (headless Chrome).
  Plain `Trusted` cannot reach gitea; `None` cannot install anything.
- **The Gitea token, preferably as an API CREDENTIAL** (Pro/Max plans, in the
  EDIT dialog of an environment that already exists): type **Bearer**, allowed
  website `git.safiabakery.uz`, header `Authorization`, prefix `Bearer`, value
  the token. Anthropic's agent proxy adds it after the request leaves the VM,
  so it is in no variable, no file and no transcript. Gitea 1.27 accepts a
  Bearer token on git's smart-HTTP paths. `setup_git` no longer demands
  `GITEA_TOKEN`: it simply fetches, and the fetch is the test.
- **Environment variables** (`.env` format, one `KEY=value` per line):
  `GITEA_USER=Burkhon`, `GIT_AUTHOR_NAME=Burkhon Nurmurodov`,
  `GIT_AUTHOR_EMAIL=burkhon0207@gmail.com`, plus `GITEA_TOKEN=<token>` ONLY
  where the credential above is unavailable, and `SAFIA_CLOUD_DEPLOY=0` only to
  stop deploys. This panel is readable by anyone who can use the environment,
  so a token here should belong to a **dedicated Gitea account with write
  access to this repo only**, rotated like any deployed credential. Never put
  the backend's keys here (`TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`,
  `NOTION_TOKEN`, `INTERNAL_API_KEY`): `cloud-setup.sh` writes its own
  `backend/.env` and reads none of them, and a real bot token in a second
  backend would fight production for the webhook.
- **Setup script**:

  ```bash
  #!/bin/bash
  S=$(find /home /workspace /root /repo -maxdepth 5 -path '*/scripts/cloud-setup.sh' 2>/dev/null | head -1)
  [ -n "$S" ] && bash "$S" provision
  exit 0
  ```

  It *finds* the clone instead of naming a path, because where the clone lands is
  not contracted anywhere.

**Environment variables are not visible to the Setup script** — a known platform
limitation — only to the session. That is why the credential is written by the
SessionStart hook and never by provisioning, and why `provision` never needs the
token.

### Why the work is split between provision and the hook

Anthropic snapshots the filesystem after the Setup script, and a snapshot keeps
files, never processes — and the repo itself is a fresh clone each session.

- **Setup script → `provision`**, once per environment, before Claude launches:
  postgres role + DB, the venv, `node_modules` (kept OUTSIDE the repo and
  symlinked in, precisely because the clone is replaced), Chrome, and one full
  backend boot **so `create_all` and every startup migration land in the
  snapshot**.
- **`.claude/settings.json` SessionStart hook → no args**, every session: start
  postgres, top the deps up (keyed on the two manifest hashes, so a snapshot
  older than a dependency bump heals itself and one that isn't costs nothing),
  write `backend/.env` + `.claude/launch.json`, wire gitea, re-install the
  `node_modules` symlink and the pre-push guard, start `uvicorn :8000` and
  `vite :5173`. A hard no-op unless `CLAUDE_CODE_REMOTE=true`, and it refuses to
  run on anything but Linux, so it cannot touch a laptop.
- **`.claude/settings.json` Stop hook → `auto-commit.sh cloud`**, every turn:
  the laptop's own loop (see below).
- **`.claude/settings.json` is committed on purpose** — a cloud session gets only
  what the repo carries — which needed a `!` line against the blanket `*.json`
  ignore. `.claude/settings.local.json` and `.claude/launch.json` stay ignored.
- **The recursion guard reaches the setup script too.** The Stop hook writes its
  message with a nested `claude -p`, which fires every SessionStart hook between
  its `git add -A` and its `git commit`; `cloud-setup.sh` exits on
  `SAFIA_AUTOCOMMIT_RUNNING`, like `auto-pull.sh`, or its fetch and fast-forward
  would move the tree under a commit that is half made.
- **The backend is :8000 there, not :8001.** A fresh clone has no
  `frontend/.env.development.local`, so the UI goes through the vite `/api`
  proxy, whose target is 8000. `driver.mjs doctor` still prints the answer.

### A cloud turn deploys, exactly like a laptop turn

From **2026-09-25** (the operator's call, reversing the earlier "main is
refused" rule) a cloud session runs the six-step loop a laptop runs: pull from
gitea at the start, then at the end of every turn bump `VERSION`, build, commit,
push to gitea `main` (**the production deploy**) first and to the GitHub mirror
after. ONE script does it for both, `.claude/hooks/auto-commit.sh`, so the two
loops cannot drift. The laptop calls it with no argument from
`settings.local.json`. The cloud calls it as `auto-commit.sh cloud` from the
committed `settings.json`, which is a no-op unless `CLAUDE_CODE_REMOTE=true`, so
a laptop never runs it twice. **Local behaviour is byte-for-byte unchanged.**

**A cloud session pushes gitea `main` ITSELF, and never asks first** (the
operator, 2026-10-19: «Push it to main from there and save this decision on
the CLAUDE.md so I don't have to confirm it on every single session»). The
push to gitea `main` IS the deploy, and this paragraph is the standing
authorisation for it: do not ask for a confirmation at the end of a task, do
not stop at a push of the session's `claude/…` branch, and never read the
GitHub mirror as «shipped» — on 2026-10-19 a finished feature sat on GitHub
while production waited for a laptop. The Stop hook is the ordinary door;
whenever it has not deployed the turn (its log ended at a header, as the
all-refs fetch below did three turns running, or the harness never fired it),
the session does the same BY HAND, in the hook's own order, once the build
has passed and the commit is made: `git fetch gitea main`; if `gitea/main` is
not an ancestor of `HEAD`, `git merge gitea/main` — never a rebase, never
`--force`; `VERSION` resolves to one bump above gitea's, `frontend/dist` is
dropped and rebuilt whole, a source conflict is read and resolved by hand,
and the merged tree is built and imported before anything is pushed; then
`git push gitea HEAD:main` (retried on a network failure), and only after
that the session's own branch to GitHub. Never any other gitea branch (the
kill switch's `cloud-session` aside). `SAFIA_CLOUD_DEPLOY=0` in the
environment's variables still withdraws this, and the pre-push guard still
refuses a delete or a rewrite of `main` — the authorisation is for a
fast-forward and nothing else.

The platform forces three differences, and the cloud mode handles each:

- **Where each remote gets the turn.** The GitHub proxy accepts pushes to the
  session's OWN branch only ("`git push` works only against the session's
  current working branch"). So gitea gets `HEAD:main` and GitHub gets the
  `claude/...` branch. GitHub's `main` catches up the next time a laptop pushes.
- **What "ships" is measured against `gitea/main`, never `HEAD`.** Claude often
  commits by itself mid-turn in the cloud. The hook fetches gitea first, and a
  clean tree that is AHEAD of `gitea/main` still deploys. The patch bump fires
  when `VERSION` equals production's, so a MINOR or MAJOR Claude committed
  itself is left alone. The commit message describes the whole deploy since
  `gitea/main`. The frontend is **always rebuilt**, so the bundle carries the
  `VERSION` it ships with even when Claude committed everything itself.
- **The hook fetches `gitea/main` ALONE, under a 120 s cap** (2026-10-19). It
  fetched every ref of the remote, and from the cloud that fetch stalled past
  the hook's own 7-minute timeout three turns in a row — each run's log ended
  at its header, nothing deployed, and nothing on screen said so. The hook
  reads no other ref; a fetch of `main` takes seconds. If the log ever ends at
  a header again, the stall is before the first logged step.
- **So does the session-start script** (`scripts/cloud-setup.sh` `setup_git`,
  2026-10-19): its `git fetch gitea` of every ref made gitea pack ~244,000
  objects — 28 % done after 280 s, measured from the cloud — far past the
  SessionStart hook's 180 s cap, so no cloud session ever fast-forwarded onto
  production (this one opened 15 commits behind) and `gitea/main` was not even
  known locally. It fetches `main` alone under a 120 s cap now; the pack is
  whatever the other six branches hold that `main` does not, and nothing here
  reads them.
- **Nothing that cannot be undone.** The per-session `.git/hooks/pre-push`
  allows a fast-forward of `main` and refuses **deleting** it or **rewriting** it
  (any non-fast-forward, i.e. `--force`). If another deploy moved `gitea/main`
  during the turn, the push is refused and the turn says `GITEA PUSH FAILED —
  NOT deployed`, the same as on a laptop. And the hook unstages any **symlink**
  before committing: the cloud symlinks `frontend/node_modules` in from `/opt`,
  and `.gitignore` said `node_modules/`, which matches directories only. Without
  that, the link would have shipped to production. `.gitignore` now says
  `node_modules`, and the unstage step is the second line of defence.

**The kill switch is `SAFIA_CLOUD_DEPLOY=0`** in the environment's variables
panel. The Stop hook then pushes the session branch to gitea (`cloud-session`
when that branch is `main`) and never `main`, and the pre-push guard refuses
`main` outright. No deploy needed: variables are read at every push.

**Consequence to know:** there is no review window. The first a person sees of a
cloud turn is production, exactly as with a laptop turn. Gitea branch protection
on `main` does not break this unless it blocks the token's account; to require
review, set the kill switch rather than protecting the branch.

A merge that carries no rebuilt `frontend/dist` still deploys correctly —
`deploy/deploy.sh` rebuilds on the box when frontend sources move without it.

### What still does not come along

- **Data.** The DB is EMPTY — schema, migrations and one `admins` row
  (`ADMIN_TELEGRAM_ID=1` → `startup.seed_admins`, which is what the `__dev__`
  login resolves to). Every page loads and renders its empty state; no page
  renders a number. The laptop's DB holds real attendance for
  **2026-05-08 → 2026-05-20** — the window `driver.mjs` names in
  `DATA_START`/`DATA_END` — so a KPI, chart or export change cannot be *verified*
  in a cloud session until something seeds it. A prod `.sql.gz` from the admin
  «Backup» tab would give exact parity and would also put every worker's name,
  Telegram id and sealed browser password on that VM: a decision, never a
  default. A synthetic seeder is the honest fix and does not exist yet.
- **Telegram, Sheets, Gemini, Notion, ARC.** No tokens, and none of those hosts
  is on the allowlist. The scheduled jobs still fire and log their failures
  there; expected, not a regression.
- **Production itself.** The proxy allows `git.safiabakery.uz` and nothing else,
  so — until `production.safiacorporate.uz` is added to the environment's
  Allowed domains for the report door — it answers **403 CONNECT tunnel failed** from a
  cloud session: no `/api/version`, no `/build.json`, no watching a deploy land.
  `git ls-remote gitea main` is the whole of what can be confirmed — that the
  push arrived. Never report a deploy as verified from here.

### When a cloud session needs an answer only production has (standing rule)

The operator's directive, 2026-10-26, and it holds for **every future change**:
**if you cannot reach production from here but you need its data, send a REPORT
— and ask, each time, which of the two people it goes to.**

**From v4.334.0 the report is, first, a question through the REPORT DOOR**
(`scripts/ask-prod.py`, see «The report door» below): one SELECT or one GET,
allowed by that person's tap, answered in under a minute with no deploy. The
one-shot module below is for what the door cannot carry — a workbook or a
file, an answer past its bounds (20 s, 5,000 rows, 2 MB), or a door that is
closed. The ask-who rule, the one-question rule and the honesty rules apply to
both.

- **Never guess from a laptop copy, a dry run or a screenshot, and never ship a
  fix on the strength of one.** The DB here is empty and the laptop's holds May
  data; a cloud session has no third option. A report is the only honest way to
  learn what production actually holds.
- **Put everything you need in ONE report.** Each one is a boot job, a flag, a
  deploy and a person's attention, so a second round for a column you forgot is
  the expensive mistake. Write down the question first, then the rows that
  answer it: the figures, the raw rows BEHIND them, and the panel / scope /
  window each figure was judged against — so the reader can check the
  arithmetic by eye instead of taking it on trust (the «Kun to'liq» sheet of
  `pin_mismatch_report` is the shape).
- **Every report is TEMPORARY, READ-ONLY and flag-guarded**, the convention
  already written down here: `services/<name>_report.py` with a
  `send(db, chat_id, date_from, date_to) -> int`, `startup._report_pending(FLAG)`
  → `schedule_at(...)` → `_send_report_once(FLAG, label, module.send, <chat>)`,
  armed from BOTH entrypoints, deleted with its startup pair and both calls once
  it has landed. **Changing what one reports needs a NEW flag key** — an
  "already ran" mark makes the new version a no-op on every box that has booted.
- **ASK THE ONE QUESTION, every time, before it ships**: Burkhon
  (`startup.REPORT_CHAT_BURKHON`, 6302307151) or Abbos
  (`startup.REPORT_CHAT_ABBOS`, 811884943)? Pass the named constant, never the
  number. **One recipient, never both** — a report in two chats is two people
  each assuming the other dealt with it. `UNPRICED_DM_CHAT` is the historical
  alias for Burkhon's and is what 40 existing call sites mean; a NEW report
  names a person.
- **Say what the report cannot tell you.** It is a snapshot taken at one
  instant, so it can be stale about a row written after it ran — never wrong
  about the moment it was taken. And a report that compares two numbers must
  not derive both from one of the two sides: v1 of `pin_mismatch_report` took
  `page_n` and `load_n` off one folded map and answered «no mismatch» about the
  very unit-day it was written for.
