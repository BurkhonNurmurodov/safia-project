# «Uskunalar» — the equipment register (2026-11-17)

`/equipment`, a page of the «Avtomatizatsiya» app (`navLinks.js`: `page: "equipment"`,
`app: "automation"`). **Grantable since 2026-11-17** (the operator wanted to give
one person the page): page key `equipment`, no role holds it by default, so
admins plus whoever is granted it on the Access tab; `RequirePage` on the route,
`require_page("equipment")` on every `/api/admin/equipment` route.

- **What it is**: the operator's workbook «Uskunalar ro'yxati SAFIA.xlsx» as a
  table the admin keeps by hand — add, edit, delete (`models.Equipment`,
  `routers/equipment.py`, `pages/Equipment.jsx`). Every write goes to the action
  register (`equipment.created / updated / deleted`).
- **Seeded once** from `backend/app/data/equipment_seed.json` (319 rows) by
  `startup.seed_equipment`, flag `equipment_seeded` — after that the page owns
  the data and a restart never overwrites it. Cells are plain text as the sheet
  had them (a serial may be «2025/05»; «Mas'ul yacheyka» is the Verifix code).
- **«Holati» is the sheet's grade letter a · b · c.** Its meaning was not
  stated, so it is shown neutral (never a traffic light) and the form offers
  those three; widen `STATUSES` in the router and `GRADES` on the page together.
- **«№» and «Mas'ul shaxs» (2026-11-19)**: «№» opens the table — the row's
  place in the list as it is sorted and filtered now (1…N, running on across
  pages), not stored and not sortable. «Mas'ul shaxs» («Responsible person»)
  is a NEW stored free-text column (`equipment.responsible`, added by
  `startup.add_equipment_responsible_column`), blank on the 319 seeded rows,
  beside the three «Mas'ul …» columns; it is searched, sorted and edited like
  them.

## Columns and «Mas'ul shaxs» from Verifix (2026-11-20)

- **The table's columns are the reader's own**: `ColumnsPicker` on the toolbar's
  right edge, after «Uskuna qo'shish» — show / hide / drag to reorder, saved per
  profile at `/api/ui-prefs/equipment_cols` (reconciled against `COL_KEYS` in
  `pages/Equipment.jsx`, so a new column simply appears at the end). «Uskuna
  nomi (Doc)» is the LOCKED identity column — 4 of the 319 seeded rows lack it
  against 103 without the Real name. The ⋮ is always last and not in the
  picker; a sort on a column just hidden falls back to the list's own order.
  A new column needs a key in `COL_KEYS` / `COL_LABEL` and a case in `cell`.
- **«Mas'ul shaxs» is PICKED, never typed**: a server-side-search
  `StyledSelect` over the plant's CURRENT workers (Verifix directory, status W
  — the /assessment candidate picker's pattern), `GET /api/admin/equipment/people?q=`
  (≥ 2 letters, Latin or Cyrillic, `people.search_current`; it answers name,
  job and place only). The row stores `equipment.responsible_id` (the Verifix
  employee_id, added by `startup.add_equipment_responsible_column`) beside
  `responsible`, and **the name is the directory's, copied by the server** —
  whatever name the client sends with an id is ignored; an unknown id is a 422.
  The table prints the name as a `PersonLink` to the person's «Xodim kartasi».
- **A name typed by hand before the picker keeps its text with no id**: the form
  shows it as «Qo'lda yozilgan» until somebody is picked over it; «—» clears
  the field. A tab from before the picker (no `responsible_id` in its body)
  keeps the stored person while its text is unchanged.
- **Reach**: the search lists current workers plant-wide to anyone holding the
  page (admins + personal grants) — the operator asked for the Verifix picker
  here; it shows no more than the dropdown prints, and the card a name opens
  still applies its own reach (`docs/laboratory.md`).
