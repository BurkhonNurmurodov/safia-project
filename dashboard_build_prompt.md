# Zagruzka KPI Dashboard — Full Build Prompt

## Project Overview

Build a production floor analytics web application called **Brigadir Workload Dashboard** for a bakery operation. The dashboard visualizes the **Zagruzka KPI** — a holistic workload utilization metric for production supervisors (brigadirs). It measures how effectively each brigadir managed their team's capacity under real operational conditions.

The Zagruzka KPI is not just speed — it accounts for workforce capacity loss, idle time, equipment downtime, early arrival, and kaizen buffers, arriving at a **Final Net Utilization %** that is a fair reflection of actual performance.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python FastAPI |
| ORM | SQLAlchemy |
| Database | PostgreSQL |
| Frontend | React + TailwindCSS (dark theme) |
| Charts | ApexCharts (react-apexcharts) |
| Google Sheets | google-auth + gspread (service account) |
| Admin Auth | FastAPI session-based or JWT (simple) |

---

## Data Sources

### 1. PostgreSQL (primary store)

**`managers`**
```
id          INTEGER PRIMARY KEY
name        TEXT NOT NULL
shift       INTEGER  -- 1 or 2
```

**`attendance`**
```
id               SERIAL PRIMARY KEY
manager_id       INTEGER REFERENCES managers(id)
date             DATE
worker_name      TEXT
job_title        TEXT
schedule         TEXT
clock_in_out     TEXT
hours_worked     NUMERIC
early_arrival_min NUMERIC
effective_hours  NUMERIC
```

**`sheet_sources`**
```
id        SERIAL PRIMARY KEY
name      TEXT UNIQUE   -- e.g. 'source', 'shift_report'
sheet_id  TEXT NOT NULL
```

**`comments`** *(schema only, dummy — not wired to UI yet)*
```
id          SERIAL PRIMARY KEY
manager_id  INTEGER REFERENCES managers(id)
date        DATE
text        TEXT
created_at  TIMESTAMPTZ DEFAULT now()
```

### 2. Google Sheets (read-only via service account)

Sheet IDs are stored in the `sheet_sources` table. Two source sheets:

**Source Sheet** (`name = 'source'`) — tabs:
- `Минут` (row 52 = dates as serial numbers, row 54+ = manager rows, alternating plan/actual columns)
- `Одам сони` (row 52 = dates, row 53+ = manager rows, headcount per date)

**Shift Report Sheet** (`name = 'shift_report'`) — tab `Sheet1`:
- Column 3 = date (YYYY-MM-DD), Column 4 = manager name
- Equipment downtime columns (0-indexed): Cat A=424, Cat B=426, Cat C=428, Cat D=430, Cat D2=432, Cat D3=434, Cat E=436, Cat F=438, Cat G=440

---

## KPI Formulas

All time values in **minutes** unless the user switches to hours via the global unit toggle.

```
Verifix Labor (min)       = SUM(hours_worked) × 60 × 0.85         [per manager per date]
Labor Surplus (persons)   = (Verifix Labor − Prod Actual) / 60 / (8 × Prod Actual / Prod Plan)
Effective Headcount       = Official Headcount + Labor Surplus
Avg Early Arrival         = SUM(early_arrival_min) / Official Headcount

Baseline Utilization %    = Prod Actual / (480 × Official HC × (Prod Actual / Prod Plan))
Adjusted Utilization %    = Prod Actual / (480 × Eff HC × (Prod Actual / Prod Plan))
After Idle Time %         = Prod Actual / (Eff HC × (480 × (Prod Actual / Prod Plan) − Equip Downtime))
After Early Arrival %     = Prod Actual / (Eff HC × (480 × (Prod Actual / Prod Plan) − Equip Downtime − Avg Early))
Final Net Utilization %   = Prod Actual / (Eff HC × (480 × (Prod Actual / Prod Plan) − Equip Downtime − Avg Early − 10))
                            [10 = Kaizen buffer in minutes]
Difference (hrs)          = (Verifix Labor − Prod Actual) / 60
Plan Fulfillment %        = Prod Actual / Prod Plan
```

**Status thresholds** (based on Final Net Utilization %):
- `≥ 105%` → Over Capacity (green)
- `95–105%` → On Track (yellow-green)
- `90–95%` → Monitor (yellow/orange)
- `< 90%` → Needs Attention (red)

**Deviation / gauge color zones:**
- `< 85%` → red
- `85–90%` → orange
- `90–95%` → yellow
- `95–105%` → green
- `> 105%` → yellow/orange (over capacity warning)

