// «Konteyner berish» → «Tahlil» → «AXO zaxirasi» (2026-11-17, the operator:
// «add for AXO how many containers they have in analytics part in the end …
// very crucial information for them»). Nothing on the platform knew AXO's
// stock, so AXO states it: «Sanab kiritish» sets every type, «Qaytdi /
// qo'shildi» adds what came back. From the last count on the server keeps
// the figure itself — what a logistics person split to brigadirs has left
// (`flow.stock`). The tiles say what is on the shelf NOW and whether it
// covers what today still takes; the table is the period day by day:
// opening → given → returned → correction → closing.
// Read by everybody the page is open to; written by AXO (and admins).
// docs/containers-flow.md.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Boxes, CalendarDays, Check, ClipboardCheck, PackagePlus } from "lucide-react";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import FormField from "../ui/FormField";
import CountStepper from "../ui/CountStepper";
import EmptyState from "../ui/EmptyState";
import SegmentedToggle from "../ui/SegmentedToggle";
import Pagination from "../ui/Pagination";
import TableCard, { Th, SectionHead } from "../ui/DataTable";
import { SplitBar } from "../ui/Meter";
import { SkeletonBlock } from "../ui/Skeleton";
import { useTranslit } from "../../utils/transliterate";
import api from "../../utils/api";
import { KEYS, fmt, hhmm, errText, countsText, Chip, TYPE_COLORS, fieldCls, fieldStyle, refreshFlow, LIVE_LIST } from "./flowUtil";

const REFRESH_MS = 60_000;
const PAGE = 30;
const STOCK_MAX = 100000;
const TAKEN = "#a855f7";      // what today still takes — the «split» stage's hue
const LEFT = "#22c55e";
const dm = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const stamp = (iso) => (iso ? `${dm(iso)} ${hhmm(iso)}` : "—");
const signed = (n) => `${n > 0 ? "+" : ""}${fmt(n)}`;
const pick = (o, type) => (o == null ? null : type === "all" ? KEYS.reduce((a, k) => a + (o[k] ?? 0), 0) : (o[type] ?? 0));

export default function FlowStock({ t, from, to, canEdit, toast }) {
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["cflow-stock", from, to],
    queryFn: () => api.get("/api/container-flow/stock", { params: { date_from: from, date_to: to } }).then((r) => r.data),
    refetchInterval: REFRESH_MS,
    ...LIVE_LIST,
  });
  const [dialog, setDialog] = useState(null);       // "count" | "in"
  const s = q.data;
  const loading = q.isLoading;
  const counted = !!s?.counted;
  const lc = s?.last_count;

  // one tile per type, and their sum first: on the shelf now, what today still takes, what that leaves
  const tiles = useMemo(() => {
    if (!s?.now) return [];
    const one = (k) => {
      const now = s.now[k] ?? 0;
      const reserved = s.today?.reserved?.[k] ?? 0;
      const ahead = s.today?.ahead ? (s.today.ahead[k] ?? 0) : null;
      const need = reserved + (ahead ?? 0);
      return { key: k, now, reserved, ahead, need, lack: Math.max(0, need - Math.max(0, now)), minus: now < 0 };
    };
    const per = KEYS.map(one);
    const all = per.reduce((a, x) => ({
      ...a, now: a.now + x.now, reserved: a.reserved + x.reserved,
      ahead: a.ahead == null || x.ahead == null ? null : a.ahead + x.ahead,
      need: a.need + x.need, lack: a.lack + x.lack, minus: a.minus || x.minus,
    }), { key: "all", now: 0, reserved: 0, ahead: 0, need: 0, lack: 0, minus: false });
    return [all, ...per];
  }, [s]);

  const head = (
    <SectionHead icon={Boxes} size="lg" title={t("cflow.stock.title")}
      subtitle={lc
        ? `${t("cflow.stock.lastCount").replace("{at}", stamp(lc.at)).replace("{by}", tl(lc.by) || "—")} ${t("cflow.stock.sub")}`
        : t("cflow.stock.sub")}
      right={canEdit ? (
        <span className="flex items-center gap-2">
          <Button variant="secondary" icon={<PackagePlus size={14} />} disabled={!counted} title={counted ? undefined : t("cflow.stock.countFirst")}
            onClick={() => setDialog("in")}>{t("cflow.stock.in")}</Button>
          <Button icon={<ClipboardCheck size={14} />} onClick={() => setDialog("count")}>{t("cflow.stock.count")}</Button>
        </span>
      ) : null} />
  );

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        {head}
        <div className="px-3 sm:px-6 pb-4">
          {q.isError ? (
            <EmptyState tone="danger" showUploadLink={false} title={t("cflow.loadFailed")} message={errText(t, q.error)} />
          ) : loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
              {KEYS.concat("all").map((k) => <SkeletonBlock key={k} className="h-[118px] w-full rounded-xl" />)}
            </div>
          ) : !counted ? (
            <EmptyState showUploadLink={false} icon={Boxes} title={t("cflow.stock.none")}
              message={t(canEdit ? "cflow.stock.noneMsg" : "cflow.stock.noneWatch")} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
              {tiles.map((x) => <StockTile key={x.key} x={x} t={t} />)}
            </div>
          )}
        </div>
      </section>

      {counted && <StockTable t={t} tl={tl} s={s} period={`${from}|${to}`} />}

      {dialog && (
        <StockModal t={t} kind={dialog} now={s?.now} toast={toast} onClose={() => setDialog(null)}
          onDone={() => { toast.success(t(`cflow.stock.saved.${dialog}`)); setDialog(null); refreshFlow(qc); }} />
      )}
    </div>
  );
}

