// «Konteyner berish» — a brigadir's EXTRA request (2026-11-18, the operator:
// «add the request page for supervisors if they need extra containers, and
// this request goes through AXO»). A brigadir's limit keeps logistics from
// giving more than the plan's figure, so a line that runs short asks AXO:
// - the brigadir, on «Qabul»: «Qo'shimcha so'rash» — counts, the hour, why;
//   their asks and where each stands («Qo'shimcha so'rovlarim»);
// - AXO, on «So'rovlar»: approve all or fewer, to a logistics person, or
//   reject with a reason the brigadir reads; an approved ask becomes an
//   ordinary request, split to that brigadir only;
// - «Tahlil»: who asks for extra, how often and why.
// Page key `container-extra` (asking) — admin-only until the operator opens
// it. docs/containers-flow.md.
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ban, Check, Clock, PackagePlus, Truck, X, PackageCheck } from "lucide-react";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import FormField from "../ui/FormField";
import StyledSelect from "../ui/StyledSelect";
import CountStepper from "../ui/CountStepper";
import TableCard, { Th, SectionHead } from "../ui/DataTable";
import { SplitBar, SplitLegend } from "../ui/Meter";
import { SkeletonBlock } from "../ui/Skeleton";
import { tashkentNow } from "../production/HourlyContainers";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import api from "../../utils/api";
import {
  KEYS, span, hhmm, fmt, Chip, CountPills, countsText, fieldCls, fieldStyle,
  EXTRA_REASONS, reasonText, hourNow,
} from "./flowUtil";

const REASON_COLORS = { plan: "#3b82f6", damaged: "#ef4444", short: "#f97316", other: "#94a3b8" };
const MAX_ASK = 1000;

// Where an ask stands — one chip, traffic-light: yellow waits on somebody,
// green arrived, red refused, grey withdrawn.
const STAGE = {
  asked: { tone: "warn", icon: Clock },
  logistics: { tone: "warn", icon: Truck },
  split: { tone: "warn", icon: PackageCheck },
  received: { tone: "ok", icon: Check },
  rejected: { tone: "bad", icon: X },
  cancelled: { tone: "idle", icon: Ban },
  withdrawn: { tone: "idle", icon: Ban },
};
export function ExtraStage({ e, t }) {
  const s = STAGE[e.stage] ?? STAGE.asked;
  return <Chip tone={s.tone} icon={s.icon} title={t(`cflow.ex.stageHint.${e.stage}`)}>{t(`cflow.ex.stage.${e.stage}`)}</Chip>;
}