**Worker roles included** (direct production only):
- Кондитер / Konditer (Confectioner) — includes all variants starting with "Кондитер"
- Фасовщик / Fasovshik (Packager)
- Заготовитель / Zagatovitel (Preparer)

---

## Universal Filters

Persisted in URL query params. Applied globally across all pages unless noted otherwise.

| Filter | Options |
|---|---|
| Shift | All / Shift 1 / Shift 2 |
| Period | Date range picker (FROM → TO), default: last 14 days |
| Brigadir | Multi-select dropdown (optional, shown where contextually logical) |
| Unit | Minutes / Hours toggle (switches all time-based numeric values) |

---

## Application Structure

```
/                    → Overview page
/zagruzka            → Workload % / Zagruzka page
/workers             → Odam Soni / Workers analysis
/plan                → Plan Fulfillment page
/downtime            → Idle Time / Downtime page
/brigadir/:id        → Brigadir Profile page
/admin               → Admin dashboard (login required)
/admin/upload        → File upload page
```

Sidebar navigation links to all main sections. Active link highlighted. Brigadir filter removed from sidebar pages where it doesn't apply (e.g. brigadir profile page already scoped).

---

## Pages

---

### 1. Overview (`/`)

**Header KPI cards (4):**
- Total Brigadirs
- Avg Final Net Utilization % (across selected period/shift)
- Brigadirs ≥ 100%
- Brigadirs < 90%

**Brigadir table:**
Columns: `#` | `Brigadir` | `Shift` | `Final Workload %` | `Planned %` | `Diff (hrs or min)` | `Headcount` | `Status`

- Color-coded Final Workload % and Diff by thresholds above
- Headcount cell shows warning icon (⚠) if |Official HC − Verifix HC| > 2
- Status badge: Over Capacity / On Track / Monitor / Needs Attention
- Search box to filter by brigadir name
- Shift toggle: All / Shift 1 / Shift 2
- Sort by any column (default: Final Workload % descending)
- **Drill-down**: clicking any row opens a modal/slide-out panel showing individual worker attendance for that brigadir on the most recently selected date. Columns: Worker Name, Job Title, Schedule, Clock In/Out, Hours Worked, Early Arrival (min), Effective Hours. Data from `attendance` table.

**Ranking bar chart:**
- Horizontal bar chart, one bar per brigadir
- Bars colored by status threshold
- Sorted by Final Net Utilization % descending
- Tooltip shows exact value on hover

---

### 2. Workload % / Zagruzka (`/zagruzka`)

**Fleet Heatmap:**
- Rows = brigadirs, Columns = dates in selected period
- View toggle (3 modes):
  - **Planned only** — shows Baseline Utilization % per cell
  - **Actual only** — shows Final Net Utilization % per cell
  - **Side by side** — each date has 2 sub-columns (Planned | Actual)
- Cell color zones: <90% red, 90–95% orange, 95–105% yellow-green, ≥105% green
- Legend shown top-right
- Each cell is **commentable** (UI placeholder — comment icon appears on hover, opens a modal with a text area, saves to `comments` table; display only for now, not required to be functional in first version)

**Top & Worst Performers ranking cards:**
- Configurable period filter (uses universal period filter or per-section period toggle showing e.g. "Last 7 days / Last 14 days / Last 30 days")
- Two lists: Top 5 performers + Bottom 5 performers
- Each card shows:
  - Avatar/initials circle
  - Brigadir name
  - `Planned Workload Done` (Prod Actual value, in min or hrs per unit toggle)
  - `Actual %` (Final Net Utilization %)
  - **Semicircular gauge** showing Difference % (Verifix Labor vs Prod Actual ratio)
  - **Quick checklist** (4 items, ✓ green / ✗ red):
    1. Headcount match: |Official HC − Verifix HC| ≤ 2
    2. Difference in normal range: |Difference| within 0–5% of Prod Plan
    3. Early arrival normal: total early_arrival_min per brigadir ≤ 110 min
    4. Idle time normal: total equipment downtime ≤ 50 min

**Workload Funnel:**
- Funnel/waterfall chart (ApexCharts funnel) showing each adjustment stage for the selected brigadir + date:
  1. Actual Workload % (Baseline Utilization)
  2. After Idle Time %
  3. After Early Arrival %
  4. After Kaizen (10 min) → Final Net Utilization %
