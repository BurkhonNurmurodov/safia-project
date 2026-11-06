// «Kadrlar qo'nimsizligi» — which dismissal reasons count. Concept: decide where
// the leavers are, and see the price before saving. The admin ticks a reason
// off and the line under the list says what that does to the plant's rate and to
// how many cells change score; nothing is stored until «Saqlash».
//
// A tick means «counts». The list is every reason Verifix has ever given (plus
// any already switched off that nobody carries now, so it can be put back),
// most used this month first. People with no reason are said apart: they can
// never be excluded, so the KPI never depends on whether the dismissal journal
// happened to be readable. A month that is already closed keeps the list it was
// closed with — the dialog says so instead of promising a change it cannot make.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import SearchInput from "../ui/SearchInput";
import { SkeletonBlock } from "../ui/Skeleton";
import api from "../../utils/api";
import { fill } from "../../pages/turnoverText";
import { errText } from "../kpi/kpiUtil";
import { n0, pct1 } from "./turnoverUtil";

const SEARCH_FROM = 12;       // a list this long gets a search box

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export default function TurnoverReasons({ open, onClose, T, tx = (v) => v, ym, mLabel, toast, onSaved }) {
  const q = useQuery({
    queryKey: ["turnover-exclusions", ym],
    queryFn: () => api.get("/api/turnover/exclusions", { params: { month: ym } }).then((r) => r.data),
    enabled: open, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false,
  });
  const data = q.data;
  const saved = useMemo(() => (data?.reasons || []).filter((x) => x.excluded).map((x) => x.reason), [data]);

  // The draft: the reasons switched OFF. Null until the list has arrived, then
  // seeded once — a refetch never rewrites what the admin is doing.
  const [off, setOff] = useState(null);
  const [needle, setNeedle] = useState("");
  const [err, setErr] = useState(null);
  useEffect(() => { if (data && off === null) setOff(saved); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = off != null && (off.length !== saved.length || off.some((r) => !saved.includes(r)));
  const toggle = (r) => { setErr(null); setOff((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r])); };

  // What the draft would do — asked a beat after the last tick, never for a
  // month that keeps its own list.
  const curKey = dirty ? JSON.stringify([...off].sort()) : null;
  const draftKey = useDebounced(curKey, 300);
  const draft = useMemo(() => (draftKey ? JSON.parse(draftKey) : null), [draftKey]);
  const pv = useQuery({
    queryKey: ["turnover-exclusion-preview", ym, draft],
    queryFn: () => api.get("/api/turnover/exclusions/preview", { params: { month: ym, reasons: draft } }).then((r) => r.data),
    enabled: open && !!draft && !!data?.applies, staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: () => api.put("/api/turnover/exclusions", { reasons: off }).then((r) => r.data),
    onSuccess: () => { toast.success(T.tReasonsSaved); onSaved?.(); onClose(); },
    onError: async (e) => setErr(fill(T.tReasonsFailed, { e: await errText(e) })),
  });

  const all = data?.reasons || [];
  // Shown the way the table prints it (`tx`: Verifix's Cyrillic read in Latin by an
  // Uzbek-Latin reader); what is sent and stored is always Verifix's own text.
  const n = needle.trim().toLowerCase();
  const shown = n ? all.filter((x) => x.reason.toLowerCase().includes(n) || tx(x.reason).toLowerCase().includes(n)) : all;

  let effect = null;
  if (data?.applies && dirty) {
    // Never a figure for an earlier tick: until the answer is for THIS draft, a bar.
    const v = draftKey === curKey ? pv.data : null;
    if (!v) effect = <SkeletonBlock className="h-4 w-3/4 rounded" />;
    else if (v.applies) {
      effect = v.left_before === v.left_after
        ? T.reasonsPreviewNone
        : fill(v.cells_changed ? T.reasonsPreview : T.reasonsPreviewSame,
          { p: n0(v.people), a: pct1(v.rate_before), b: pct1(v.rate_after), n: n0(v.cells_changed) });
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={T.reasonsTitle} subtitle={mLabel} maxWidth="max-w-xl" dirty={dirty}
      bodyClassName="px-5 py-4 space-y-3"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{T.cancel}</Button>
          <Button loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>{T.reasonsSave}</Button>
        </>
      )}>
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>{T.reasonsLead}</p>
      {data && !data.applies && (
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>{fill(T.reasonsClosed, { month: mLabel })}</p>
      )}

      {q.isLoading ? (
        <div className="space-y-1.5">{[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-10 rounded-lg" />)}</div>
      ) : q.isError ? (
        <div className="space-y-2">
          <p className="text-sm" style={{ color: "var(--status-bad)" }}>{T.reasonsLoadFail}</p>
          <Button size="sm" variant="secondary" onClick={() => q.refetch()}>{T.retry}</Button>
        </div>
      ) : off == null ? null : (
        <>
          {all.length > SEARCH_FROM && (
            <SearchInput value={needle} onChange={setNeedle} placeholder={T.reasonsSearch} />
          )}
          {all.length === 0 && !data.blank ? (
            <p className="text-sm py-4 text-center" style={{ color: "var(--text-3)" }}>{T.reasonsNone}</p>
          ) : (
            <div>
              <div className="flex items-center justify-between gap-3 px-3 pb-1 text-xs font-medium" style={{ color: "var(--text-3)" }}>
                <span>{T.reasonsHeadCounts}</span>
                <span>{T.reasonsHeadMonth}</span>
              </div>
              <ul>
                {shown.map((x) => {
                  const isOff = off.includes(x.reason);
                  return (
                    <li key={x.reason}>
                      <label className="flex items-center gap-3 px-3 py-2 min-h-[44px] sm:min-h-[40px] rounded-lg cursor-pointer hover:bg-[var(--bg-inner)]">
                        <input type="checkbox" checked={!isOff} onChange={() => toggle(x.reason)} className="shrink-0"
                          style={{ accentColor: "var(--brand)" }} />
                        <span className="flex-1 min-w-0 text-sm leading-snug break-words transition-colors"
                          style={{ color: isOff ? "var(--text-3)" : "var(--text-1)" }}>{tx(x.reason)}</span>
                        <span className="text-sm tabular-nums shrink-0" style={{ color: "var(--text-2)" }}>
                          {x.month ? n0(x.month) : "—"}
                        </span>
                      </label>
                    </li>
                  );
                })}
                {n && shown.length === 0 && (
                  <li className="px-3 py-3 text-sm" style={{ color: "var(--text-3)" }}>{T.nothing}</li>
                )}
                {data.blank > 0 && (
                  <li className="flex items-start gap-3 px-3 py-2 min-h-[44px] sm:min-h-[40px]">
                    <input type="checkbox" checked disabled className="shrink-0 mt-0.5" style={{ accentColor: "var(--brand)" }}
                      aria-label={T.reasonsBlank} />
                    <span className="flex-1 min-w-0 text-sm leading-snug" style={{ color: "var(--text-3)" }}>
                      {T.reasonsBlank}
                      <span className="block text-xs mt-0.5">{T.reasonsBlankHint}</span>
                    </span>
                    <span className="text-sm tabular-nums shrink-0" style={{ color: "var(--text-2)" }}>{n0(data.blank)}</span>
                  </li>
                )}
              </ul>
            </div>
          )}
          {/* Under the list and a fixed height, so a tick never moves what is above it. */}
          <div className="min-h-[2.75rem] text-sm leading-snug" style={{ color: "var(--text-2)" }} aria-live="polite">
            {err ? <span role="alert" style={{ color: "var(--status-bad)" }}>{err}</span> : effect}
          </div>
        </>
      )}
    </Modal>
  );
}
