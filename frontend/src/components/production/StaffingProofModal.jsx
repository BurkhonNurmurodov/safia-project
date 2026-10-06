import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, ChevronRight, ChevronDown, Database } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import GroupBadge from "../ui/GroupBadge";
import { SkeletonBlock } from "../ui/Skeleton";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { ddmm, hhmm } from "./staffingClock";

// The people behind ONE «Bugungi fakt» → ШТАТКА number, read off
// `GET /api/production/staffing-proof`. The counted rows add up to the number
// on the card by construction — the backend filters with the загрузка's own
// rule (`idle_source._counted_hc`) — and each says which read supplied it, so
// «is this really Verifix» is answered row by row rather than asserted.

const fmtNum = (v, d = 2) =>
  v == null || Number.isNaN(v) ? "—" : Number(v).toLocaleString("ru-RU", { maximumFractionDigits: d });

// The read a row came from. Verifix is the brand accent (the answer the page
// claims); anything else is named plainly — never a traffic light, since none
// of these is a fault.
const SRC_STYLE = {
  verifix: { bg: "var(--brand-bg)", fg: "var(--brand-text)", bd: "var(--brand-border)" },
  file: { bg: "var(--bg-inner)", fg: "var(--text-2)", bd: "var(--border-md)" },
  edited: { bg: "var(--bg-inner)", fg: "var(--text-2)", bd: "var(--border-md)" },
  manual: { bg: "var(--bg-inner)", fg: "var(--text-2)", bd: "var(--border-md)" },
  none: { bg: "var(--bg-inner)", fg: "var(--text-3)", bd: "var(--border)" },
};

function SourceChip({ source, readAt }) {
  const { t } = useLang();
  const s = SRC_STYLE[source] || SRC_STYLE.none;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
      title={readAt ? t("production.vfxProof.readAt").replace("{d}", ddmm(readAt)).replace("{t}", hhmm(readAt)) : undefined}
      style={{ background: s.bg, color: s.fg, border: `1px solid ${s.bd}` }}>
      {t(`production.vfxProof.src.${source}`)}
      {readAt && <span className="font-normal tabular-nums">· {hhmm(readAt)}</span>}
    </span>
  );
}

