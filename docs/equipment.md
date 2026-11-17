# «Uskunalar» — the equipment register (2026-11-17)

`/equipment`, a page of the «Avtomatizatsiya» app (`navLinks.js`: `adminOnly`,
`app: "automation"`, no page key — admins only, not grantable; `RequireAdmin` on
the route, `verify_admin` on every `/api/admin/equipment` route).

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