// ── the brigadir asks ────────────────────────────────────────────────────────
export function AskExtraModal({ t, day, unit, isAdmin, onClose, onDone, onFail }) {
  const { tl } = useTranslit();
  const first = Math.max(0, hourNow(day));
  const hours = Array.from({ length: Math.max(0, 32 - first) }, (_, i) => first + i);
  const [hour, setHour] = useState(hours[0] ?? null);
  const [pick, setPick] = useState(unit);
  const units = useQuery({
    queryKey: ["cflow-all-units"],
    queryFn: () => api.get("/api/container-flow/units").then((x) => x.data.units),
    staleTime: 10 * 60_000,
    enabled: isAdmin && unit == null,
  });
  const [counts, setCounts] = useState({});
  const [reason, setReason] = useState(null);
  const [comment, setComment] = useState("");
  const any = KEYS.some((k) => counts[k] > 0);
  const ok = any && hour != null && pick != null && EXTRA_REASONS.includes(reason)
    && (reason !== "other" || comment.trim().length > 0);
  const m = useMutation({
    mutationFn: () => api.post("/api/container-flow/extras", {
      day, hour, reason, comment, ...(isAdmin ? { manager_id: pick } : {}),
      counts: Object.fromEntries(KEYS.filter((k) => counts[k] > 0).map((k) => [k, counts[k]])),
    }),
    onSuccess: onDone, onError: onFail,      // a refusal leaves the dialog open, with what was typed
  });
  return (
    <Modal onClose={onClose} title={t("cflow.ex.ask")} subtitle={t("cflow.ex.askSub")} maxWidth="max-w-xl"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button icon={<PackagePlus size={14} />} loading={m.isPending} disabled={!ok} onClick={() => m.mutate()}>
            {t("cflow.ex.send")}
          </Button>
        </>
      )}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {isAdmin && unit == null && (
          <FormField label={t("containers.brigadir")} required>
            <StyledSelect searchable value={pick} onChange={setPick} placeholder={t("cflow.pick")}
              options={(units.data ?? []).map((u) => ({ value: u.id, label: `${tl(u.name)}${u.shift ? ` · S${u.shift}` : ""}` }))} />
          </FormField>
        )}
        <FormField label={t("cflow.req.forHour")} required>
          <StyledSelect value={hour} onChange={setHour}
            options={hours.map((h) => ({ value: h, label: h > 23 ? `${span(h)} (+1)` : span(h) }))} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
        {KEYS.map((k) => (
          <FormField key={k} label={t(`production.cont.${k}`)}>
            <CountStepper min={0} max={MAX_ASK} value={counts[k] ?? null} placeholder="0"
              onChange={(n) => setCounts((c) => ({ ...c, [k]: n }))} />
          </FormField>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 mt-3">
        <FormField label={t("cflow.ex.why")} required>
          <StyledSelect value={reason} onChange={setReason} placeholder={t("cflow.reasonPick")}
            options={EXTRA_REASONS.map((r) => ({ value: r, label: t(`cflow.ex.reason.${r}`) }))} />
        </FormField>
        <FormField label={t("cflow.comment")} required={reason === "other"} hint={t("cflow.ex.commentHint")}>
          <textarea rows={2} value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)}
            className={fieldCls} style={fieldStyle} />
        </FormField>
      </div>
    </Modal>
  );
}

