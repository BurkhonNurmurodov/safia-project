import { useNavigate } from "react-router-dom";
import GaugeChart from "../charts/GaugeChart";
import Checklist from "./Checklist";
import { fmtPct } from "../../utils/formatters";
import { useFilters } from "../../context/FilterContext";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";

function Initials({ name }) {
  const parts = name?.trim().split(" ") || [];
  const ini = parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return (
    <div className="w-10 h-10 rounded-full font-bold text-sm flex items-center justify-center flex-shrink-0" style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}>
      {ini}
    </div>
  );
}

export default function BrigadirCard({ brigadir }) {
  const navigate = useNavigate();
  const { unit } = useFilters();
  const { t } = useLang();
  const { tl } = useTranslit();
  const {
    manager_id, name, shift, net_util, baseline_util, diff_hrs,
    hc_mismatch, diff_in_range, early_flagged, idle_flagged,
  } = brigadir;

  const diffVal = diff_hrs !== null && diff_hrs !== undefined
    ? (unit === "hrs" ? diff_hrs : diff_hrs * 60)
    : null;

  return (
    <div
      onClick={() => navigate(`/brigadir/${manager_id}`)}
      className="rounded-xl p-4 cursor-pointer transition-colors"
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(245,158,11,0.3)"}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}
    >
      <div className="flex items-start gap-3 mb-3">
        <Initials name={name} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate" style={{ color: "var(--text-1)" }}>{tl(name)}</div>
          <div className="text-[11px]" style={{ color: "var(--text-3)" }}>{t("zagruzka.card.shift").replace("{n}", shift)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs" style={{ color: "var(--text-3)" }}>{t("zagruzka.card.final")}</div>
          <div className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>{fmtPct(net_util)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] mb-0.5" style={{ color: "var(--text-3)" }}>{t("zagruzka.card.plannedDone")}</div>
          <div className="text-xs font-mono" style={{ color: "var(--text-2)" }}>{fmtPct(baseline_util)}</div>
        </div>
        <GaugeChart value={net_util} label={t("zagruzka.card.final")} size={110} />
        <div>
          <div className="text-[10px] mb-0.5" style={{ color: "var(--text-3)" }}>{t("zagruzka.card.difference")}</div>
          <div className="text-xs font-mono" style={{ color: "var(--text-2)" }}>
            {diffVal !== null ? `${diffVal > 0 ? "+" : ""}${diffVal.toFixed(1)} ${unit}` : "—"}
          </div>
        </div>
      </div>

      <div className="pt-3" style={{ borderTop: "1px solid var(--border)" }}>
        <Checklist
          hcMismatch={hc_mismatch}
          diffInRange={diff_in_range}
          earlyFlagged={early_flagged}
          idleFlagged={idle_flagged}
        />
      </div>
    </div>
  );
}
