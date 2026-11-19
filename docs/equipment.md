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
