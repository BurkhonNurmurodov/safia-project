// What a LIVE day's close waits on, inside the close dialog (/staff from
// `live_day.LIVE_FROM`) — the operator's rulings of
// 2026-10-06: the close reads Verifix once more and is refused while anybody is
// inside or due, while a counted worker has no cell, and while somebody has no
// check-out the brigadir has not answered (ruling 6: set the exit time, or
// mark «did not come», one tap each). The read the close goes on is named, and
// when Verifix cannot be reached the close goes ahead only on a read younger
// than the server's bound (ruling 14).
//
// Reads `GET /api/staff-live/daily/close-check` — the very gate `POST
// /daily/close` re-checks — and reports whether the close may go ahead.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Button from "../ui/Button";
import TimeField from "../ui/TimeField";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import api from "../../utils/api";
import { fill } from "./LiveBits";

const BASE = "/api/staff-live";

function errText(e, fallback) {
  const d = e?.response?.data?.detail;
  return (typeof d === "string" && d) || fallback;
}

function NoCheckoutRow({ row, managerId, date, onDone, canFix }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const [time, setTime] = useState(row.end || "");
  const [busy, setBusy] = useState(null);      // "exit" | "absent"
  const [err, setErr] = useState("");
  async function send(action) {
    setBusy(action); setErr("");
    try {
      await api.post(`${BASE}/daily/clock-fix`, {
        manager_id: managerId, date, employee_id: row.employee_id, action,
        out_time: action === "exit" ? time : null,
      });
      onDone();
    } catch (e) {
      setErr(errText(e, t("staff.saveFailed")));
    } finally {
      setBusy(null);
    }
  }
  return (
    <li className="py-2 border-t first:border-t-0" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium truncate" style={{ color: "var(--text-1)" }}>{tl(row.worker_name)}</span>
        <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-3)" }}>
          {fill(t("staffClose.cameAt"), { t: row.clock_in || "—" })}
        </span>
      </div>
      {canFix && (
        <div className="flex flex-wrap items-center gap-2 mt-1.5">
          <TimeField value={time} onChange={setTime} clearable={false} className="w-[120px]"
            aria-label={t("staffClose.exitAt")} />
          <Button size="sm" variant="primary" disabled={!time || !!busy} loading={busy === "exit"}
            onClick={() => send("exit")}>{t("staffClose.setExit")}</Button>
          <Button size="sm" variant="danger" tint disabled={!!busy} loading={busy === "absent"}
            onClick={() => send("absent")}>{t("staffClose.absent")}</Button>
        </div>
      )}
      {err && <div className="text-[11px] mt-1" style={{ color: "var(--status-bad)" }}>{err}</div>}
    </li>
  );
}

// THE check query — the calendar reads it to arm its confirm, the component
// below to draw it. One cache entry per unit-day.
export function useLiveCloseCheck(managerId, date, enabled = true) {
  return useQuery({
    queryKey: ["live:staff-close-check", managerId, date],
    queryFn: () => api.get(`${BASE}/daily/close-check`, {
      params: { attend_date: date, manager_id: managerId },
    }).then((r) => r.data),
    enabled: enabled && !!managerId && !!date,
    staleTime: 0,
    refetchInterval: 60_000,
  });
}

export default function LiveCloseCheck({ managerId, date, canFix = true }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch, isFetching } = useLiveCloseCheck(managerId, date);
  const closable = !!data?.closable;

  const done = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["live:staff-attendance"] });
  };
  async function clear(eid) {
    try {
      await api.post(`${BASE}/daily/clock-fix`, { manager_id: managerId, date, employee_id: eid, action: "clear" });
    } finally { done(); }
  }

  if (isLoading) return (
    <div className="flex items-center gap-2 mt-3 text-[11px]" style={{ color: "var(--text-3)" }}>
      <Loader2 size={12} className="animate-spin" /> {t("staffClose.checking")}
    </div>
  );
  if (error) return (
    <div className="mt-3 text-[11px]" style={{ color: "var(--status-bad)" }}>
      {errText(error, t("staffClose.checkFailed"))}
    </div>
  );
  const read = (data.read_at || "").slice(11, 16);
  const names = (rows) => rows.map((r) => tl(r.worker_name)).filter(Boolean).slice(0, 6).join(", ")
    + (rows.length > 6 ? ` +${rows.length - 6}` : "");

  return (
    <div className="mt-3 space-y-2 text-[12px]" style={{ color: "var(--text-2)" }}>
      <div style={{ color: data.stale ? "var(--status-bad)" : "var(--text-3)" }}>
        {data.stale
          ? fill(t("staffClose.stale"), { t: read || "—", n: data.max_read_age_min })
          : data.read_error
            ? fill(t("staffClose.readOld"), { t: read || "—" })
            : fill(t("staffClose.readAt"), { t: read || "—" })}
        {isFetching && <Loader2 size={11} className="inline-block animate-spin ml-1.5 align-[-1px]" />}
      </div>
      {data.busy_count > 0 && (
        <div style={{ color: "var(--status-bad)" }}>
          {fill(t("staffClose.busy"), { n: data.busy_count })} {names(data.busy)}
        </div>
      )}
      {data.unplaced > 0 && (
        <div style={{ color: "var(--status-bad)" }}>
          {fill(t("staffClose.unplaced"), { n: data.unplaced })} {data.unplaced_names.map(tl).slice(0, 6).join(", ")}
        </div>
      )}
      {data.no_checkout.length > 0 && (
        <div>
          <div className="font-medium" style={{ color: "var(--status-bad)" }}>
            {fill(t("staffClose.noCheckout"), { n: data.no_checkout.length })}
          </div>
          <ul className="mt-1 max-h-56 overflow-y-auto pr-1">
            {data.no_checkout.map((r) => (
              <NoCheckoutRow key={r.employee_id} row={r} managerId={managerId} date={date}
                onDone={done} canFix={canFix} />
            ))}
          </ul>
        </div>
      )}
      {data.fixes.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
            {t("staffClose.fixed")}
          </div>
          <ul className="mt-1 space-y-1">
            {data.fixes.map((f) => (
              <li key={f.employee_id} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {tl(f.worker_name)} — {f.action === "absent" ? t("staffClose.absent") : fill(t("staffClose.exitWas"), { t: f.out_time })}
                </span>
                {canFix && (
                  <button type="button" className="text-[11px] underline flex-shrink-0" style={{ color: "var(--text-3)" }}
                    onClick={() => clear(f.employee_id)}>{t("staffClose.undo")}</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {closable && (
        <div style={{ color: "var(--status-ok)" }}>{t("staffClose.ready")}</div>
      )}
    </div>
  );
}
