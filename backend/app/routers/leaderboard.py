from datetime import date, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.permissions import require_page

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])

CATS = [
    {"key": "zag", "weight": 0.30},
    {"key": "naz", "weight": 0.15},
    {"key": "kai", "weight": 0.15},
    {"key": "xav", "weight": 0.15},
    {"key": "kir", "weight": 0.25},
]

SUP_COLORS = [
    "#2563eb", "#22c55e", "#f97316", "#8b5cf6", "#eab308", "#ec4899",
    "#0d9488", "#ef4444", "#0ea5e9", "#65a30d", "#d946ef", "#C8973F",
]

RAW = [
    {"name": "Malika Qodirova",   "unit": "2-uchastka",  "image": "/images/supervisors/female_template.jpg", "s": {"zag": 92, "naz": 88, "kai": 90, "xav": 84, "kir": 96}},
    {"name": "Dilshod Karimov",   "unit": "5-uchastka",  "image": "/images/supervisors/male_template.jpg", "s": {"zag": 90, "naz": 92, "kai": 78, "xav": 88, "kir": 91}},
    {"name": "Aziza Tosheva",     "unit": "1-uchastka",  "image": "/images/supervisors/female_template.jpg", "s": {"zag": 87, "naz": 74, "kai": 92, "xav": 90, "kir": 88}},
    {"name": "Murodali Ochilov",  "unit": "7-uchastka",  "image": "/images/supervisors/male_template.jpg", "s": {"zag": 84, "naz": 81, "kai": 70, "xav": 76, "kir": 90}},
    {"name": "Sherzod Aliyev",    "unit": "3-uchastka",  "image": "/images/supervisors/male_template.jpg", "s": {"zag": 86, "naz": 70, "kai": 75, "xav": 72, "kir": 84}},
    {"name": "Nodira Yusupova",   "unit": "4-uchastka",  "image": "/images/supervisors/female_template.jpg", "s": {"zag": 78, "naz": 85, "kai": 80, "xav": 74, "kir": 81}},
    {"name": "Jasur Rahimov",     "unit": "9-uchastka",  "image": "/images/supervisors/male_template.jpg", "s": {"zag": 83, "naz": 62, "kai": 68, "xav": 80, "kir": 77}},
    {"name": "Gulnora Ismoilova", "unit": "8-uchastka",  "image": "/images/supervisors/female_template.jpg", "s": {"zag": 71, "naz": 78, "kai": 74, "xav": 70, "kir": 79}},
    {"name": "Bekzod Tursunov",   "unit": "6-uchastka",  "image": "/images/supervisors/male_template.jpg", "s": {"zag": 74, "naz": 66, "kai": None, "xav": 72, "kir": 76}},
    {"name": "Kamola Ergasheva",  "unit": "11-uchastka", "image": "/images/supervisors/female_template.jpg", "s": {"zag": 69, "naz": 72, "kai": 60, "xav": 66, "kir": 74}},
    {"name": "Rustam Nazarov",    "unit": "10-uchastka", "image": "/images/supervisors/male_template.jpg", "s": {"zag": 66, "naz": 58, "kai": 55, "xav": 62, "kir": 70}},
    {"name": "Sardor Xolmatov",   "unit": "12-uchastka", "image": "/images/supervisors/male_template.jpg", "s": {"zag": 58, "naz": 52, "kai": 48, "xav": 60, "kir": 63}},
]

def clamp(v, lo, hi):
    return max(lo, min(hi, v))

def composite(s):
    num = 0
    den = 0
    for c in CATS:
        val = s.get(c["key"])
        if val is not None:
            num += val * c["weight"]
            den += c["weight"]
    return num / den if den else 0

def mulberry32(a):
    a = int(a)
    def rand():
        nonlocal a
        a = (a + 0x6d2b79f5) & 0xFFFFFFFF
        t = (a ^ (a >> 15)) * (1 | a) & 0xFFFFFFFF
        t = (t + ((t ^ (t >> 7)) * (61 | t))) ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0
    return rand

@router.get("")
def get_leaderboard(
    period: str = Query(default="month"),
    db: Session = Depends(get_db),
    _: dict = Depends(require_page("leaderboard")),
):
    # This currently implements the placeholder logic from the frontend
    # TODO: Replace with real database aggregation when formulas are finalized.
    seed = 7 if period == "week" else 91 if period == "quarter" else 30
    
    sups = []
    for i, r in enumerate(RAW):
        rnd = mulberry32(seed * 1000 + i * 77)
        s = {}
        for c in CATS:
            base = r["s"].get(c["key"])
            if base is None:
                s[c["key"]] = None
            else:
                s[c["key"]] = clamp(round(base + (rnd() - 0.5) * 8), 20, 99)
                
        comp = composite(s)
        trend = (rnd() - 0.45) * 2.2
        hist = []
        for w in range(8):
            if w == 7:
                hist.append(comp)
            else:
                hist.append(comp - trend * (7 - w) + (rnd() - 0.5) * 6)
                
        sparks = {}
        for c in CATS:
            v = s.get(c["key"])
            if v is None:
                sparks[c["key"]] = None
                continue
            arr = []
            for w in range(8):
                if w == 7:
                    arr.append(v)
                else:
                    arr.append(clamp(round(v - trend * (7 - w) * 0.8 + (rnd() - 0.5) * 9), 8, 99))
            sparks[c["key"]] = arr
            
        sups.append({
            "id": i,
            "name": r["name"],
            "unit": r["unit"],
            "image": r.get("image"),
            "color": SUP_COLORS[i % len(SUP_COLORS)],
            "s": s,
            "comp": comp,
            "hist": hist,
            "sparks": sparks,
            "scoreDelta": round(trend * 1.6 + (rnd() - 0.5), 1)
        })

    rankHist = [[] for _ in range(len(sups))]
    for w in range(8):
        ordered = sorted([{"id": s["id"], "v": s["hist"][w]} for s in sups], key=lambda x: x["v"], reverse=True)
        for pos, o in enumerate(ordered):
            rankHist[o["id"]].append(pos + 1)
            
    for s in sups:
        s["rankHist"] = rankHist[s["id"]]
        s["rank"] = rankHist[s["id"]][7]
        s["prevRank"] = rankHist[s["id"]][6]
        
    byRank = sorted(sups, key=lambda x: x["rank"])
    
    return {"sups": sups, "byRank": byRank}