// ── the brigadir's own asks, on «Qabul» ─────────────────────────────────────
// Below the receipts, so an ask sent never moves the cards a brigadir confirms.
export function ExtrasList({ t, data, loading, showUnit, canCancel, onCancel, busyId }) {
  const { tl } = useTranslit();
  const list = data?.extras ?? [];
  const waiting = list.filter((e) => e.stage === "asked").length;
  return (
    <section className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={PackagePlus} title={t(showUnit ? "cflow.ex.listAll" : "cflow.ex.listMine")}
        subtitle={t("cflow.ex.listSub")} size="lg"
        right={!loading && waiting > 0 ? <Chip tone="warn">{t("cflow.ex.waitingN").replace("{n}", waiting)}</Chip> : null} />
      <div className="px-3 sm:px-6 pb-4">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {[0, 1].map((i) => <SkeletonBlock key={i} className="h-32 w-full rounded-xl" />)}
          </div>
        ) : !list.length ? (
          <p className="text-sm py-4 text-center" style={{ color: "var(--text-3)" }}>{t("cflow.ex.none")}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {list.map((e) => (
              <article key={e.id} className="rounded-xl p-3 flex flex-col gap-2"
                style={{ background: "var(--bg-inner)", border: `1px solid ${e.stage === "asked" ? "color-mix(in srgb, #eab308 45%, var(--border))" : "var(--border)"}` }}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold tabular-nums leading-tight" style={{ color: "var(--text-1)" }}>{span(e.hour)}</div>
                    {showUnit && <div className="text-[13px] mt-0.5 truncate" style={{ color: "var(--text-2)" }}>{tl(e.unit) || "—"}</div>}
                  </div>
                  <ExtraStage e={e} t={t} />
                </div>
                <CountPills counts={e.approved ?? e.lines} of={e.approved ? e.lines : undefined} t={t} />
                <div className="text-xs" style={{ color: "var(--text-3)" }}>
                  {t("cflow.ex.askedAt").replace("{at}", hhmm(e.asked_at)).replace("{x}", reasonText(t, e))}
                </div>
                {e.decision_note && (
                  <p className="text-xs rounded-lg px-2.5 py-1.5" style={{ background: "var(--bg-card)", color: e.stage === "rejected" ? "var(--status-bad)" : "var(--text-2)" }}>
                    {tl(e.decided_by) || "AXO"}: {e.decision_note}
                  </p>
                )}
                {e.stage === "withdrawn" && e.request?.cancel_note && (
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>{e.request.cancel_note}</p>
                )}
                {e.stage === "asked" && canCancel(e) && (
                  <div>
                    <Button size="sm" variant="ghost" icon={<Ban size={13} />} loading={busyId === e.id} onClick={() => onCancel(e)}>
                      {t("cflow.ex.withdraw")}
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ── AXO decides, on «So'rovlar» ─────────────────────────────────────────────
// Below the requests table (an ask arriving never moves the rows above it);
// drawn once the day has an ask. The tab's badge and AXO's Telegram say one came.
export function ExtrasPanel({ t, data, loading, canDecide, onApprove, onReject }) {
  const { tl } = useTranslit();
  const list = data?.extras ?? [];
  if (loading || !list.length) return null;
  const waiting = list.filter((e) => e.stage === "asked").length;
  const cell = (e, k) => {
    const ask = e.lines[k];
    if (ask == null) return <td key={k} className="px-3 py-2 text-right" style={{ color: "var(--text-4)" }}>—</td>;
    const ok = e.approved?.[k];
    const less = e.approved && (ok ?? 0) < ask;
    return (
      <td key={k} className="px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: "var(--text-1)" }}
        title={less ? t("cflow.ex.okOf").replace("{n}", ok ?? 0).replace("{of}", ask) : undefined}>
        {less ? <>{fmt(ok ?? 0)}<span style={{ color: "var(--text-3)" }}> / {fmt(ask)}</span></> : fmt(ask)}
      </td>
    );
  };
  const actions = (e) => (e.stage === "asked" && canDecide ? (
    <>
      <Button size="sm" variant="secondary" icon={<X size={13} />} onClick={() => onReject(e)}>{t("cflow.ex.reject")}</Button>
      <Button size="sm" icon={<Check size={13} />} onClick={() => onApprove(e)}>{t("cflow.ex.approve")}</Button>
    </>
  ) : null);
  return (
    <div className="flex flex-col gap-2.5">
      {/* phone: a card per ask */}
      <div className="md:hidden flex flex-col gap-2.5">
        <SectionHead icon={PackagePlus} title={t("cflow.ex.panel")}
          right={waiting > 0 ? <Chip tone="warn">{t("cflow.ex.waitingN").replace("{n}", waiting)}</Chip> : null} />
        {list.map((e) => (
          <article key={e.id} className="rounded-2xl p-3.5 flex flex-col gap-2.5"
            style={{ background: "var(--bg-card)", border: `1px solid ${e.stage === "asked" ? "color-mix(in srgb, #eab308 45%, var(--border))" : "var(--border)"}` }}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[16px] font-semibold tabular-nums leading-tight" style={{ color: "var(--text-1)" }}>{span(e.hour)}</div>
                <div className="text-[13px] mt-0.5 truncate" style={{ color: "var(--text-2)" }}>{tl(e.unit) || "—"}</div>
              </div>
              <ExtraStage e={e} t={t} />
            </div>
            <CountPills counts={e.approved ?? e.lines} of={e.approved ? e.lines : undefined} t={t} />
            <div className="text-xs" style={{ color: "var(--text-3)" }}>
              {t("cflow.ex.askedBy").replace("{x}", tl(e.asked_by) || "—").replace("{at}", hhmm(e.asked_at))} · {reasonText(t, e)}
            </div>
            {e.decision_note && <p className="text-xs" style={{ color: "var(--text-2)" }}>{e.decision_note}</p>}
            {actions(e) && <div className="grid grid-cols-2 gap-2">{actions(e)}</div>}
          </article>
        ))}
      </div>
      {/* md+: the table */}
      <div className="hidden md:block">
        <TableCard icon={PackagePlus} title={t("cflow.ex.panel")} subtitle={t("cflow.ex.panelSub")} headSize="lg"
          right={waiting > 0 ? <Chip tone="warn">{t("cflow.ex.waitingN").replace("{n}", waiting)}</Chip>
            : <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{list.length}</span>}>
          <thead>
            <tr>
              <Th label={t("cflow.hour")} />
              <Th label={t("containers.brigadir")} />
              {KEYS.map((k) => <Th key={k} label={t(`cflow.ct.${k}`)} hint={t(`production.cont.${k}`)} align="right" />)}
              <Th label={t("cflow.ex.why")} />
              <Th label={t("cflow.status")} />
              <Th label={t("cflow.ex.asked")} />
              <Th label="" cls="w-px" />
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id} className="text-sm"
                style={e.stage === "asked" ? { background: "color-mix(in srgb, #eab308 8%, transparent)" } : undefined}>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap font-medium" style={{ color: "var(--text-1)" }}>{span(e.hour)}</td>
                <td className="px-3 py-2 whitespace-nowrap max-w-[220px] truncate" style={{ color: "var(--text-1)" }}>
                  {tl(e.unit) || "—"}{e.shift ? <span className="text-[11px]" style={{ color: "var(--text-3)" }}> · S{e.shift}</span> : null}
                </td>
                {KEYS.map((k) => cell(e, k))}
                <td className="px-3 py-2 whitespace-nowrap max-w-[240px] truncate" title={reasonText(t, e)} style={{ color: "var(--text-2)" }}>
                  {reasonText(t, e)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap" title={e.decision_note || undefined}><ExtraStage e={e} t={t} /></td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums" style={{ color: "var(--text-3)" }}>
                  {tl(e.asked_by) || "—"} · {hhmm(e.asked_at)}
                </td>
                {/* every row one height: two 26px buttons or a blank of the same size */}
                <td className="px-3 py-[2px]">
                  <span className="flex items-center justify-end gap-1 min-w-[190px] min-h-[32px]">{actions(e)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      </div>
    </div>
  );
}

// AXO allows the ask: all of it or fewer of each type, to a logistics person.
export function ApproveExtraModal({ t, e, onClose, onDone, onFail }) {
  const { tl } = useTranslit();
  const types = KEYS.filter((k) => e.lines[k] != null);
  const people = useQuery({
    queryKey: ["cflow-logistics"],
    queryFn: () => api.get("/api/container-flow/logistics").then((r) => r.data.people),
  });
  const list = people.data ?? [];
  const [last, setLast] = usePersistentState("cflow_last_logistics", null);
  const [who, setWho] = useState(null);
  const remembered = list.some((p) => p.key === last) ? last : null;
  const to = who ?? remembered ?? (list.length === 1 ? list[0].key : null);
  // what is on AXO's shelf now (`flow.stock`) — beside each count, so a yes is an informed one
  const today = tashkentNow().iso;
  const stock = useQuery({
    queryKey: ["cflow-stock", today, today],
    queryFn: () => api.get("/api/container-flow/stock", { params: { date_from: today, date_to: today } }).then((r) => r.data),
    staleTime: 60_000,
  });
  const shelf = stock.data?.now;
  const [counts, setCounts] = useState(() => ({ ...e.lines }));
  const [note, setNote] = useState("");
  const any = types.some((k) => (counts[k] ?? 0) > 0);
  const m = useMutation({
    mutationFn: () => api.post(`/api/container-flow/extras/${e.id}/approve`, {
      logistics_key: to, note,
      counts: Object.fromEntries(types.filter((k) => counts[k] > 0).map((k) => [k, counts[k]])),
    }),
    onSuccess: (...a) => { setLast(to); onDone(...a); },
    onError: onFail,
  });
  return (
    <Modal onClose={onClose} title={t("cflow.ex.approveTitle")} subtitle={`${tl(e.unit) || "—"} · ${span(e.hour)}`} maxWidth="max-w-xl"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button icon={<Check size={14} />} loading={m.isPending} disabled={!to || !any} onClick={() => m.mutate()}>
            {t("cflow.ex.approveSend")}
          </Button>
        </>
      )}>
      <p className="text-sm rounded-xl px-3 py-2 mb-3" style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
        <b style={{ color: "var(--text-1)" }}>{t("cflow.ex.why")}:</b> {reasonText(t, e)}
      </p>
      <FormField label={t("cflow.req.to")} required
        hint={!people.isLoading && !list.length ? t("cflow.req.noLogistics") : t("cflow.ex.toHint")}>
        <StyledSelect value={to} onChange={setWho} placeholder={t("cflow.pick")} disabled={!list.length}
          options={list.map((p) => ({ value: p.key, label: tl(p.name) }))} />
      </FormField>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
        {types.map((k) => (
          <FormField key={k} label={t(`production.cont.${k}`)}
            hint={[t("cflow.ex.askedN").replace("{n}", fmt(e.lines[k])),
              shelf ? t("cflow.ex.shelf").replace("{n}", fmt(shelf[k] ?? 0)) : null].filter(Boolean).join(" · ")}>
            <CountStepper min={0} max={e.lines[k]} value={counts[k] ?? null} placeholder="0"
              onChange={(n) => setCounts((c) => ({ ...c, [k]: n ?? 0 }))} />
          </FormField>
        ))}
      </div>
      <div className="mt-3">
        <FormField label={t("cflow.ex.noteForBrig")}>
          <textarea rows={2} value={note} maxLength={500} onChange={(ev) => setNote(ev.target.value)} className={fieldCls} style={fieldStyle} />
        </FormField>
      </div>
    </Modal>
  );
}

// AXO says no — always with the reason, which the brigadir reads.
export function RejectExtraModal({ t, e, onClose, onDone, onFail }) {
  const { tl } = useTranslit();
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: () => api.post(`/api/container-flow/extras/${e.id}/reject`, { note: note.trim() }),
    onSuccess: onDone, onError: onFail,
  });
  return (
    <Modal onClose={onClose} title={t("cflow.ex.rejectTitle")} subtitle={`${tl(e.unit) || "—"} · ${span(e.hour)} · ${countsText(t, e.lines)}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="danger" icon={<X size={14} />} loading={m.isPending} disabled={!note.trim()} onClick={() => m.mutate()}>
            {t("cflow.ex.reject")}
          </Button>
        </>
      )}>
      <FormField label={t("cflow.ex.rejectWhy")} required hint={t("cflow.ex.rejectHint")}>
        <textarea rows={3} value={note} maxLength={500} onChange={(ev) => setNote(ev.target.value)} className={fieldCls} style={fieldStyle} />
      </FormField>
    </Modal>
  );
}

// ── «Tahlil»: who asks for extra, how often and why ─────────────────────────
export function ExtrasAnalytics({ t, x, loading }) {
  const { tl } = useTranslit();
  const s = x?.summary;
  const reasons = useMemo(() => EXTRA_REASONS.map((k) => ({
    key: k, label: t(`cflow.ex.reason.${k}`), value: x?.reasons?.[k] ?? 0, color: REASON_COLORS[k],
  })), [x, t]);
  const failed = !loading && x === null;
  const stat = (label, value, color) => (
    <div className="min-w-0 rounded-xl px-3 py-2" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <div className="text-[11px] font-semibold uppercase tracking-wide truncate" style={{ color: "var(--text-3)" }}>{label}</div>
      <div className="text-[18px] font-semibold tabular-nums leading-tight mt-0.5" style={{ color: color ?? "var(--text-1)" }}>
        {loading ? "…" : value}
      </div>
    </div>
  );
  const units = x?.units ?? [];
  return (
    <TableCard icon={PackagePlus} title={t("cflow.ex.anTitle")} subtitle={t("cflow.ex.anSub")} headSize="lg" maxHeight="480px"
      right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{loading || failed ? "" : units.length}</span>}
      toolbar={(
        <div className="flex flex-col gap-3">
          {/* always drawn, so a period change never moves the rows */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {stat(t("cflow.ex.an.asks"), fmt(s?.asks ?? 0))}
            {stat(t("cflow.ex.an.approved"), fmt(s?.approved ?? 0), s?.approved ? "var(--status-ok)" : null)}
            {stat(t("cflow.ex.an.rejected"), fmt(s?.rejected ?? 0), s?.rejected ? "var(--status-bad)" : null)}
            {stat(t("cflow.ex.an.waiting"), fmt(s?.waiting ?? 0), s?.waiting ? "var(--status-warn)" : null)}
            {stat(t("cflow.ex.an.askedN"), fmt(s?.asked_n ?? 0))}
            {stat(t("cflow.ex.an.approvedN"), fmt(s?.approved_n ?? 0))}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>{t("cflow.ex.an.reasons")}</span>
            <SplitBar parts={reasons} height={8} label={t("cflow.ex.an.reasons")} />
            <SplitLegend parts={reasons} />
          </div>
        </div>
      )}>
      <thead>
        <tr>
          <Th label={t("containers.brigadir")} />
          <Th label={t("cflow.ex.an.asks")} align="right" />
          <Th label={t("cflow.ex.an.askedN")} align="right" />
          <Th label={t("cflow.ex.an.approvedN")} align="right" />
          <Th label={t("cflow.ex.an.rejected")} align="right" />
          <Th label={t("cflow.ex.an.top")} />
        </tr>
      </thead>
      <tbody>
        {loading ? Array.from({ length: 3 }).map((_, i) => (
          <tr key={i}><td colSpan={6} className="px-3 py-2"><SkeletonBlock className="h-5 w-full" /></td></tr>
        )) : failed ? (
          <tr><td colSpan={6} className="px-3 py-6 text-center" style={{ color: "var(--status-bad)" }}>{t("cflow.ex.an.failed")}</td></tr>
        ) : !units.length ? (
          <tr><td colSpan={6} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>{t("cflow.ex.an.none")}</td></tr>
        ) : units.map((u) => (
          <tr key={u.manager_id} className="text-sm">
            <td className="px-3 py-2 whitespace-nowrap max-w-[240px] truncate" style={{ color: "var(--text-1)" }}>
              {tl(u.unit) || "—"}{u.shift ? <span className="text-[11px]" style={{ color: "var(--text-3)" }}> · S{u.shift}</span> : null}
            </td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: "var(--text-1)" }}>{fmt(u.asks)}</td>
            <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-1)" }}>{fmt(u.asked_n)}</td>
            <td className="px-3 py-2 text-right tabular-nums" style={{ color: u.approved_n ? "var(--text-1)" : "var(--text-4)" }}>{fmt(u.approved_n)}</td>
            <td className="px-3 py-2 text-right tabular-nums" style={{ color: u.rejected ? "var(--status-bad)" : "var(--text-4)" }}>{fmt(u.rejected)}</td>
            <td className="px-3 py-2 whitespace-nowrap">
              <span className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: "var(--text-2)" }}>
                <span aria-hidden className="w-2 h-2 rounded-[2px]" style={{ background: REASON_COLORS[u.top_reason] ?? "#94a3b8" }} />
                {t(`cflow.ex.reason.${u.top_reason}`)}
                <span className="tabular-nums" style={{ color: "var(--text-3)" }}>· {u.reasons?.[u.top_reason] ?? 0}</span>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
}

// A request that is a brigadir's approved extra says so on its row.
export function ExtraTag({ r, t }) {
  const { tl } = useTranslit();
  if (!r.extra) return null;
  return (
    <Chip tone="idle" icon={PackagePlus}
      title={t("cflow.ex.tagHint").replace("{x}", tl(r.extra.unit) || "—").replace("{why}", reasonText(t, r.extra))}>
      {t("cflow.ex.tag")}
    </Chip>
  );
}
