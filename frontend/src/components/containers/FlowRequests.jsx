// «Konteyner berish» → «So'rovlar» (2026-11-14, the operator): AXO does not
// pick brigadirs — a request names the counts, the hour and ONE logistics
// person («Nuriddin aka»); that person splits it across brigadirs, and each
// brigadir may confirm what reached the line. docs/containers-flow.md.
//
// What the tab answers at a glance:
// - AXO: the day as a strip of hours — which hours have a request, which need
//   one and have none (a tap opens a request for that hour); whether the
//   addressee has opened each request yet; the time left to each deadline.
// - Logistics: what is NEW (not opened yet), what is due first; the split
//   starts from each brigadir's own hour on «Konteynerlar».
// - Everybody: a split request's receipt — every brigadir confirmed, some, or
//   one got fewer.
// Below md every request is a card (Nuriddin aka is on the floor with a
// phone); from md up it is the table.
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, AlertTriangle, ArrowRight, Ban, Building2, CalendarClock, Check, ClipboardList, Eye, EyeOff, MessageSquareText, Pencil, Plus, Sparkles, Split, Trash2, Truck, Users, Wand2,
} from "lucide-react";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmDialog from "../ui/ConfirmDialog";
import FormField from "../ui/FormField";
import StyledSelect from "../ui/StyledSelect";
import CountStepper from "../ui/CountStepper";
import ActionMenu from "../ui/ActionMenu";
import TableCard, { Th, SectionHead } from "../ui/DataTable";
import { SkeletonBlock } from "../ui/Skeleton";
import { SplitBar, SplitLegend } from "../ui/Meter";
import { tashkentNow } from "../production/HourlyContainers";
import { useTranslit } from "../../utils/transliterate";
import api from "../../utils/api";
import {
  KEYS, span, hhmm, sum, fmt, errText, Chip, ReasonFields, reasonOk, fieldCls, fieldStyle,
  useNow, minsTo, hourStartMs, durText, DueText, countsText, CountPills, UNSEEN_WARN_MIN, STAGE_COLORS,
  refreshFlow, LIVE_LIST, useExtras, ALL_KEY, useLogisticsPick, LogisticsField, toName,
  ALL_KEYS, SEND_KEYS, isSend, TypeName, TYPE_COLORS, useSendAreas, shiftName,
  OtdelList, otdelBreakdown, otdelsText,
} from "./flowUtil";
import { ExtrasPanel, ApproveExtraModal, RejectExtraModal, ExtraTag } from "./FlowExtras";

const REFRESH_MS = 60_000;
const LEAD_MIN = 60;            // a request is due an hour before its hour
const SOON_HOURS = 2;           // an hour with no request inside this window reads yellow

// A request still waiting that its addressee has not opened yet (2026-11-14,
// the operator: Nuriddin aka must see which requests are new). Only for the
// person it is addressed to — AXO and admins see every row plain.
// A request sent to EVERY logistics person (2026-11-18) is new for each of
// them (`logi`: the viewer is one) until the first of them opens it.
export const isFresh = (r, me, logi = false) => r.status === "requested" && !r.seen_at && !!me
  && (r.logistics_key === me || (r.logistics_key === ALL_KEY && logi));

function StateChip({ r, t }) {
  if (r.status === "requested" && r.overdue) return <Chip tone="bad" icon={AlertTriangle}>{t("cflow.st.overdue")}</Chip>;
  // a dispatch area's request is DELIVERED, whole or short — nobody confirms it (2026-11-19)
  if (r.status === "assigned" && r.area_id != null) {
    return r.short_reason
      ? <Chip tone="warn" icon={AlertTriangle} title={t(`cflow.reason.${r.short_reason}`)}>{t("cflow.snd.st.short")}</Chip>
      : <Chip tone="ok" icon={Truck}>{t("cflow.snd.st.done")}</Chip>;
  }
  if (r.status === "assigned" && r.receipt?.confirmed) {
    const { units, confirmed, short } = r.receipt;
    if (short) return <Chip tone="bad" icon={AlertTriangle} title={t("cflow.rcv.shortHint")}>{t("cflow.rcv.st.short")}</Chip>;
    if (confirmed === units) return <Chip tone="ok" icon={Check}>{t("cflow.rcv.st.all")}</Chip>;
    return <Chip tone="warn">{t("cflow.rcv.st.part").replace("{n}", confirmed).replace("{of}", units)}</Chip>;
  }
  const tone = { requested: "warn", assigned: "ok", cancelled: "idle" }[r.status] ?? "idle";
  return <Chip tone={tone}>{t(`cflow.req.st.${r.status}`)}</Chip>;
}

// Has the addressee opened it? — for everybody but the addressee, while it waits.
function SeenMark({ r, t, now }) {
  if (r.status !== "requested") return null;
  if (r.seen_at) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] tabular-nums whitespace-nowrap font-normal" style={{ color: "var(--text-3)" }}
        title={t("cflow.seen.at").replace("{at}", hhmm(r.seen_at))}>
        <Eye size={12} className="shrink-0" />{t("cflow.seen.short").replace("{at}", hhmm(r.seen_at))}
      </span>
    );
  }
  const waited = -(minsTo(r.created_at, now) ?? 0);
  const slow = waited >= UNSEEN_WARN_MIN;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] whitespace-nowrap font-medium"
      style={{ color: slow ? "var(--status-warn)" : "var(--text-3)" }} title={t("cflow.seen.notHint")}>
      <EyeOff size={12} className="shrink-0" />
      {slow ? t("cflow.seen.notFor").replace("{d}", durText(t, waited)) : t("cflow.seen.not")}
    </span>
  );
}

// One brigadir's part of a split request, with what they confirmed.
function PartLine({ p, t, tl }) {
  const got = p.received;
  const short = got && KEYS.some((k) => (got[k] ?? 0) < (p.counts[k] ?? 0));
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span style={{ color: "var(--text-1)" }}>{tl(p.unit) || "—"}:</span>
      <span>{countsText(t, p.counts)}</span>
      {got && (short
        ? <AlertTriangle size={12} className="shrink-0" style={{ color: "var(--status-bad)" }} aria-label={t("cflow.rcv.st.short")} />
        : <Check size={13} className="shrink-0" style={{ color: "var(--status-ok)" }} aria-label={t("cflow.rcv.st.all")} />)}
    </span>
  );
}

// What a split request gave dispatch — ONE amount, no area (2026-11-19).
function DispatchLine({ given, t }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <Truck size={13} className="shrink-0" aria-label={t("cflow.snd.icon")} style={{ color: TYPE_COLORS.send }} />
      <span style={{ color: "var(--text-1)" }}>{t("cflow.req.kind.send")}:</span>
      <span>{countsText(t, given)}</span>
    </span>
  );
}

// A dispatch area's request: the area, and what was delivered there.
function AreaLine({ r, t, tx }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <Truck size={13} className="shrink-0" aria-label={t("cflow.snd.icon")} style={{ color: TYPE_COLORS.send }} />
      <span style={{ color: "var(--text-1)" }}>{tx(r.area) || "—"}</span>
      {r.given && <span>: {countsText(t, r.given)}</span>}
    </span>
  );
}

