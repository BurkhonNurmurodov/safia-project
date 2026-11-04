import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import Tooltip from "../ui/Tooltip";
import { SkeletonBlock, SKELETON_NAME_WIDTHS } from "../ui/Skeleton";
import { ScopeSwitch } from "./WorkersPage";
import { fmtCell } from "../reports/reportsUtil";
import api from "../../utils/api";

// «Verifix — vaqt turlari» on «Odam soni · Davomat» (2026-11-04, moved here
// from «Hisobotlar», which keeps only the two overtime rows). Verifix's own
// MONTHLY sums in hours — Явка, Отсутствие, Свободное время, Отгул, Ранний
// уход, Опоздание — read and stored by `services/verifix_month_kinds.py` and
// served by `GET /api/workers/verifix-kinds`. The page's period picks WHICH
// months (every month it touches, the newest three) and each column is the
// whole month, the running one «so far»; plant / shift / brigadir narrow it
// like everything else here, and the page's «Jami / Zagruzka» switch picks all
// workers or the direct ones. A month no read has landed for is «—», and the
// footer says it is on its way.

const ROWS = ["vkPresence", "vkAbsence", "vkFree", "vkDayOff", "vkEarlyLeave", "vkLate"];
const hours = (min) => (min == null ? null : Math.round(min / 60));

export default function VerifixKindsCard({ fparams, ready, scope, setScope, t, className = "" }) {
  const { data } = useQuery({
    queryKey: ["workers-verifix-kinds", fparams],
    queryFn: () => api.get("/api/workers/verifix-kinds", { params: fparams }).then((r) => r.data),
    enabled: ready,
    // A month asked for for the first time is read in the background (a few
    // minutes); look again until it lands.
    refetchInterval: (q) => (q.state.data?.months?.some((m) => !m.read) ? 30_000 : false),
  });

  const months = data?.months || [];
  const kinds = Object.fromEntries((data?.kinds || []).map((k) => [k.key, k]));
  const half = scope === "zagruzka" ? "direct" : "total";
  const monthName = (ym) => t(`cal.m${Number(ym.slice(5)) - 1}`);
  const last = months.length - 1;
  const lastBg = { background: "color-mix(in srgb, var(--bg-inner) 60%, transparent)" };

  const unread = months.filter((m) => !m.read);
  const readAt = months.filter((m) => m.read_at)
    .map((m) => `${monthName(m.ym)} ${m.read_at}${m.partial ? ` (${t("workers.vk.partial")})` : ""}`);
  const notes = [
    unread.length > 0 && t("workers.vk.notRead").replace("{months}", unread.map((m) => monthName(m.ym)).join(", ")),
    data?.dropped > 0 && t("workers.vk.dropped")
      .replace("{n}", months.length + data.dropped).replace("{k}", months.length),
    readAt.length > 0 && t("workers.vk.readAt").replace("{at}", readAt.join(" · ")),
  ].filter(Boolean);

  const title = (
    <span className="inline-flex items-center gap-1">{t("workers.vk.title")}<Tooltip text={t("workers.vk.info")} /></span>
  );
  const empty = data && (!months.length || !data.units);

  return (
    <TableCard icon={Clock} title={title} className={className}
      right={<ScopeSwitch scope={scope} setScope={setScope} t={t} />}
      footer={notes.length > 0 && !empty ? (
        <div className="flex flex-col gap-0.5 text-[11px]" style={{ color: "var(--text-3)" }}>
          {notes.map((n) => <span key={n}>{n}</span>)}
        </div>
      ) : null}>
      <thead>
        <tr>
          <Th label={`${t("workers.vk.figure")}, ${t("workers.vk.unit")}`} />
          {(data ? months : [{ ym: "" }, { ym: " " }]).map((m, i) => (
            <Th key={m.ym || i} align="right" cls="w-[110px]"
              label={m.ym.trim() ? (
                <span className="inline-flex flex-col items-end leading-tight">
                  <span>{monthName(m.ym)}</span>
                  <span className="font-normal">
                    {m.ym.slice(0, 4)}
                    {m.through ? ` · ${t("workers.vk.through").replace("{d}", m.through)}` : ""}
                  </span>
                </span>
              ) : <SkeletonBlock className="h-4 w-16 ml-auto" />} />
          ))}
        </tr>
      </thead>
      <tbody>
        {!data && ROWS.map((k, i) => (
          <tr key={k}>
            <td className="px-3 py-2"><SkeletonBlock className={`h-3.5 ${SKELETON_NAME_WIDTHS[i % SKELETON_NAME_WIDTHS.length]}`} /></td>
            <td className="px-3 py-2"><SkeletonBlock className="h-3.5 w-12 ml-auto" /></td>
            <td className="px-3 py-2"><SkeletonBlock className="h-3.5 w-12 ml-auto" /></td>
          </tr>
        ))}
        {empty && (
          <tr>
            <td colSpan={1 + Math.max(1, months.length)} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>
              {t("workers.vk.empty")}
            </td>
          </tr>
        )}
        {data && !empty && ROWS.map((k) => (
          <tr key={k}>
            <td className="px-3 py-2" style={{ color: "var(--text-1)" }}>{t(`workers.vk.${k}`)}</td>
            {months.map((m, i) => {
              const v = hours(kinds[k]?.[half]?.[i]);
              return (
                <td key={m.ym} className={`px-3 py-2 text-right tabular-nums ${i === last ? "font-semibold" : ""}`}
                  style={{ color: v == null ? "var(--text-3)" : "var(--text-1)", ...(i === last ? lastBg : null) }}>
                  {fmtCell(v, "int")}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
}