- Each stage labeled with its % value
- Color transitions from warm to green as adjustments are applied
- Shown either fleet-wide (avg) or per-brigadir when one is selected

---

### 3. Brigadir Profile (`/brigadir/:id`)

Accessed by clicking any brigadir name anywhere in the app (table row, ranking card, heatmap row label).

**Top section:**
- Name (large), Shift badge (S1/S2), Status badge (color-coded)
- 6 KPI stat cards:
  - Production Plan (min/hrs)
  - Trudoyomkost / Prod Actual (min/hrs)
  - Verifix Time (min/hrs)
  - Difference (+/− hrs or min, with direction label "Verifix > Trudoyomkost" or opposite)
  - Reported People (Official Headcount)
  - Verifix People (Verifix Headcount, with Δ vs Official and warning if diff > 2)

**Workload Breakdown section:**
- Horizontal progress bars (like the existing dashboard):
  - Planned Workload %
  - Actual Workload %
  - After Idle Time %
  - After Early Arrival %
  - **Final Workload %** (highlighted in gold/accent color)
- "Show Adjustments" expandable section: shows raw values for each deduction

**Difference gauge:**
- Semicircular ApexCharts radial gauge
- Needle points to current Difference value
- Color zones: <85% red, 85–90% orange, 90–95% yellow, 95–105% green, >105% orange
- Label shows exact % below needle

**Diagnostic Summary box:**
- Auto-generated text based on Final Workload %:
  - ≥ 105%: "Team exceeded capacity. Review for over-reporting or production line efficiency gains."
  - 95–105%: "Team performing within normal operational range."
  - 90–95%: "Team slightly underperforming. Monitor for recurring patterns."
  - < 90%: "Team underperformed relative to plan — investigate root cause."

**Historical Trend chart (last 8 days):**
- Line chart with 3 tab views: Workload Minutes | Headcount | Idle (Ojidaniya)
- X-axis: dates, Y-axis: value, today highlighted
- Two lines on Workload tab: Trudoyomkost (planned) + Verifix Time (actual), dashed vs solid

**Worker Attendance drill-down:**
- Date selector (defaults to latest date)
- Table: Worker Name, Job Title, Schedule, Clock In/Out, Hours Worked, Early Arrival (min), Effective Hours
- Source: `attendance` table filtered by manager_id + date

---

### 4. Odam Soni / Workers (`/workers`)

**Total headcount per brigadir:**
- Bar chart: Official Headcount vs Verifix Headcount side-by-side per brigadir
- Mismatch highlighted (>2 diff = orange bar segment or icon)

**Role breakdown:**
- Stacked bar or grouped bar per brigadir showing:
  - Konditer count
  - Fasovshik count
  - Zagatovitel count
- Data from `attendance` table (count distinct worker_name grouped by job_title)

**Attendance trend per role:**
- Line chart over selected period
- One line per role (Konditer / Fasovshik / Zagatovitel)
- Fleet-wide or per-brigadir depending on Brigadir filter

**Summary cards:**
- Total unique workers in the period
- Most common role fleet-wide
- Brigadir with highest workforce (by Verifix HC)
- Brigadir with largest HC mismatch

---

### 5. Plan Fulfillment (`/plan`)

**KPI cards:**
- Fleet avg Plan Fulfillment % for selected period
- Count of brigadirs above 100% plan
- Count of brigadirs below 85% plan

**Per-brigadir plan fulfillment table:**
- Columns: Brigadir | Shift | Prod Plan (min/hrs) | Prod Actual (min/hrs) | Fulfillment % | Status
- Color-coded Fulfillment % by same thresholds

**Trend line chart:**
- Plan Fulfillment % over time per brigadir (multi-line or single-line with brigadir selector)

**Plan vs Actual bar chart:**
- Grouped bars: Prod Plan vs Prod Actual per brigadir for selected period (summed)

---

### 6. Idle Time / Downtime (`/downtime`)

**KPI cards:**
- Total downtime fleet-wide (selected period)
- Brigadirs with downtime > 50 min flagged (count)
- Most affected category fleet-wide

**Total downtime per brigadir:**
- Horizontal bar chart sorted descending
- Bars > 50 min colored red (flagged threshold)

**Category breakdown:**
- Stacked bar chart per brigadir: Cat A / Cat B / Cat C / Cat D / Cat D2 / Cat D3 / Cat E / Cat F / Cat G
- Legend for all categories

**Downtime trend over time:**
- Line chart showing total downtime per day (fleet avg or per-brigadir with selector)

