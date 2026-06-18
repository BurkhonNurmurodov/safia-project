#!/usr/bin/env python3
import os
import warnings
import pandas as pd

warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")

VERIFIX_DIR = "verifix"

for filename in sorted(f for f in os.listdir(VERIFIX_DIR) if f.endswith(".xlsx")):
    try:
        df = pd.read_excel(os.path.join(VERIFIX_DIR, filename), header=None, skiprows=6,
                           usecols=[1, 2, 3, 4, 6],
                           names=["fio", "dolzhnost", "grafik_raboty", "ish_vaqti", "otrabotano"],
                           engine="calamine")
    except Exception:
        df = pd.read_excel(os.path.join(VERIFIX_DIR, filename), header=None, skiprows=6,
                           usecols=[1, 2, 3, 4, 6],
                           names=["fio", "dolzhnost", "grafik_raboty", "ish_vaqti", "otrabotano"],
                           engine="openpyxl")

    for _, row in df.iterrows():
        d = str(row["dolzhnost"]).strip() if pd.notna(row["dolzhnost"]) else ""
        if d == "":
            fio        = str(row["fio"]).strip()        if pd.notna(row["fio"])        else ""
            ish_vaqti  = str(row["ish_vaqti"]).strip()  if pd.notna(row["ish_vaqti"])  else ""
            otrabotano = str(row["otrabotano"]).strip() if pd.notna(row["otrabotano"]) else ""
            print(f"{filename}  |  fio={repr(fio)}  |  ish_vaqti={repr(ish_vaqti)}  |  otrabotano={repr(otrabotano)}")
