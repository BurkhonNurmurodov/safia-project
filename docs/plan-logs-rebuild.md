# Plan — the action register («Jurnal», `/panel/logs`) rebuilt

**Status (2026-11-03): BUILT as v4.398.0.** The live rules are in CLAUDE.md
«The action register» → «Reading it». This file keeps the audit that led
there, so the next person knows what was wrong and why the page is shaped as
it is. The full write-up with a rendered mock-up and a prototype on mock data
sits outside the repo (a private claude.ai artifact of the same day).

## What was wrong (measured on a 1850 × 1030 screenshot of v4.390.2)

| | before | after |
|---|---|---|
| Navigation columns before content | 3 (app sidebar · admin panel sidebar · category rail) | 1 (the app sidebar; the admin app of 2026-11-03 removed the second, this rebuild the third) |
| Log rows visible in a 1030px window | 8 | about 17 |
| Places to set a filter | 4 (date, search, «Filtrlar», the rail) | 1 bar |
| Times «5 626» was printed | 4 (rail, tile, card header, footer) | 1 (the stat line; the pager keeps its own «x–y of N») |
| Truncated or clipped labels on screen | 18 | 0 at 1280px and up |

Critical: the Target column was cut off at the viewport edge on every row,
and «what changed» — the page's promise — was reachable only by expanding
each row. Four KPI tiles repeated the row count and took the height the rows
needed. The rail's zero-count categories took five rows. The name and the
role stacked, so a row was 52px. The sticky header let a row show through.

## What changed

- **One filter bar**: `DateRangePicker` · `SearchInput` (`/` focuses it) ·
  `FilterPanel` with «Bo'lim» and «Natija» PINNED as their own named
  triggers and source / person / unit / action / detail folded. The
  category became a MULTI-SELECT; the API's `category` reads CSV
  (`routers/logs.py`), a single value exactly as before.
- **One stat line** in place of the four tiles: events · people · refused
  (a chip that applies `outcome=refused,denied,error`) · «live · last event».
- **The table takes the column.** Generic columns: time · who · role ·
  action · target · category · outcome (source moved into the panel; it
  stays in the sessions view and the export). One line per row. `done` is a
  quiet check; refused / denied / error keep their chips.
- **The side panel** (`components/admin/actionlog/LogPanel.jsx`): a row
  opens its event on the right edge (a bottom sheet below 768px); ↑ ↓ walk
  the rows, Esc closes, focus returns to the row. The body is the former
  in-place expansion, now `LogDetail.jsx`, undo bar included.
- Deleted: `CategoryRail.jsx`.

## What deliberately stayed

The category's counts without the category filter; columns that follow a
single selected category; «N new» behind a button; colour = status only;
the undo bar on every event in one of three states; the server-side page,
counts, facets and export; the four-language dictionary (`logs.*`).

## The questions the audit raised, answered by the code

1. «Action history» vs «Logs»: `ActionHistory.jsx` is the register of
   actions performed THROUGH A GRANTED CAPABILITY (`/admin/capability-uses`),
   the one behind the grant-use warning DMs; «Jurnal» is every change. Both
   stay; the names were left alone.
2. The «~» prefix on targets in the audited screenshot was a cell code
   rendered by its kind (`targetText`); the panel names the kind beside it.
3. The default period stays «today» — the picker's quick list has the wider
   ranges one press away.
4. The outer «Admin» sidebar of the screenshot was the old admin panel's own
   navigation, retired the same morning by «The admin app».