function PeopleTable({ rows, showWhy }) {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  return (
    <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--border)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: "var(--bg-inner)" }}>
            {["worker", "cell", "clock", "hours", showWhy ? "why" : "source"].map((k) => (
              <th key={k} className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap ${k === "hours" ? "text-right" : "text-left"}`}
                style={{ color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>
                {t(`production.vfxProof.col.${k}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.cell}-${r.name}-${i}`} style={{ borderTop: i ? "1px solid var(--border)" : undefined }}>
              <td className="px-3 py-2 align-top">
                <div className="font-medium" style={{ color: "var(--text-1)" }}>{r.name ? tl(r.name) : "—"}</div>
                <div className="text-[11px]" style={{ color: "var(--text-3)" }}>{r.job ? tx(r.job) : t("production.vfxProof.noJob")}</div>
              </td>
              <td className="px-3 py-2 align-top font-mono text-xs" style={{ color: "var(--text-2)" }}>{r.cell || "—"}</td>
              <td className="px-3 py-2 align-top text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{r.clock || "—"}</td>
              <td className="px-3 py-2 align-top text-right tabular-nums" style={{ color: "var(--text-2)" }}>
                {fmtNum(r.hours)}
                {r.counted && r.weight !== 1 && (
                  <div className="text-[11px]" style={{ color: "var(--text-3)" }}
                    title={t("production.vfxProof.splitHint")}>
                    ×{fmtNum(r.weight)}
                  </div>
                )}
              </td>
              <td className="px-3 py-2 align-top">
                {showWhy
                  ? <span className="text-xs" style={{ color: "var(--text-2)" }}>{t(`production.vfxProof.why.${r.why}`)}</span>
                  : <SourceChip source={r.source} readAt={r.read_at} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// `target` = { work_center, group } — the row whose number was pressed.
export default function StaffingProofModal({ target, date, managerParam, onClose }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const [showOut, setShowOut] = useState(false);
  const open = !!target;
  const q = useQuery({
    queryKey: ["production", "staffing-proof", date, managerParam?.manager_id ?? "self", target?.work_center, target?.group ?? ""],
    queryFn: () => api.get("/api/production/staffing-proof", {
      params: { date, work_center: target.work_center, group: target.group || undefined, ...managerParam },
    }).then((r) => r.data),
    enabled: open,
  });
  const d = q.data;
  const rows = d?.rows || [];
  const inRows = rows.filter((r) => r.counted);
  const outRows = rows.filter((r) => !r.counted);
  const fromVerifix = inRows.filter((r) => r.source === "verifix").length;
  const vfxReads = (d?.reads || []).filter((r) => r.kind === "verifix" || r.kind === "live");

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Users size={16} />}
      maxWidth="max-w-2xl"
      title={
        <span className="inline-flex items-center gap-2">
          {t("production.vfxProof.title")}
          <span className="font-mono">{target?.work_center}</span>
          {target?.group && <GroupBadge group={target.group} />}
        </span>
      }
      subtitle={t("production.vfxProof.subtitle")
        .replace("{date}", date ? `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}` : "")
        .replace("{cells}", (d?.cells || []).join(", ") || "—")}
      footer={<Button variant="secondary" onClick={onClose}>{t("production.vfxProof.close")}</Button>}
    >
      {q.isLoading && (
        <div className="space-y-2">
          <SkeletonBlock className="h-14 w-full" />
          <SkeletonBlock className="h-40 w-full" />
        </div>
      )}
      {q.isError && (
        <EmptyState tone="danger" showUploadLink={false} title={t("production.vfxProof.loadError")}
          message={q.error?.response?.data?.detail || ""} />
      )}
      {d && (
        <>
          {/* The figure, and where it came from — the whole point of the
              dialog, so it leads: «N people, all from Verifix, read at …». */}
          <div className="rounded-xl px-3 py-2.5 text-sm" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-bold tabular-nums" style={{ color: "var(--text-1)" }}>{fmtNum(d.counted)}</span>
              <span style={{ color: "var(--text-2)" }}>{t("production.vfxProof.countedLine")}</span>
            </div>
            {inRows.length > 0 && (
              <div className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
                {t("production.vfxProof.fromVerifix")
                  .replace("{n}", String(fromVerifix)).replace("{total}", String(inRows.length))}
              </div>
            )}
            {vfxReads.map((r, i) => (
              <div key={i} className="mt-1 flex items-center gap-1.5 text-xs" style={{ color: "var(--text-2)" }}>
                <Database size={12} style={{ color: "var(--brand-text)" }} />
                {t(r.kind === "live" ? "production.vfxProof.liveLine" : "production.vfxProof.readLine")
                  .replace("{d}", ddmm(r.at)).replace("{t}", hhmm(r.at))
                  .replace("{by}", r.by ? tl(r.by) : "—")}
              </div>
            ))}
            {d.saved_at && (
              <div className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
                {t("production.vfxProof.savedLine").replace("{d}", ddmm(d.saved_at)).replace("{t}", hhmm(d.saved_at))
                  .replace("{by}", d.saved_by ? tl(d.saved_by) : "—")}
              </div>
            )}
          </div>

          <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-3)" }}>{t("production.vfxProof.rule")}</p>

          {!d.read ? (
            <EmptyState showUploadLink={false} height="h-28" title={t("production.vfxNotRead")}
              message={t(d.live ? "production.vfxLiveNotClosed" : "production.vfxNotReadNote")} />
          ) : !(d.cells || []).length ? (
            <EmptyState showUploadLink={false} height="h-28" title={t("production.vfxNoCell")} message="" />
          ) : inRows.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: "var(--text-3)" }}>{t("production.vfxProof.nobody")}</p>
          ) : (
            <PeopleTable rows={inRows} showWhy={false} />
          )}

          {outRows.length > 0 && (
            <div>
              <button type="button" onClick={() => setShowOut((v) => !v)} aria-expanded={showOut}
                className="inline-flex items-center gap-1 text-xs font-semibold py-1"
                style={{ color: "var(--text-2)" }}>
                {showOut ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {t("production.vfxProof.notCounted").replace("{n}", String(outRows.length))}
              </button>
              {showOut && <div className="mt-2"><PeopleTable rows={outRows} showWhy /></div>}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