**Downtime detail table:**
- Date | Brigadir | Category | Downtime (min or hrs)
- Sortable, filterable by category
- Flagged rows (>50 min total) highlighted

---

### 7. Admin Dashboard (`/admin`)

**Authentication:**
- Simple login form (username + password)
- JWT or session-based, single admin account via env var credentials
- Protects all `/admin/*` routes

**File Upload (`/admin/upload`):**
- Drag-and-drop or file picker accepting multiple `.xlsx` files
- Expected filename format: `{manager_id}_{DD.MM.YYYY}.xlsx`
- On upload:
  1. Parse files (pandas + calamine engine)
  2. Filter to allowed roles only
  3. Compute early_arrival_min and effective_hours
  4. Upsert into `attendance` table (skip duplicates by manager_id + date + worker_name)
- Upload result summary: files processed, rows inserted, rows skipped, errors

**Sheet Sources management:**
- Simple form to view/update the 2 Google Sheets IDs stored in `sheet_sources` table
- Test connection button (attempts to open sheet and returns tab names)

---

## Component Library Notes

- All charts via **react-apexcharts**
- **Gauge chart**: ApexCharts `radialBar` type with custom angle range (−135° to +135° semicircle), color stops matching playbook zones
- **Heatmap**: ApexCharts `heatmap` type, custom color ranges matching threshold zones
- **Funnel**: ApexCharts `bar` type with funnel shape enabled, or custom CSS funnel if ApexCharts funnel is insufficient
- **Trend lines**: ApexCharts `line` or `area` type
- **Ranking bars**: ApexCharts `bar` horizontal
- All charts respect the global **Minutes/Hours unit toggle** for Y-axis labels and tooltips

---

## API Endpoints (FastAPI)

```
GET  /api/summary                     → header KPI cards (fleet level)
GET  /api/brigadirs                   → list of all brigadirs with latest metrics
GET  /api/brigadir/{id}               → single brigadir full profile data
GET  /api/load-analysis               → computed metrics for all managers × dates
GET  /api/attendance                  → attendance records (filterable by manager_id, date)
GET  /api/workers/headcount           → headcount breakdown by brigadir + role
GET  /api/plan-fulfillment            → plan vs actual per manager per date
GET  /api/downtime                    → downtime data per manager per date + by category
GET  /api/heatmap                     → heatmap data: manager × date → planned %, actual %
POST /api/comments                    → save comment (dummy, schema only)
GET  /api/comments                    → get comments (dummy)

POST /admin/api/upload                → upload verifix xlsx files
GET  /admin/api/sheet-sources         → get stored sheet IDs
PUT  /admin/api/sheet-sources/{name}  → update sheet ID
POST /admin/api/login                 → authenticate admin
```

All endpoints accept query params: `shift`, `date_from`, `date_to`, `manager_id` (array) where applicable.

---

## Design Spec

- **Theme**: Dark background (`#0f1117` or similar), card backgrounds `#1a1d27`, accent color gold/amber (`#f59e0b`) for Final Workload highlight
- **Status colors**: green `#22c55e`, yellow `#eab308`, orange `#f97316`, red `#ef4444`
- **Typography**: Clean sans-serif (Inter or system-ui), numbers in monospace for alignment
- **Sidebar**: Fixed left sidebar with icons + labels, active page highlighted, collapses to icons only on narrow screens
- **Responsive**: Desktop-first but functional on tablet
- **Loading states**: Skeleton loaders on all data-driven components
- **Empty states**: Meaningful empty state messages when no data matches filters

---

## Key Business Rules

1. Only **direct production roles** count toward capacity: Konditer (all variants), Fasovshik, Zagatovitel. All other roles (Brigadir, Lider, Nachalnik Smeni, Transport, Support) are excluded from workforce calculations.
2. **Kaizen buffer** is fixed at 10 min/person — always deducted in Final Net Utilization.
3. **Verifix efficiency coefficient** is 0.85 — Verifix Labor = hours_worked × 60 × 0.85.
4. Dates are sourced from verifix filenames (`DD.MM.YYYY`); only dates on or after the earliest verifix file date are shown for production plan/headcount data.
5. Manager name lookup is via the `managers` table (id ↔ name mapping).
6. **Flagging thresholds** for the quick checklist:
   - Headcount mismatch: |Official − Verifix| > 2
   - Early arrival: total early_arrival_min for brigadir on date > 110 min
   - Idle/downtime: total equipment downtime for brigadir on date > 50 min
   - Difference: outside 0–5% of plan considered noteworthy