// WHO SENT IT → TO WHOM (2026-11-20, the operator: «add by who its sending to
// who»): the AXO author, an arrow, the logistics person (or «everybody»). One
// line — the author is cut with «…» before the addressee is.
function FromTo({ r, t, tl, className = "" }) {
  const from = tl(r.created_by) || "—";
  const to = toName(t, tl, r);
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 whitespace-nowrap ${className}`}
      title={`${t("cflow.req.fromX").replace("{x}", from)} → ${t("cflow.req.toX").replace("{x}", to)}`}>
      <span className="truncate min-w-0 max-w-[150px]" style={{ color: "var(--text-2)" }}>{from}</span>
      <ArrowRight size={13} className="shrink-0" aria-hidden style={{ color: "var(--text-4)" }} />
      <span className="shrink-0 font-medium inline-flex items-center gap-1" style={{ color: "var(--text-1)" }}>
        {r.logistics_key === ALL_KEY && <Users size={12} className="shrink-0" aria-hidden style={{ color: "var(--text-3)" }} />}
        {to}
      </span>
    </span>
  );
}

// The counts a request asks, as ONE line of compact tags — only the types it
// asks (seven columns of «—» were most of the old row). A type split short
// reads «given / asked» in red.
function CountTags({ r, t }) {
  const given = { ...(r.given ?? {}) };
  for (const p of r.parts) for (const [k, n] of Object.entries(p.counts)) given[k] = (given[k] ?? 0) + n;
  const keys = ALL_KEYS.filter((k) => r.lines[k]);
  if (!keys.length) return <span style={{ color: "var(--text-4)" }}>—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {keys.map((k) => {
        const ask = r.lines[k];
        const short = r.status === "assigned" && (given[k] ?? 0) < ask;
        return (
          <span key={k} className="inline-flex items-center gap-1.5 rounded-md pl-1.5 pr-2 py-[3px] text-xs leading-none"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
            title={short ? `${t(`production.cont.${k}`)} — ${t("cflow.req.gaveOf").replace("{n}", given[k] ?? 0).replace("{of}", ask)}`
              : t(`production.cont.${k}`)}>
            {isSend(k)
              ? <Truck size={11} className="shrink-0" aria-hidden style={{ color: TYPE_COLORS[k] }} />
              : <span className="w-2 h-2 rounded-full shrink-0" aria-hidden style={{ background: TYPE_COLORS[k] }} />}
            <b className="tabular-nums font-semibold" style={{ color: short ? "var(--status-bad)" : "var(--text-1)" }}>
              {short ? <>{fmt(given[k] ?? 0)}<span style={{ color: "var(--text-3)", fontWeight: 500 }}> / {fmt(ask)}</span></> : fmt(ask)}
            </b>
            <span style={{ color: "var(--text-3)" }}>{t(`cflow.ct.${k}`).toLowerCase()}</span>
          </span>
        );
      })}
    </span>
  );
}

export function RequestsTab({ t, day, roles, toast, onNew }) {
  const { tl, tx } = useTranslit();
  const now = useNow();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["cflow-requests", day],
    queryFn: () => api.get("/api/container-flow/requests", { params: { day } }).then((r) => r.data),
    refetchInterval: REFRESH_MS,
    ...LIVE_LIST,
  });
  const [assign, setAssign] = useState(null);
  const [deliver, setDeliver] = useState(null);
  const [cancel, setCancel] = useState(null);
  const [editing, setEditing] = useState(null);
  // a brigadir's EXTRA asks (2026-11-18): AXO approves or rejects them under the requests
  const extras = useExtras(day, roles.axo || roles.watch);
  const [approve, setApprove] = useState(null);
  const [reject, setReject] = useState(null);
  // an admin deletes a request outright — any state (2026-11-15, the operator)
  const [del, setDel] = useState(null);
  const delM = useMutation({
    mutationFn: (r) => api.delete(`/api/container-flow/requests/${r.id}`),
    onSuccess: () => { setDel(null); done(t("cflow.req.deleted")); },
  });
  const list = q.data?.requests ?? [];
  const me = q.data?.me;
  const logi = !!q.data?.logistics;
  // a write here changes «Qabul», «Tahlil» and «Hisobot» too — re-read them all
  const done = (msg) => { toast.success(msg); refreshFlow(qc); };
  const fail = (e) => toast.error(errText(t, e));
  const mayAssign = (r) => r.status === "requested" && roles.logistics
    && (roles.admin || r.logistics_key === me || r.logistics_key === ALL_KEY);
  // AXO withdraws a request while it waits — or after its split (2026-11-15),
  // until a brigadir confirms containers arriving (the server's rule too)
  const mayCancel = (r) => roles.axo && (r.status === "requested" || r.status === "assigned");
  const cancelBlocked = (r) => r.status === "assigned" && (r.receipt?.confirmed ?? 0) > 0;
  // Opening the split is «opening» the request: its «new» mark goes.
  const openAssign = (r) => {
    if (r.area_id != null) setDeliver(r); else setAssign(r);
    if (isFresh(r, me, logi)) api.post(`/api/container-flow/seen/${r.id}`).then(() => q.refetch()).catch(() => {});
  };
  const menu = (r) => [
    // AXO changes a request while it waits (2026-11-18) — once split it is the brigadirs'
    roles.axo && r.status === "requested" && {
      key: "edit", label: t("cflow.req.edit"), icon: Pencil, onSelect: () => setEditing(r),
    },
    mayCancel(r) && {
      key: "cancel", label: t("cflow.req.cancel"), icon: Ban, tone: "danger", onSelect: () => setCancel(r),
      disabled: cancelBlocked(r), title: cancelBlocked(r) ? t("cflow.req.cancelBlocked") : undefined,
    },
    roles.admin && {
      key: "delete", label: t("cflow.req.delete"), icon: Trash2, tone: "danger",
      onSelect: () => { delM.reset(); setDel(r); },
    },
  ];
  const empty = (
    <span className="inline-flex flex-col items-center gap-3">
      {t(roles.axo || roles.watch ? "cflow.req.noneAxo" : "cflow.req.noneLog")}
      {roles.axo && <Button icon={<Plus size={14} />} onClick={() => onNew()}>{t("cflow.req.new")}</Button>}
    </span>
  );
  const ctx = { t, tl, tx, now, me, logi, mayAssign, openAssign, menu };

  return (
    <div className="flex flex-col gap-4">
      {/* the managers watching see the strip too; only AXO taps an hour into a request */}
      {(roles.axo || roles.watch) && (
        <DayStrip t={t} day={day} list={list} loading={q.isLoading} now={now} onPick={roles.axo ? onNew : null} />
      )}

      <DayStatus t={t} list={list} loading={q.isLoading} />

      {/* phone: a card per request */}
      <div className="md:hidden flex flex-col gap-2.5">
        <SectionHead icon={ClipboardList} title={t("cflow.req.title")}
          right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{list.length}</span>} />
        {q.isLoading ? [0, 1, 2].map((i) => <SkeletonBlock key={i} className="h-36 w-full rounded-2xl" />)
          : !list.length ? (
            <div className="rounded-2xl px-4 py-8 text-center text-sm" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-3)" }}>
              {empty}
            </div>
          ) : list.map((r) => <RequestCard key={r.id} r={r} {...ctx} />)}
      </div>

      {/* md+: the table */}
      <div className="hidden md:block">
        <TableCard icon={ClipboardList} title={t("cflow.req.title")}
          subtitle={t(roles.axo || roles.watch ? "cflow.req.subAxo" : "cflow.req.subLog")} headSize="lg"
          right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{list.length}</span>}>
          <thead>
            <tr>
              <Th label={t("cflow.hour")} />
              <Th label={t("cflow.req.fromTo")} hint={t("cflow.req.fromToHint")} />
              <Th label={t("cflow.req.counts")} hint={t("cflow.req.countsHint")} />
              <Th label={t("cflow.status")} />
              <Th label={t("cflow.req.units")} />
              <Th label={t("cflow.due")} hint={t("cflow.req.dueHint")} />
              <Th label="" cls="w-px" />
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? Array.from({ length: 4 }).map((_, i) => (
              <tr key={i}><td colSpan={7} className="px-3 py-2"><SkeletonBlock className="h-5 w-full" /></td></tr>
            )) : !list.length ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center" style={{ color: "var(--text-3)" }}>{empty}</td></tr>
            ) : list.map((r) => <RequestRow key={r.id} r={r} {...ctx} />)}
          </tbody>
        </TableCard>
      </div>

      {/* below the requests: an ask arriving never moves the rows above */}
      {(roles.axo || roles.watch) && (
        <ExtrasPanel t={t} data={extras.data} loading={extras.isLoading} canDecide={roles.axo}
          onApprove={setApprove} onReject={setReject} />
      )}

      {approve && (
        <ApproveExtraModal t={t} e={approve} onClose={() => setApprove(null)}
          onDone={() => { setApprove(null); done(t("cflow.ex.approved")); }}
          onFail={(e) => { fail(e); refreshFlow(qc); }} />
      )}
      {reject && (
        <RejectExtraModal t={t} e={reject} onClose={() => setReject(null)}
          onDone={() => { setReject(null); done(t("cflow.ex.rejected")); }}
          onFail={(e) => { fail(e); refreshFlow(qc); }} />
      )}
      {assign && (
        <AssignModal t={t} r={assign} onClose={() => setAssign(null)}
          onDone={() => { setAssign(null); done(t("cflow.req.assigned")); }}
          onFail={(e) => {
            // sent to everybody and somebody else split it first: the dialog has nothing left to do
            fail(e);
            if (["taken", "state", "gone"].includes(e?.response?.data?.detail)) setAssign(null);
            refreshFlow(qc);
          }} />
      )}
      {deliver && (
        <DeliverModal t={t} r={deliver} onClose={() => setDeliver(null)}
          onDone={() => { setDeliver(null); done(t("cflow.snd.delivered")); }}
          onFail={(e) => {
            fail(e);
            if (["taken", "state", "gone"].includes(e?.response?.data?.detail)) setDeliver(null);
            refreshFlow(qc);
          }} />
      )}
      {editing && (
        <NewRequestModal t={t} day={day} edit={editing} onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); done(t("cflow.req.edited")); }}
          onFail={(e) => {
            fail(e);
            if (["state", "gone"].includes(e?.response?.data?.detail)) setEditing(null);   // split meanwhile
            refreshFlow(qc);
          }} />
      )}
      {cancel && (
        <CancelModal t={t} r={cancel} onClose={() => setCancel(null)}
          onDone={() => { setCancel(null); done(t("cflow.req.cancelled")); }} onFail={fail} />
      )}
      {del && (
        <ConfirmDialog tone="danger" icon={<Trash2 size={18} />}
          title={t("cflow.req.deleteTitle").replace("{span}", span(del.hour))}
          message={t(del.status === "assigned" ? "cflow.req.deleteMsgSplit" : "cflow.req.deleteMsg")
            .replace("{x}", countsText(t, del.lines))}
          confirmLabel={t("cflow.req.delete")} loading={delM.isPending}
          error={delM.error ? errText(t, delM.error) : null}
          onCancel={() => setDel(null)} onConfirm={() => delM.mutate(del)} />
      )}
    </div>
  );
}

// The day at a glance (2026-11-15): its requests by where they stand, as ONE
// bar, and the containers asked → split → received. Always the same height —
// the legend names every state, with 0 where there is none — so a request
// made, split or cancelled never moves the list under it.
function DayStatus({ t, list, loading }) {
  const live = list.filter((r) => r.status !== "cancelled");
  // a dispatch area's request has arrived once it is delivered — nobody confirms it
  const arrived = (r) => r.status === "assigned" && (r.area_id != null || !r.receipt?.units
    || r.receipt.confirmed === r.receipt.units);
  const n = {
    arrived: live.filter(arrived).length,
    split: live.filter((r) => r.status === "assigned" && !arrived(r)).length,
    waiting: live.filter((r) => r.status === "requested" && !r.overdue).length,
    overdue: live.filter((r) => r.status === "requested" && r.overdue).length,
    cancelled: list.length - live.length,
  };
  const parts = [
    { key: "arrived", label: t("cflow.day.arrived"), value: n.arrived, color: "#22c55e" },
    { key: "split", label: t("cflow.day.split"), value: n.split, color: STAGE_COLORS.given },
    { key: "waiting", label: t("cflow.day.waiting"), value: n.waiting, color: "#eab308" },
    { key: "overdue", label: t("cflow.day.overdue"), value: n.overdue, color: "#ef4444" },
    { key: "cancelled", label: t("cflow.day.cancelled"), value: n.cancelled, color: "#94a3b8" },
  ];
  const asked = live.reduce((s, r) => s + sum(r.lines), 0);
  const given = live.reduce((s, r) => s + sum(r.given) + r.parts.reduce((x, p) => x + sum(p.counts), 0), 0);
  const got = live.reduce((s, r) => s + r.parts.reduce((x, p) => x + sum(p.received), 0), 0);
  const stages = [["asked", asked], ["given", given], ["received", got]];
  return (
    <section className="rounded-2xl px-4 py-3 flex flex-col gap-2.5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
          <Activity size={15} style={{ color: "var(--brand-text)" }} />{t("cflow.day.title")}
        </span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 ml-auto text-xs" style={{ color: "var(--text-3)" }}>
          {stages.map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-2 h-2 rounded-full" aria-hidden style={{ background: STAGE_COLORS[k] }} />
              {t(`cflow.an.stage.${k}`)}
              <b className="tabular-nums font-semibold" style={{ color: "var(--text-1)" }}>{loading ? "…" : fmt(v)}</b>
            </span>
          ))}
        </span>
      </div>
      {loading ? <SkeletonBlock className="h-2 w-full rounded-full" /> : <SplitBar parts={parts} height={8} />}
      <SplitLegend parts={parts.map((p) => ({ ...p, value: loading ? "…" : p.value }))} />
    </section>
  );
}

function RequestRow({ r, t, tl, tx, now, me, logi, mayAssign, openAssign, menu }) {
  const fresh = isFresh(r, me, logi);
  const addressee = r.logistics_key === me || (r.logistics_key === ALL_KEY && logi);
  const area = r.area_id != null;
  const lumpGiven = !area && r.given && sum(r.given) > 0 ? r.given : null;
  const title = area ? [tx(r.area), r.given && countsText(t, r.given)].filter(Boolean).join(": ")
    : [...r.parts.map((p) => `${tl(p.unit) || "—"}: ${countsText(t, p.counts)}`
        + (otdelsText(t, tx, p.otdels) ? ` (${otdelsText(t, tx, p.otdels)})` : "")),
      lumpGiven && `${t("cflow.req.kind.send")}: ${countsText(t, lumpGiven)}`].filter(Boolean).join(" · ");
  return (
    <tr className={`text-sm ${fresh ? "font-semibold" : ""}`}
      style={fresh ? { background: "color-mix(in srgb, var(--brand) 17%, transparent)" } : undefined}>
      <td className="px-3 py-2 tabular-nums whitespace-nowrap font-medium" title={fresh ? t("cflow.req.freshHint") : undefined}
        style={{ color: "var(--text-1)", boxShadow: fresh ? "inset 3px 0 0 var(--brand)" : undefined }}>{span(r.hour)}</td>
      <td className="px-3 py-2 whitespace-nowrap font-normal">
        <span className="flex items-center gap-2.5 min-w-0">
          <FromTo r={r} t={t} tl={tl} />
          {!addressee && <SeenMark r={r} t={t} now={now} />}
          {r.note && (
            <span className="inline-flex shrink-0" title={r.note} aria-label={r.note}>
              <MessageSquareText size={13} style={{ color: "var(--text-3)" }} />
            </span>
          )}
        </span>
      </td>
      <td className="px-3 py-2">
        <CountTags r={r} t={t} />
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className="inline-flex items-center gap-1">
          {fresh && <Chip tone="fresh" icon={Sparkles} title={t("cflow.req.freshHint")}>{t("cflow.req.fresh")}</Chip>}
          <ExtraTag r={r} t={t} />
          <StateChip r={r} t={t} />
          {r.late && <Chip tone="bad" title={t("cflow.late")}>{t("cflow.req.lateShort")}</Chip>}
        </span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap max-w-[380px] truncate font-normal" style={{ color: "var(--text-2)" }}
        title={title || r.cancel_note || undefined}>
        {r.status === "cancelled" ? <span style={{ color: "var(--text-3)" }}>{r.cancel_note}</span>
          : area ? <AreaLine r={r} t={t} tx={tx} />
          : r.parts.length || lumpGiven ? (
            <>
              {r.parts.map((p, i) => (
                <span key={p.manager_id}>
                  {i > 0 && <span className="px-1.5" style={{ color: "var(--text-4)" }}>·</span>}
                  <PartLine p={p} t={t} tl={tl} />
                </span>
              ))}
              {lumpGiven && (
                <span>
                  {r.parts.length > 0 && <span className="px-1.5" style={{ color: "var(--text-4)" }}>·</span>}
                  <DispatchLine given={lumpGiven} t={t} />
                </span>
              )}
            </>
          ) : <span style={{ color: "var(--text-4)" }}>—</span>}
      </td>
      <td className="px-3 py-2">
        <DueText iso={r.due_at} now={now} t={t} live={r.status === "requested"} />
      </td>
      {/* every row one height: the cell holds a 32px control or a 32px blank */}
      <td className="px-3 py-[2px]">
        <span className="flex items-center justify-end gap-1 min-w-[140px] min-h-[32px]">
          {mayAssign(r) && (
            <Button size="sm" tint={!fresh} icon={area ? <Truck size={13} /> : <Split size={13} />} onClick={() => openAssign(r)}>
              {t(area ? "cflow.snd.deliver" : "cflow.req.assign")}
            </Button>
          )}
          <ActionMenu label={`${t("cflow.actions")}: ${span(r.hour)}`} items={menu(r)} />
        </span>
      </td>
    </tr>
  );
}

function RequestCard({ r, t, tl, tx, now, me, logi, mayAssign, openAssign, menu }) {
  const fresh = isFresh(r, me, logi);
  const area = r.area_id != null;
  const addressee = r.logistics_key === me || (r.logistics_key === ALL_KEY && logi);
  const items = menu(r).filter(Boolean);
  return (
    <article className="rounded-2xl overflow-hidden"
      style={{
        background: fresh ? "color-mix(in srgb, var(--brand) 12%, var(--bg-card))" : "var(--bg-card)",
        border: `1px solid ${fresh ? "color-mix(in srgb, var(--brand) 55%, transparent)" : "var(--border)"}`,
        boxShadow: fresh ? "inset 4px 0 0 var(--brand)" : undefined,
      }}>
      <div className="p-3.5 flex flex-col gap-2.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-semibold tabular-nums leading-tight" style={{ color: "var(--text-1)" }}>{span(r.hour)}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {fresh && <Chip tone="fresh" icon={Sparkles}>{t("cflow.req.fresh")}</Chip>}
              <ExtraTag r={r} t={t} />
              <StateChip r={r} t={t} />
              {r.late && <Chip tone="bad" title={t("cflow.late")}>{t("cflow.req.lateShort")}</Chip>}
            </div>
          </div>
          <div className="shrink-0 pt-0.5">
            <DueText iso={r.due_at} now={now} t={t} live={r.status === "requested"} />
          </div>
          {items.length > 0 && <ActionMenu label={`${t("cflow.actions")}: ${span(r.hour)}`} items={items} />}
        </div>

        <CountPills counts={r.lines} t={t} />
        {area && (
          <div className="text-xs min-w-0 truncate" style={{ color: "var(--text-2)" }}>
            <AreaLine r={{ ...r, given: null }} t={t} tx={tx} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--text-3)" }}>
          <FromTo r={r} t={t} tl={tl} className="max-w-full" />
          {!addressee && <SeenMark r={r} t={t} now={now} />}
        </div>
        {r.note && (
          <p className="text-xs rounded-lg px-2.5 py-1.5" style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>{r.note}</p>
        )}

        {!area && r.status === "assigned" && r.given && sum(r.given) > 0 && (
          <p className="text-xs min-w-0 truncate" style={{ color: "var(--text-2)" }}>
            <DispatchLine given={r.given} t={t} />
          </p>
        )}
        {area && r.status === "assigned" && r.given && (
          <p className="text-xs pt-2" style={{ borderTop: "1px solid var(--border)", color: "var(--text-2)" }}>
            {t("cflow.snd.gave").replace("{x}", countsText(t, r.given))}
          </p>
        )}
        {r.status === "assigned" && r.parts.length > 0 && (
          <ul className="flex flex-col gap-1 text-xs pt-2" style={{ borderTop: "1px solid var(--border)", color: "var(--text-2)" }}>
            {r.parts.map((p) => (
              <li key={p.manager_id} className="min-w-0 flex flex-col gap-1">
                <span className="truncate"><PartLine p={p} t={t} tl={tl} /></span>
                <OtdelList t={t} otdels={p.otdels} />
              </li>
            ))}
          </ul>
        )}
        {r.status === "cancelled" && r.cancel_note && (
          <p className="text-xs" style={{ color: "var(--text-3)" }}>{r.cancel_note}</p>
        )}
      </div>
      {mayAssign(r) && (
        <div className="px-3.5 pb-3.5">
          <Button size="lg" className="w-full" tint={!fresh} icon={area ? <Truck size={15} /> : <Split size={15} />} onClick={() => openAssign(r)}>
            {t(area ? "cflow.snd.deliver" : "cflow.req.assign")}
          </Button>
        </div>
      )}
    </article>
  );
}

// ── the day as a strip of hours (AXO) ────────────────────────────────────────
// Each hour that needs containers on «Konteynerlar» or already has a request:
// green = every request of it split; yellow = asked, waiting on logistics (red
// once a deadline passed); an hour that NEEDS containers and has no request
// reads yellow inside the next two hours and red once its deadline (an hour
// before it) has passed — a tap opens a request for that hour.
const TILE = {
  done: { bg: "#22c55e1f", line: "#22c55e66", ink: "var(--status-ok)" },
  open: { bg: "#eab3081f", line: "#eab30866", ink: "var(--status-warn)" },
  late: { bg: "#ef44441f", line: "#ef444466", ink: "var(--status-bad)" },
  missed: { bg: "#ef444414", line: "#ef4444", ink: "var(--status-bad)", dashed: true },
  soon: { bg: "transparent", line: "#eab308", ink: "var(--status-warn)", dashed: true },
  later: { bg: "var(--bg-inner)", line: "var(--border)", ink: "var(--text-2)" },
};
const LEGEND = ["done", "open", "soon", "missed"];

function DayStrip({ t, day, list, loading, now, onPick }) {
  const need = useQuery({
    queryKey: ["cflow-hour-need2", day],
    queryFn: () => api.get("/api/container-flow/hour-need", { params: { day } }).then((r) => r.data),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const hours = useMemo(() => {
    const by = new Map();
    const at = (h) => {
      if (!by.has(h)) by.set(h, { hour: h, need: 0, asked: 0, open: 0, overdue: false });
      return by.get(h);
    };
    // the brigadirs' hours and the dispatch areas' (2026-11-19) — together
    for (const [h, c] of Object.entries(need.data?.hours ?? {})) at(Number(h)).need += sum(c);
    for (const hm of Object.values(need.data?.send ?? {})) {
      for (const [h, c] of Object.entries(hm)) at(Number(h)).need += sum(c);
    }
    for (const r of list) {
      if (r.status === "cancelled") continue;
      const e = at(r.hour);
      e.asked += sum(r.lines);
      if (r.status === "requested") { e.open += 1; if (r.overdue) e.overdue = true; }
    }
    return [...by.values()].filter((e) => e.need > 0 || e.asked > 0).sort((a, b) => a.hour - b.hour);
  }, [need.data, list]);
  const stateOf = (e) => {
    if (e.asked > 0) return e.open ? (e.overdue ? "late" : "open") : "done";
    const left = (hourStartMs(day, e.hour) - LEAD_MIN * 60_000 - now) / 60_000;
    return left < 0 ? "missed" : left <= SOON_HOURS * 60 ? "soon" : "later";
  };
  const states = hours.map(stateOf);
  const missing = states.filter((s) => s === "missed" || s === "soon").length;
  const anyMissed = states.includes("missed");
  const current = hours.find((e) => now >= hourStartMs(day, e.hour) && now < hourStartMs(day, e.hour + 1))?.hour;

  // the hour now (or the first one still ahead) in the middle of the strip
  const box = useRef(null);
  const placed = useRef(null);
  useEffect(() => {
    const el = box.current;
    if (!el || !hours.length || placed.current === day) return;
    placed.current = day;
    const target = hours.find((e) => hourStartMs(day, e.hour + 1) > now)?.hour;
    const tile = target != null ? el.querySelector(`[data-hour="${target}"]`) : null;
    if (tile) el.scrollLeft = Math.max(0, tile.offsetLeft - el.clientWidth / 2 + tile.clientWidth / 2);
  }, [hours, day, now]);

  const busy = loading || need.isLoading;
  return (
    <section className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={CalendarClock} title={t("cflow.strip.title")} subtitle={t(onPick ? "cflow.strip.sub" : "cflow.strip.subWatch")}
        right={busy || !hours.length ? null
          // the slot stays filled: a request made from here never moves the strip
          : missing > 0 ? <Chip tone={anyMissed ? "bad" : "warn"} icon={AlertTriangle}>{t("cflow.strip.missing").replace("{n}", missing)}</Chip>
          : <Chip tone="ok" icon={Check}>{t("cflow.strip.allAsked")}</Chip>} />
      <div ref={box} className="relative px-4 overflow-x-auto">
        <div className="flex gap-1.5 min-h-[62px] py-1">
          {busy ? Array.from({ length: 10 }).map((_, i) => <SkeletonBlock key={i} className="h-[56px] w-[68px] shrink-0 rounded-xl" />)
            : !hours.length ? (
              <p className="self-center text-sm" style={{ color: "var(--text-3)" }}>{t("cflow.strip.none")}</p>
            ) : hours.map((e, i) => {
              const st = states[i];
              const c = TILE[st];
              const tip = [
                span(e.hour),
                t("cflow.strip.tipNeed").replace("{n}", e.need),
                t("cflow.strip.tipAsked").replace("{n}", e.asked),
                t(`cflow.strip.st.${st}`),
                onPick && t("cflow.strip.tipTap"),
              ].filter(Boolean).join(" · ");
              const Tile = onPick ? "button" : "div";
              return (
                <Tile key={e.hour} data-hour={e.hour} title={tip} aria-label={tip}
                  {...(onPick ? { type: "button", onClick: () => onPick(e.hour) } : { role: "img" })}
                  className="shrink-0 w-[68px] h-[56px] rounded-xl flex flex-col items-center justify-center gap-0.5"
                  style={{
                    background: c.bg, border: `1.5px ${c.dashed ? "dashed" : "solid"} ${c.line}`,
                    outline: e.hour === current ? "2px solid var(--brand)" : "none", outlineOffset: 2,
                  }}>
                  <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>
                    {span(e.hour).slice(0, 5)}
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums" style={{ color: c.ink }}>
                    {e.need > 0 ? `${fmt(e.asked)}/${fmt(e.need)}` : fmt(e.asked)}
                  </span>
                </Tile>
              );
            })}
        </div>
      </div>
      <div className="px-4 pt-1.5 pb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--text-3)" }}>
        {LEGEND.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" aria-hidden
              style={{ background: TILE[k].dashed ? "transparent" : TILE[k].line, border: `1.5px ${TILE[k].dashed ? "dashed" : "solid"} ${TILE[k].line}` }} />
            {t(`cflow.strip.st.${k}`)}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" aria-hidden style={{ outline: "2px solid var(--brand)", outlineOffset: 1 }} />
          {t("cflow.strip.now")}
        </span>
        <span className="ml-auto tabular-nums">{t("cflow.strip.key")}</span>
      </div>
    </section>
  );
}

// AXO: counts, the hour, and the logistics person it goes to.
// `edit` (a request still waiting, 2026-11-18): the same form opened on that
// request — its hour, counts, addressee and note — saved in place (`PUT`).
// A brigadir's approved extra keeps its hour and never goes past what the
// brigadir asked (the server's rule too).
// ONE request for the hour (2026-11-19, the operator: «we have to do it all in
// the same request»): the brigadirs' crates by «Konteynerlar» AND the dispatch
// areas' containers and lids by «Jo'natish jadvali», filled together for the
// hour. A dispatch area's own request (the morning's first design) is no longer
// made here; editing one of those keeps it as it is — its area and two types.
// WHAT IS LEFT (2026-11-20, the operator: «when he sends a request for half of
// them, after reopening it should show how many left for this hour»): the
// counts fill with the hour's figure LESS what the hour's requests already ask
// — the same sum «Tayyor so'rovlar» takes off (`prepared`) — and the line over
// them says how many requests the hour has and what each type needed / got.
export function NewRequestModal({ t, day, initialHour = null, edit = null, onClose, onDone, onFail }) {
  const { tx } = useTranslit();
  // to every logistics person at once by default (2026-11-18) — or one of them
  const pick = useLogisticsPick(edit?.logistics_key ?? null);
  const { to } = pick;
  const extraCap = edit?.extra?.lines ?? null;
  const kind = edit?.area_id != null ? "send" : "in";
  const send = kind === "send";
  const keys = send ? SEND_KEYS : ALL_KEYS;
  const areasQ = useSendAreas();
  const areas = areasQ.data?.areas ?? [];
  const [area, setArea] = useState(() => edit?.area_id ?? null);
  const areaOpts = areas.map((a) => ({ value: a.id, label: `${tx(a.name)} · ${shiftName(t, a.shift)}` }));
  // an edited request's area stays pickable even if it left the schedule since
  if (edit?.area_id != null && !areaOpts.some((o) => o.value === edit.area_id)) {
    areaOpts.unshift({ value: edit.area_id, label: tx(edit.area) || "—" });
  }
  const [hour, setHour] = useState(() => edit?.hour ?? initialHour ?? Math.min(47, Math.floor(tashkentNow().min / 60) + 1));
  const [counts, setCounts] = useState(() => (edit ? { ...edit.lines } : {}));
  // The hour's figure fills the counts whenever an hour (and, for a dispatch
  // area, an area) is picked — «Konteynerlar» for the brigadirs (the operator,
  // 2026-11-14: «the number of containers should appear by default, then if
  // it is incorrect they will correct it by hand»), «Jo'natish jadvali» for an
  // area. A refetch never overwrites what was typed — only a new slot does.
  const need = useQuery({
    queryKey: ["cflow-hour-need2", day],
    queryFn: () => api.get("/api/container-flow/hour-need", { params: { day } }).then((r) => r.data),
    staleTime: 60_000,
  });
  // the hour's need: the brigadirs' crates and every dispatch area's containers and lids together
  const needOf = (d) => {
    if (send) return (area != null ? d?.send?.[String(area)]?.[String(hour)] : null) ?? null;
    if (!d) return null;
    const out = { ...(d.hours?.[String(hour)] ?? {}) };
    for (const hm of Object.values(d.send ?? {})) {
      for (const [k, n] of Object.entries(hm[String(hour)] ?? {})) out[k] = (out[k] ?? 0) + n;
    }
    return Object.keys(out).length ? out : null;
  };
  const hourNeed = needOf(need.data);
  // the day's requests, read fresh on open (a request sent a moment ago counts)
  const reqs = useQuery({
    queryKey: ["cflow-requests", day],
    queryFn: () => api.get("/api/container-flow/requests", { params: { day } }).then((r) => r.data),
    ...LIVE_LIST,
  });
  // what the hour's requests already ask — not cancelled, a brigadir's approved
  // extra aside (past the limit, never the figure's), the one being edited aside;
  // an area's own request counts for that area only
  const askedOf = (h) => {
    const out = {};
    let n = 0;
    for (const r of reqs.data?.requests ?? []) {
      if (r.status === "cancelled" || r.extra || r.hour !== h || (edit && r.id === edit.id)) continue;
      if (send && r.area_id !== area) continue;
      n += 1;
      for (const [k, v] of Object.entries(r.lines ?? {})) out[k] = (out[k] ?? 0) + v;
    }
    return { counts: out, n };
  };
  const slot = `${kind}:${send ? area : ""}:${hour}`;
  // editing: the request's own counts stand until another slot is picked
  const [filledFor, setFilledFor] = useState(edit ? `${edit.area_id != null ? "send" : "in"}:${edit.area_id ?? ""}:${edit.hour}` : null);
  // what the counts were filled from — the figure, what was asked, what is left
  const [base, setBase] = useState(null);
  const listReady = reqs.isFetchedAfterMount || reqs.isError;
  useEffect(() => {
    if (!need.data || !listReady || filledFor === slot || (send && area == null)) return;
    setFilledFor(slot);
    const src = needOf(need.data);
    const a = askedOf(hour);
    const left = src ? Object.fromEntries(keys.map((k) => [k, Math.max(0, (src[k] ?? 0) - (a.counts[k] ?? 0))])) : null;
    setBase({ slot, need: src, asked: a.counts, n: a.n, left });
    setCounts(Object.fromEntries(keys.map((k) => [k, src?.[k] != null ? left[k] : null])));
  }, [need.data, listReady, slot, filledFor]);      // eslint-disable-line react-hooks/exhaustive-deps
  const cur = base?.slot === slot ? base : null;   // a fill of another hour never speaks for this one
  const ref = cur?.left ?? hourNeed;               // what the counts are compared with
  const changed = ref != null && keys.some((k) => (counts[k] ?? 0) !== (ref[k] ?? 0));
  const askedN = cur?.need ? cur.n : 0;
  const allAsked = askedN > 0 && keys.every((k) => !(cur.left[k] > 0));
  const [note, setNote] = useState(() => edit?.note ?? "");
  const any = keys.some((k) => counts[k] > 0);
  const m = useMutation({
    mutationFn: () => {
      const body = {
        hour, logistics_key: to, note,
        counts: Object.fromEntries(keys.filter((k) => counts[k] > 0).map((k) => [k, counts[k]])),
        ...(send ? { area_id: area } : {}),
      };
      return edit ? api.put(`/api/container-flow/requests/${edit.id}`, body)
        : api.post("/api/container-flow/requests", { day, ...body });
    },
    onSuccess: (...a) => { if (!edit) pick.remember(); onDone(...a); },
    onError: onFail,
  });
  const needLine = need.isLoading || (!edit && !listReady) ? t("cflow.req.needLoading")
    : askedN > 0 ? (allAsked && !changed ? t("cflow.req.allAsked")
      : t(changed ? "cflow.req.needEdited" : "cflow.req.leftFilled")).replace("{span}", span(hour)).replace("{n}", askedN)
    : send ? (area == null ? t("cflow.req.pickArea")
      : hourNeed ? t(changed ? "cflow.req.sendEdited" : "cflow.req.sendFilled").replace("{span}", span(hour))
      : t("cflow.req.sendNone").replace("{span}", span(hour)))
    : hourNeed ? t(changed ? "cflow.req.needEdited" : "cflow.req.needFilled").replace("{span}", span(hour))
    : t("cflow.req.needNone").replace("{span}", span(hour));
  return (
    <Modal onClose={onClose} title={t(edit ? "cflow.req.editTitle" : "cflow.req.new")}
      subtitle={edit ? [span(edit.hour), edit.area_id != null && tx(edit.area), countsText(t, edit.lines)].filter(Boolean).join(" · ")
        : t("cflow.req.newSub")} maxWidth="max-w-xl"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button loading={m.isPending} disabled={!to || !any || (send && area == null)} onClick={() => m.mutate()}>
            {t(edit ? "cflow.req.editSave" : "cflow.req.send")}
          </Button>
        </>
      )}>
      {/* one column with a gap: the figure's line sits between the fields, never over their labels */}
      <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <LogisticsField t={t} pick={pick} />
        <FormField label={t("cflow.req.forHour")} required
          hint={extraCap ? t("cflow.req.extraHour") : t(send ? "cflow.req.forHourHintSend" : "cflow.req.forHourHint")}>
          <StyledSelect value={hour} onChange={setHour} disabled={!!extraCap}
            options={Array.from({ length: 32 }, (_, h) => ({ value: h, label: h > 23 ? `${span(h)} (+1)` : span(h) }))} />
        </FormField>
        {send && (
          <div className="sm:col-span-2">
            <FormField label={t("cflow.req.area")} required
              hint={!areasQ.isLoading && !areas.length ? t("cflow.req.noAreas") : t("cflow.req.areaHint")}>
              <StyledSelect value={area} onChange={setArea} placeholder={t("cflow.pick")} disabled={!areaOpts.length}
                options={areaOpts} />
            </FormField>
          </div>
        )}
      </div>
      <p className="text-[11px] min-h-[16px]" style={{ color: "var(--text-3)" }}>{needLine}</p>
      {/* the crates, then — under a truck — the dispatch containers and lids of the same hour */}
      {[keys.filter((k) => !isSend(k)), keys.filter(isSend)].filter((g) => g.length).map((group, gi) => (
        <div key={gi} className="flex flex-col gap-2">
          {gi > 0 && !send && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide pt-1"
              style={{ color: "var(--text-3)", borderTop: "1px solid var(--border)" }}>
              <Truck size={13} className="mt-2" style={{ color: TYPE_COLORS.send }} />
              <span className="mt-2">{t("cflow.req.sendPart")}</span>
            </span>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {group.map((k) => (
              <FormField key={k} label={<TypeName t={t} k={k} long />}
                hint={extraCap ? t("cflow.ex.askedN").replace("{n}", extraCap[k] ?? 0)
                  : askedN > 0 && cur.need?.[k] != null && cur.asked[k] > 0
                    ? t("cflow.req.needAsked").replace("{need}", fmt(cur.need[k])).replace("{asked}", fmt(cur.asked[k]))
                  : ref && (counts[k] ?? 0) !== (ref[k] ?? 0) ? t("cflow.req.wasNeed").replace("{n}", ref[k] ?? 0) : undefined}>
                <CountStepper min={0} max={extraCap ? (extraCap[k] ?? 0) : undefined} value={counts[k] ?? null} placeholder="0"
                  disabled={!!extraCap && !extraCap[k]} onChange={(n) => setCounts((c) => ({ ...c, [k]: n }))} />
              </FormField>
            ))}
          </div>
        </div>
      ))}
      <FormField label={t("cflow.comment")}>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={fieldCls} style={fieldStyle} />
      </FormField>
      </div>
    </Modal>
  );
}

// Logistics: a dispatch area's request taken there (2026-11-19) — what was
// delivered, per type, starting from what was asked; fewer needs a reason.
// Nobody confirms it: the packaging leaves with the product.
function DeliverModal({ t, r, onClose, onDone, onFail }) {
  const { tx } = useTranslit();
  const types = SEND_KEYS.filter((k) => r.lines[k] != null);
  const [counts, setCounts] = useState(() => ({ ...r.lines }));
  const [reason, setReason] = useState(null);
  const [comment, setComment] = useState("");
  const any = types.some((k) => (counts[k] ?? 0) > 0);
  const short = any && types.some((k) => (counts[k] ?? 0) < r.lines[k]);
  const m = useMutation({
    mutationFn: () => api.post(`/api/container-flow/requests/${r.id}/deliver`, {
      counts: Object.fromEntries(types.map((k) => [k, counts[k] ?? 0])),
      ...(short ? { reason, comment } : {}),
    }),
    onSuccess: onDone, onError: onFail,
  });
  return (
    <Modal onClose={onClose} title={t("cflow.snd.title")} subtitle={`${tx(r.area) || "—"} · ${span(r.hour)}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button icon={<Truck size={14} />} loading={m.isPending} disabled={!any || (short && !reasonOk(reason, comment))}
            onClick={() => m.mutate()}>
            {t("cflow.snd.save")}
          </Button>
        </>
      )}>
      <div className="flex flex-col gap-3">
        <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("cflow.snd.hint")}</p>
        <div className="grid grid-cols-2 gap-3">
          {types.map((k) => (
            <FormField key={k} label={<TypeName t={t} k={k} long />}
              hint={t("cflow.snd.askedN").replace("{n}", fmt(r.lines[k]))}>
              <CountStepper min={0} max={r.lines[k]} value={counts[k] ?? null} placeholder="0"
                onChange={(n) => setCounts((c) => ({ ...c, [k]: n ?? 0 }))} />
            </FormField>
          ))}
        </div>
        {short && <ReasonFields {...{ reason, setReason, comment, setComment, t }} />}
      </div>
    </Modal>
  );
}