// One container type on the shelf: the number, what today still takes from
// it, and the verdict — every tile the same height whatever it says.
function StockTile({ x, t }) {
  const all = x.key === "all";
  const still = x.ahead == null
    ? t("cflow.stock.stillNoPlan").replace("{r}", fmt(x.reserved))
    : t("cflow.stock.stillHint").replace("{r}", fmt(x.reserved)).replace("{a}", fmt(x.ahead));
  const left = Math.max(0, x.now - x.need);
  const chip = x.minus ? <Chip tone="warn" icon={AlertTriangle} title={t("cflow.stock.recountHint")}>{t("cflow.stock.recount")}</Chip>
    : x.lack > 0 ? <Chip tone="bad" title={still}>{t("cflow.stock.short").replace("{n}", fmt(x.lack))}</Chip>
    : x.need > 0 ? <Chip tone="ok" icon={Check} title={still}>{t("cflow.stock.enough")}</Chip>
    : <Chip tone="idle" title={still}>{t("cflow.stock.noNeed")}</Chip>;
  return (
    <div className="min-w-0 rounded-xl px-3 py-2.5 flex flex-col gap-1"
      style={{ background: "var(--bg-inner)", border: `1px solid ${x.lack > 0 ? "color-mix(in srgb, #ef4444 45%, var(--border))" : "var(--border)"}` }}>
      <div className="flex items-center gap-1.5 min-w-0">
        <span aria-hidden className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: all ? "var(--text-3)" : TYPE_COLORS[x.key] }} />
        <span className="text-[11px] font-semibold uppercase tracking-wide truncate" style={{ color: "var(--text-3)" }}>
          {all ? t("cflow.stock.total") : t(`cflow.ct.${x.key}`)}
        </span>
      </div>
      <div className="text-[22px] font-semibold tabular-nums leading-tight"
        style={{ color: x.minus ? "var(--status-warn)" : "var(--text-1)" }}>{fmt(x.now)}</div>
      <SplitBar height={4} label={still} parts={[
        { key: "need", label: t("cflow.stock.barNeed"), value: Math.min(x.need, Math.max(0, x.now)), color: x.lack > 0 ? "#ef4444" : TAKEN },
        { key: "left", label: t("cflow.stock.barLeft"), value: left, color: LEFT },
      ]} />
      {/* the number never gives way to its label: on a phone's half-width tile the label is what gets cut */}
      <div className="flex items-baseline justify-between gap-2 text-[12px]" title={still} style={{ color: "var(--text-3)" }}>
        <span className="truncate min-w-0">{t("cflow.stock.barNeed")}</span>
        <b className="tabular-nums shrink-0 font-semibold" style={{ color: x.need ? "var(--text-1)" : "var(--text-3)" }}>{fmt(x.need)}</b>
      </div>
      <div>{chip}</div>
    </div>
  );
}

