# Zagruzka KPI Dashboard

Production floor analytics dashboard for brigadir workload management.

## Stack

- **Backend**: FastAPI + SQLAlchemy + PostgreSQL
- **Frontend**: React + TailwindCSS + ApexCharts
- **Data**: PostgreSQL (attendance) + Google Sheets (plan, headcount, downtime)

---

## Setup

### 1. Database

Create a PostgreSQL database:
```bash
createdb zagruzka_db
```

### 2. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Copy and edit env
cp .env.example .env
# Edit DATABASE_URL, ADMIN_USERNAME, ADMIN_PASSWORD, SECRET_KEY

# Start server
uvicorn app.main:app --reload --port 8000
```

### 3. Seed database (run once)

```bash
cd backend
source venv/bin/activate
python seed_managers.py
```

### 4. Import attendance data

Go to `/admin/upload`, log in, and upload verifix `.xlsx` files. This is the only way to add attendance data.

### 5. Frontend

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

---

## Pages

| Route | Description |
|---|---|
| `/` | Overview — KPI cards + brigadir table + ranking |
| `/zagruzka` | Heatmap + top/worst performers + funnel |
| `/brigadir/:id` | Individual brigadir profile |
| `/workers` | Odam Soni — headcount & role analysis |
| `/plan` | Plan fulfillment |
| `/downtime` | Equipment downtime by category |
| `/admin` | Admin login |
| `/admin/upload` | Upload verifix files + manage sheet IDs |

---

## Universal Filters

All pages share: **Period** · **Shift** · **Min/Hrs toggle**

---

## Environment Variables (backend/.env)

```
DATABASE_URL=postgresql://user:password@localhost:5432/zagruzka_db
GOOGLE_CREDENTIALS_FILE=../safia-project-bea00b0b2514.json
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme
SECRET_KEY=your-secret-key-here
```