// Logistics: the request across brigadirs — a row per brigadir, a count per
// requested container; what is left shows under the rows. The rows START from
// each brigadir's own hour on «Konteynerlar» (`split-hint`), until the person
// changes one. **No brigadir gets past their LIMIT** (2026-11-15, the
// operator): their figure for the hour less what other splits of the hour
// already gave them (`unit_limits`, enforced by the server too) — every count
// is capped at it, a brigadir with nothing left is listed but not pickable.
let rowSeq = 1;
const blankRow = () => ({ id: rowSeq++, unit: null, counts: {}, need: null });

// ONE request for the hour (2026-11-19) also carries the dispatch containers
// and lids: under the brigadirs' rows sits «Jo'natishga» — ONE amount to the
// dispatch areas (the operator: «one lump to dispatch»), any type of the
// request, no limit, nobody confirms it. It starts as every dispatch container
// and lid asked; a crate may go there too when the day needs it.
function AssignModal({ t, r, onClose, onDone, onFail }) {
  const { tl, tx } = useTranslit();
  const types = KEYS.filter((k) => r.lines[k] != null);         // the brigadirs' rows: crates
  const allTypes = ALL_KEYS.filter((k) => r.lines[k] != null);  // everything the request carries
  const units = useQuery({
    queryKey: ["cflow-all-units"],
    queryFn: () => api.get("/api/container-flow/units").then((x) => x.data.units),
    staleTime: 10 * 60_000,
  });
  const hint = useQuery({
    queryKey: ["cflow-split-hint", r.id],
    queryFn: () => api.get(`/api/container-flow/requests/${r.id}/split-hint`).then((x) => x.data),
    staleTime: 60_000,
  });
  const hintRows = hint.data?.rows;
  const limits = hint.data?.limits ?? {};
  // a brigadir's approved EXTRA goes to that brigadir only — the server's rule too
  const extraFor = hint.data?.extra_for ?? r.extra?.manager_id ?? null;
  const leftOf = (unit) => limits[String(unit)]?.left ?? {};
  const givenOf = (unit) => limits[String(unit)]?.given ?? {};
  const capOf = (unit, k) => Math.min(r.lines[k], leftOf(unit)[k] ?? 0);
  const roomOf = (unit) => types.reduce((a, k) => a + capOf(unit, k), 0);
  const [rows, setRows] = useState(() => [blankRow()]);
  const [touched, setTouched] = useState(false);
  const [filled, setFilled] = useState(false);
  const fromHint = (h) => h.map((x) => ({ id: rowSeq++, unit: x.manager_id, counts: { ...x.counts }, need: x.need }));
  useEffect(() => {
    if (filled || touched || !hintRows) return;
    setFilled(true);
    if (hintRows.length) setRows(fromHint(hintRows));
  }, [hintRows, filled, touched]);
  const [reason, setReason] = useState(null);
  const [comment, setComment] = useState("");
  // the dispatch amount: the hint's (every dispatch type asked) until the person changes it
  const extraReq = (hint.data?.extra_for ?? r.extra?.manager_id ?? null) != null;
  const [lumpEdit, setLumpEdit] = useState(null);
  const lump = lumpEdit ?? (extraReq ? {} : hint.data?.dispatch ?? {});
  const setLump = (fn) => setLumpEdit((cur) => fn(cur ?? lump));
  const given = useMemo(() => {
    const g = {};
    for (const row of rows) for (const k of types) g[k] = (g[k] ?? 0) + (row.counts[k] ?? 0);
    for (const k of allTypes) g[k] = (g[k] ?? 0) + (lump[k] ?? 0);
    return g;
  }, [rows, types, allTypes, lump]);
  const over = allTypes.some((k) => given[k] > r.lines[k]);
  // «Why fewer?» only once something is split — not on an empty form.
  const short = allTypes.some((k) => (given[k] ?? 0) < r.lines[k]) && allTypes.some((k) => given[k] > 0);
  const ready = rows.filter((row) => row.unit != null && sum(row.counts) > 0);
  const lumpAny = sum(lump) > 0;
  const bad = rows.some((row) => (row.unit == null) !== (sum(row.counts) === 0));
  const taken = new Set(rows.map((x) => x.unit).filter((x) => x != null));
  // over a limit: the server refuses it too; the field says which count and its cap
  const overLimit = rows.some((row) => row.unit != null && types.some((k) => (row.counts[k] ?? 0) > capOf(row.unit, k)));
  // a brigadir with room for the hour first; one with none stays listed, not pickable
  // a brigadir's otdels (from Verifix, 2026-11-20): named in the picker (searchable),
  // and under the row IN WHICH OTDEL HOW MANY — the count shared by the hour's need
  // (`otdelSplit`, the server's twin stores the same numbers at the split)
  const otdelOf = (unit) => (units.data ?? []).find((u) => u.id === unit)?.otdel?.map(tx).join(", ") || "";
  const otdelEntry = (unit) => hint.data?.otdels?.[String(unit)]
    ?? { names: (units.data ?? []).find((u) => u.id === unit)?.otdel ?? [], w: {} };
  const opts = (mine) => (units.data ?? []).filter((u) => u.id === mine || !taken.has(u.id))
    .map((u) => {
      const room = roomOf(u.id);
      const name = `${tl(u.name)}${u.shift ? ` · S${u.shift}` : ""}`;
      const otdel = otdelOf(u.id);
      return {
        value: u.id, room, short: name,
        label: otdel ? `${name} · ${otdel}` : name,
        disabled: !hint.isLoading && room === 0 && u.id !== mine,
        title: room === 0 ? t("cflow.lim.noneLeft") : undefined,
      };
    })
    .sort((a, b) => (b.room > 0) - (a.room > 0) || a.label.localeCompare(b.label));   // by the name as shown
  const set = (id, patch) => { setTouched(true); setRows((rs) => rs.map((x) => (x.id === id ? { ...x, ...patch } : x))); };
  const m = useMutation({
    mutationFn: () => api.post(`/api/container-flow/requests/${r.id}/assign`, {
      parts: ready.map((row) => ({ manager_id: row.unit, counts: row.counts })),
      ...(lumpAny ? { dispatch: Object.fromEntries(allTypes.filter((k) => lump[k] > 0).map((k) => [k, lump[k]])) } : {}),
      ...(short ? { reason, comment } : {}),
    }),
    onSuccess: onDone, onError: onFail,
  });
  const hinted = filled && (hintRows?.length ?? 0) > 0;
  return (
    <Modal onClose={onClose} title={t("cflow.req.assign")}
      subtitle={`${span(r.hour)} · ${countsText(t, r.lines)}`}
      maxWidth="max-w-3xl"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button icon={<Check size={14} />} loading={m.isPending}
            disabled={(!ready.length && !lumpAny) || bad || over || overLimit || hint.isLoading || (short && !reasonOk(reason, comment))}
            onClick={() => m.mutate()}>
            {t("cflow.req.assignSend")}
          </Button>
        </>
      )}>
      <div className="flex flex-col gap-3">
        {/* where the rows came from — one fixed line, so nothing below moves when the figures land */}
        <div className="flex items-center gap-2 min-h-[34px] rounded-xl px-3 py-1.5 text-xs"
          style={{ background: hinted ? "color-mix(in srgb, var(--brand) 10%, transparent)" : "var(--bg-inner)", color: "var(--text-2)" }}>
          <Wand2 size={14} className="shrink-0" style={{ color: hinted ? "var(--brand-text)" : "var(--text-3)" }} />
          <span className="flex-1 min-w-0">
            {hint.isLoading ? t("cflow.split.loading")
              : extraFor != null ? t("cflow.split.extra").replace("{x}", tl(r.extra?.unit) || "—")
              : hinted ? t(touched ? "cflow.split.edited" : "cflow.split.filled")
              : t("cflow.split.none")}
          </span>
          {hinted && touched && (
            <Button size="sm" variant="ghost" onClick={() => { setRows(fromHint(hintRows)); setTouched(false); }}>
              {t("cflow.split.reset")}
            </Button>
          )}
        </div>
        {rows.map((row, i) => (
          <div key={row.id} className="rounded-xl p-3 flex flex-col gap-2.5" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
            <div className="flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <FormField label={`${t("containers.brigadir")} ${i + 1}`} required
                  hint={row.unit == null || hint.isLoading ? undefined : (() => {
                    const left = Object.fromEntries(types.map((k) => [k, capOf(row.unit, k)]));
                    const before = countsText(t, Object.fromEntries(types.map((k) => [k, givenOf(row.unit)[k] ?? 0])));
                    if (!Object.values(left).some(Boolean)) return t("cflow.lim.noneLeft");
                    // an approved extra has no plan limit — what AXO approved is the whole of it
                    if (extraFor != null) return t("cflow.ex.approvedRow").replace("{x}", countsText(t, left));
                    return t("cflow.lim.row").replace("{x}", countsText(t, left))
                      + (before ? ` ${t("cflow.lim.before").replace("{x}", before)}` : "");
                  })()}>
                  <StyledSelect searchable value={row.unit} onChange={(v) => set(row.id, { unit: v, need: null })}
                    placeholder={t("cflow.pick")} options={opts(row.unit)} />
                  {row.unit != null && !hint.isLoading && (
                    <OtdelList t={t} className="mt-1.5" otdels={otdelBreakdown(otdelEntry(row.unit), row.counts, types)} />
                  )}
                </FormField>
              </div>
              {rows.length > 1 && (
                <Button size="lg" variant="ghost" aria-label={t("cflow.req.removeRow")} title={t("cflow.req.removeRow")}
                  icon={<Trash2 size={15} />} onClick={() => { setTouched(true); setRows((rs) => rs.filter((x) => x.id !== row.id)); }} />
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {types.map((k) => {
                const cap = row.unit == null ? r.lines[k] : capOf(row.unit, k);
                const past = row.unit != null && (row.counts[k] ?? 0) > cap;
                return (
                  <FormField key={k} label={t(`cflow.ct.${k}`)}
                    error={past ? t("cflow.lim.over").replace("{n}", cap) : undefined}>
                    <CountStepper min={0} max={cap} value={row.counts[k] ?? null} placeholder="0" invalid={past}
                      disabled={row.unit != null && cap === 0 && !(row.counts[k] > 0)}
                      onChange={(n) => set(row.id, { counts: { ...row.counts, [k]: n ?? 0 } })} />
                  </FormField>
                );
              })}
            </div>
          </div>
        ))}
        {extraFor == null && types.length > 0 && (
          <div>
            <Button variant="secondary" icon={<Plus size={14} />}
              onClick={() => { setTouched(true); setRows((rs) => [...rs, blankRow()]); }}>
              {t("cflow.req.addRow")}
            </Button>
          </div>
        )}
        {/* ONE amount to dispatch — no limit, nobody confirms it */}
        {!extraReq && (
          <div className="rounded-xl p-3 flex flex-col gap-2.5"
            style={{ background: "color-mix(in srgb, #a855f7 7%, var(--bg-inner))", border: "1px solid color-mix(in srgb, #a855f7 35%, var(--border))" }}>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>
              <Truck size={14} style={{ color: TYPE_COLORS.send }} />{t("cflow.split.dispatch")}
            </span>
            <span className="text-xs" style={{ color: "var(--text-3)" }}>{t("cflow.split.dispatchHint")}</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {allTypes.map((k) => (
                <FormField key={k} label={<TypeName t={t} k={k} />}>
                  <CountStepper min={0} max={r.lines[k]} value={lump[k] ?? null} placeholder="0"
                    onChange={(n) => setLump((c) => ({ ...c, [k]: n ?? 0 }))} />
                </FormField>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
          {allTypes.map((k) => {
            const left = r.lines[k] - (given[k] ?? 0);
            return (
              <span key={k} className="inline-flex items-center whitespace-nowrap"
                style={{ color: left < 0 ? "var(--status-bad)" : left > 0 ? "var(--status-warn)" : "var(--status-ok)" }}>
                <TypeName t={t} k={k} />{`: ${t("cflow.req.left").replace("{n}", left)}`}
              </span>
            );
          })}
        </div>
        {over && <p className="text-xs" style={{ color: "var(--status-bad)" }}>{t("cflow.err.over_req")}</p>}
        {short && !over && <ReasonFields {...{ reason, setReason, comment, setComment, t }} />}
      </div>
    </Modal>
  );
}

function CancelModal({ t, r, onClose, onDone, onFail }) {
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: () => api.post(`/api/container-flow/requests/${r.id}/cancel`, { note: note.trim() }),
    onSuccess: onDone, onError: onFail,
  });
  return (
    <Modal onClose={onClose} title={t("cflow.req.cancel")} subtitle={span(r.hour)}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="danger" loading={m.isPending} disabled={!note.trim()} onClick={() => m.mutate()}>{t("cflow.req.cancel")}</Button>
        </>
      )}>
      {r.status === "assigned" && (
        <p className="text-xs rounded-xl px-3 py-2 mb-3" style={{ background: "#eab3081f", color: "var(--text-2)" }}>
          {t("cflow.req.cancelSplitHint").replace("{n}", r.parts.length)}
        </p>
      )}
      <FormField label={t("cflow.req.cancelWhy")} required>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={fieldCls} style={fieldStyle} />
      </FormField>
    </Modal>
  );
}

// «Tayyor so'rovlar» (2026-11-17): AXO made every hour's request by hand, and
// a forgotten hour only turned red on the strip. The server lists the day's
// hours still ahead with what each needs on «Konteynerlar» less what was
// already asked (`flow.prepared`); she ticks the ones to send — all by
// default — picks the logistics person once and sends them in one go. The
// addressee gets ONE message for the lot. An hour whose counts need changing
// is unticked here and made with «Yangi so'rov».
// A dispatch area's hour (2026-11-19) is its own item — one per area and hour,
// named by its area beside a truck.
const itemKey = (h) => `${h.hour}:${h.area_id ?? ""}`;

export function PreparedModal({ t, day, hours, onClose, onDone, onFail }) {
  const { tx } = useTranslit();
  const pick = useLogisticsPick();
  const { to } = pick;
  const [off, setOff] = useState(() => new Set());      // the items left out
  const picked = hours.filter((h) => !off.has(itemKey(h)));
  const total = picked.reduce((s, h) => s + sum(h.counts), 0);
  const toggle = (key) => setOff((cur) => {
    const next = new Set(cur);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const m = useMutation({
    mutationFn: () => api.post("/api/container-flow/requests/bulk", {
      day, logistics_key: to,
      items: picked.map((h) => ({ hour: h.hour, counts: h.counts, ...(h.area_id != null ? { area_id: h.area_id } : {}) })),
    }),
    onSuccess: () => { pick.remember(); onDone(picked.length); },
    onError: onFail,
  });
  return (
    <Modal onClose={onClose} title={t("cflow.prep.title")} subtitle={t("cflow.prep.sub")} maxWidth="max-w-2xl"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button loading={m.isPending} disabled={!to || !picked.length} onClick={() => m.mutate()}>
            {t("cflow.prep.send").replace("{n}", picked.length)}
          </Button>
        </>
      )}>
      <div className="flex flex-col gap-3">
        <LogisticsField t={t} pick={pick} />
        {!hours.length ? (
          <p className="text-sm py-6 text-center" style={{ color: "var(--text-3)" }}>{t("cflow.prep.none")}</p>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-3 px-3 py-2 text-xs" style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
              <span className="flex-1">{t("cflow.prep.picked").replace("{n}", picked.length).replace("{of}", hours.length)}</span>
              <span className="tabular-nums">{t("cflow.prep.total").replace("{n}", fmt(total))}</span>
              <Button size="sm" variant="ghost"
                onClick={() => setOff(off.size ? new Set() : new Set(hours.map(itemKey)))}>
                {t(off.size ? "cflow.prep.all" : "cflow.prep.noneBtn")}
              </Button>
            </div>
            <ul className="max-h-[46vh] overflow-y-auto">
              {hours.map((h) => {
                const key = itemKey(h);
                const on = !off.has(key);
                const what = [h.area_id != null && tx(h.area), countsText(t, h.counts)].filter(Boolean).join(" · ");
                return (
                  <li key={key} style={{ borderTop: "1px solid var(--border)" }}>
                    <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer text-sm"
                      style={{ opacity: on ? 1 : 0.55 }}>
                      <input type="checkbox" checked={on} onChange={() => toggle(key)} data-no-draft
                        className="w-4 h-4 shrink-0" style={{ accentColor: "var(--brand)" }} />
                      <span className="w-[104px] shrink-0 tabular-nums font-semibold" style={{ color: "var(--text-1)" }}>{span(h.hour)}</span>
                      <span className="flex-1 min-w-0 truncate inline-flex items-center gap-1.5" style={{ color: "var(--text-2)" }} title={what}>
                        {h.area_id != null && <Truck size={13} className="shrink-0" aria-label={t("cflow.snd.icon")} style={{ color: TYPE_COLORS.send }} />}
                        <span className="truncate">{what}</span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums whitespace-nowrap"
                        style={{ color: h.late ? "var(--status-bad)" : "var(--text-3)" }}
                        title={h.late ? t("cflow.prep.lateHint") : undefined}>
                        {t("cflow.dueAt").replace("{at}", hhmm(h.due_at))}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