// The period day by day, or the records AXO made in it — one card, two views.
function StockTable({ t, tl, s, period }) {
  const [view, setView] = useState("days");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [view, type, period]);
  const days = useMemo(() => [...(s.days ?? [])].reverse(), [s]);        // newest first
  const moves = s.moves ?? [];
  const rows = view === "days" ? days : moves;
  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE);
  const num = (v, { strong = false, tone } = {}) => (
    <td className={`px-3 py-2 text-right tabular-nums ${strong ? "font-semibold" : ""}`}
      style={{ color: tone ?? (v == null || v === 0 ? "var(--text-4)" : "var(--text-1)") }}>
      {v == null ? "—" : fmt(v)}
    </td>
  );
  const COLS = view === "days" ? 6 : 5;
  return (
    <div className="flex flex-col gap-2">
      <TableCard icon={CalendarDays} title={t("cflow.stock.moves")} subtitle={t("cflow.stock.movesSub")} headSize="lg" maxHeight="520px"
        right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{rows.length}</span>}
        toolbar={(
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedToggle asTabs value={view} onChange={setView}
              options={[["days", t("cflow.stock.view.days")], ["records", t("cflow.stock.view.records")]]} />
            {/* always drawn: switching the view must not move the table under it */}
            <span className={view === "days" ? "min-w-0" : "min-w-0 invisible"} aria-hidden={view !== "days"}>
              <SegmentedToggle size="sm" value={type} onChange={setType}
                options={[["all", t("cflow.stock.total")], ...KEYS.map((k) => [k, t(`cflow.ct.${k}`)])]} />
            </span>
          </div>
        )}>
        <thead>
          {view === "days" ? (
            <tr>
              <Th label={t("cflow.rep.day")} />
              <Th label={t("cflow.stock.col.open")} align="right" hint={t("cflow.stock.hint.open")} />
              <Th label={t("cflow.stock.col.given")} align="right" hint={t("cflow.stock.hint.given")} />
              <Th label={t("cflow.stock.col.returned")} align="right" hint={t("cflow.stock.hint.returned")} />
              <Th label={t("cflow.stock.col.adjust")} align="right" hint={t("cflow.stock.hint.adjust")} />
              <Th label={t("cflow.stock.col.close")} align="right" hint={t("cflow.stock.hint.close")} />
            </tr>
          ) : (
            <tr>
              <Th label={t("cflow.stock.rec.at")} />
              <Th label={t("cflow.stock.rec.kind")} />
              <Th label={t("cflow.stock.rec.counts")} />
              <Th label={t("cflow.stock.rec.by")} />
              <Th label={t("cflow.stock.rec.note")} />
            </tr>
          )}
        </thead>
        <tbody>
          {!rows.length ? (
            <tr><td colSpan={COLS} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>
              {t(view === "days" ? "cflow.stock.noDays" : "cflow.stock.noRecords")}
            </td></tr>
          ) : view === "days" ? pageRows.map((r) => {
            const adj = pick(r.adjust, type);
            const close = pick(r.close, type);
            return (
              <tr key={r.day} className="text-sm">
                <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{dm(r.day)}</td>
                {num(pick(r.open, type))}
                {num(pick(r.given, type))}
                {num(pick(r.returned, type), { tone: pick(r.returned, type) ? "var(--status-ok)" : undefined })}
                <td className="px-3 py-2 text-right tabular-nums"
                  title={r.counted ? t("cflow.stock.hint.counted") : undefined}
                  style={{ color: !r.counted ? "var(--text-4)" : adj ? "var(--status-warn)" : "var(--text-2)" }}>
                  {r.counted ? signed(adj) : "—"}
                </td>
                {num(close, { strong: true, tone: close != null && close < 0 ? "var(--status-warn)" : close == null ? undefined : "var(--text-1)" })}
              </tr>
            );
          }) : pageRows.map((m) => {
            const text = countsText(t, m.counts) || "0";
            return (
              <tr key={m.id} className="text-sm">
                <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{stamp(m.at)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <Chip tone={m.kind === "count" ? "idle" : "ok"} icon={m.kind === "count" ? ClipboardCheck : PackagePlus}>
                    {t(`cflow.stock.kind.${m.kind}`)}
                  </Chip>
                </td>
                <td className="px-3 py-2 whitespace-nowrap max-w-[360px] truncate" title={text} style={{ color: "var(--text-1)" }}>{text}</td>
                <td className="px-3 py-2 whitespace-nowrap max-w-[200px] truncate" style={{ color: "var(--text-2)" }}>{tl(m.by) || "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap max-w-[260px] truncate" title={m.note || undefined}
                  style={{ color: m.note ? "var(--text-2)" : "var(--text-4)" }}>{m.note || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </TableCard>
      <Pagination page={page} pageCount={Math.ceil(rows.length / PAGE)} total={rows.length} pageSize={PAGE} onPage={setPage} />
    </div>
  );
}

// «Sanab kiritish» names every type (the stock IS these numbers from now on);
// «Qaytdi / qo'shildi» adds — at least one type.
function StockModal({ t, kind, now, toast, onClose, onDone }) {
  const count = kind === "count";
  const [counts, setCounts] = useState(() => Object.fromEntries(
    KEYS.map((k) => [k, count && now ? Math.max(0, now[k] ?? 0) : null])));
  const [note, setNote] = useState("");
  const ready = count ? KEYS.every((k) => counts[k] != null) : KEYS.some((k) => (counts[k] ?? 0) > 0);
  const m = useMutation({
    mutationFn: () => api.post("/api/container-flow/stock", {
      kind, note,
      counts: Object.fromEntries(KEYS.filter((k) => counts[k] != null).map((k) => [k, counts[k]])),
    }),
    onSuccess: onDone,
    onError: (e) => toast.error(errText(t, e)),      // the dialog stays, with what was typed
  });
  return (
    <Modal onClose={onClose} title={t(`cflow.stock.m.${kind}Title`)} subtitle={t(`cflow.stock.m.${kind}Sub`)}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button icon={<Check size={14} />} loading={m.isPending} disabled={!ready} onClick={() => m.mutate()}>
            {t("cflow.stock.m.save")}
          </Button>
        </>
      )}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <FormField key={k} label={t(`production.cont.${k}`)} required={count}
            hint={count && now ? t("cflow.stock.m.book").replace("{n}", fmt(now[k] ?? 0)) : undefined}>
            <CountStepper min={0} max={STOCK_MAX} value={counts[k]} placeholder="0"
              onChange={(n) => setCounts((c) => ({ ...c, [k]: n }))} />
          </FormField>
        ))}
      </div>
      <div className="mt-3">
        <FormField label={t("cflow.stock.m.note")}>
          <input type="text" className={fieldCls} style={fieldStyle} maxLength={300} value={note}
            placeholder={t(`cflow.stock.m.${kind}NotePh`)} onChange={(e) => setNote(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
