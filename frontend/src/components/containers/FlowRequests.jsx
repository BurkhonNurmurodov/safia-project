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
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Ban, CalendarClock, Check, ClipboardList, Eye, EyeOff, Plus, Sparkles, Split, Trash2, Wand2,
} from "lucide-react";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import FormField from "../ui/FormField";
import StyledSelect from "../ui/StyledSelect";
import CountStepper from "../ui/CountStepper";
import ActionMenu from "../ui/ActionMenu";
import TableCard, { Th, SectionHead } from "../ui/DataTable";
import { SkeletonBlock } from "../ui/Skeleton";
import { tashkentNow } from "../production/HourlyContainers";
import { useTranslit } from "../../utils/transliterate";
import api from "../../utils/api";
import {
  KEYS, span, hhmm, sum, fmt, errText, Chip, ReasonFields, reasonOk, fieldCls, fieldStyle,
  useNow, minsTo, hourStartMs, durText, DueText, countsText, CountPills, UNSEEN_WARN_MIN,
} from "./flowUtil";

const REFRESH_MS = 60_000;
const LEAD_MIN = 60;            // a request is due an hour before its hour
const SOON_HOURS = 2;           // an hour with no request inside this window reads yellow

// A request still waiting that its addressee has not opened yet (2026-11-14,
// the operator: Nuriddin aka must see which requests are new). Only for the
// person it is addressed to — AXO and admins see every row plain.
export const isFresh = (r, me) => r.status === "requested" && !r.seen_at && !!me && r.logistics_key === me;

function StateChip({ r, t }) {
  if (r.status === "requested" && r.overdue) return <Chip tone="bad" icon={AlertTriangle}>{t("cflow.st.overdue")}</Chip>;
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

export function RequestsTab({ t, day, roles, toast, onNew }) {
  const { tl } = useTranslit();
  const now = useNow();
  const q = useQuery({
    queryKey: ["cflow-requests", day],
    queryFn: () => api.get("/api/container-flow/requests", { params: { day } }).then((r) => r.data),
    refetchInterval: REFRESH_MS,
  });
  const [assign, setAssign] = useState(null);
  const [cancel, setCancel] = useState(null);
  const list = q.data?.requests ?? [];
  const me = q.data?.me;
  const done = (msg) => { toast.success(msg); q.refetch(); };
  const fail = (e) => toast.error(errText(t, e));
  const mayAssign = (r) => r.status === "requested" && roles.logistics && (roles.admin || r.logistics_key === me);
  // AXO withdraws a request while it waits — or after its split (2026-11-15),
  // until a brigadir confirms containers arriving (the server's rule too)
  const mayCancel = (r) => roles.axo && (r.status === "requested" || r.status === "assigned");
  const cancelBlocked = (r) => r.status === "assigned" && (r.receipt?.confirmed ?? 0) > 0;
  // Opening the split is «opening» the request: its «new» mark goes.
  const openAssign = (r) => {
    setAssign(r);
    if (isFresh(r, me)) api.post(`/api/container-flow/seen/${r.id}`).then(() => q.refetch()).catch(() => {});
  };
  const menu = (r) => [
    mayCancel(r) && {
      key: "cancel", label: t("cflow.req.cancel"), icon: Ban, tone: "danger", onSelect: () => setCancel(r),
      disabled: cancelBlocked(r), title: cancelBlocked(r) ? t("cflow.req.cancelBlocked") : undefined,
    },
  ];
  const empty = (
    <span className="inline-flex flex-col items-center gap-3">
      {t(roles.axo || roles.watch ? "cflow.req.noneAxo" : "cflow.req.noneLog")}
      {roles.axo && <Button icon={<Plus size={14} />} onClick={() => onNew()}>{t("cflow.req.new")}</Button>}
    </span>
  );
  const ctx = { t, tl, now, me, mayAssign, openAssign, menu };

  return (
    <div className="flex flex-col gap-4">
      {/* the managers watching see the strip too; only AXO taps an hour into a request */}
      {(roles.axo || roles.watch) && (
        <DayStrip t={t} day={day} list={list} loading={q.isLoading} now={now} onPick={roles.axo ? onNew : null} />
      )}

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
              <Th label={t("cflow.req.to")} />
              {KEYS.map((k) => <Th key={k} label={t(`cflow.ct.${k}`)} hint={t(`production.cont.${k}`)} align="right" />)}
              <Th label={t("cflow.status")} align="center" />
              <Th label={t("cflow.req.units")} />
              <Th label={t("cflow.due")} hint={t("cflow.req.dueHint")} />
              <Th label="" cls="w-px" />
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? Array.from({ length: 4 }).map((_, i) => (
              <tr key={i}><td colSpan={KEYS.length + 6} className="px-3 py-2"><SkeletonBlock className="h-5 w-full" /></td></tr>
            )) : !list.length ? (
              <tr><td colSpan={KEYS.length + 6} className="px-3 py-8 text-center" style={{ color: "var(--text-3)" }}>{empty}</td></tr>
            ) : list.map((r) => <RequestRow key={r.id} r={r} {...ctx} />)}
          </tbody>
        </TableCard>
      </div>

      {assign && (
        <AssignModal t={t} r={assign} onClose={() => setAssign(null)}
          onDone={() => { setAssign(null); done(t("cflow.req.assigned")); }} onFail={fail} />
      )}
      {cancel && (
        <CancelModal t={t} r={cancel} onClose={() => setCancel(null)}
          onDone={() => { setCancel(null); done(t("cflow.req.cancelled")); }} onFail={fail} />
      )}
    </div>
  );
}

function RequestRow({ r, t, tl, now, me, mayAssign, openAssign, menu }) {
  const fresh = isFresh(r, me);
  const given = {};
  for (const p of r.parts) for (const [k, n] of Object.entries(p.counts)) given[k] = (given[k] ?? 0) + n;
  const title = r.parts.map((p) => `${tl(p.unit) || "—"}: ${countsText(t, p.counts)}`).join(" · ");
  return (
    <tr className={`text-sm ${fresh ? "font-semibold" : ""}`}
      style={fresh ? { background: "color-mix(in srgb, var(--brand) 17%, transparent)" } : undefined}>
      <td className="px-3 py-2 tabular-nums whitespace-nowrap font-medium" title={fresh ? t("cflow.req.freshHint") : undefined}
        style={{ color: "var(--text-1)", boxShadow: fresh ? "inset 3px 0 0 var(--brand)" : undefined }}>{span(r.hour)}</td>
      <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-1)" }} title={r.note || undefined}>
        <span className="inline-flex items-center gap-2">
          {tl(r.logistics_name) || "—"}
          {r.logistics_key !== me && <SeenMark r={r} t={t} now={now} />}
        </span>
      </td>
      {KEYS.map((k) => {
        const ask = r.lines[k];
        if (ask == null) return <td key={k} className="px-3 py-2 text-right" style={{ color: "var(--text-4)" }}>—</td>;
        const short = r.status === "assigned" && (given[k] ?? 0) < ask;
        return (
          <td key={k} className="px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: "var(--text-1)" }}
            title={short ? t("cflow.req.gaveOf").replace("{n}", given[k] ?? 0).replace("{of}", ask) : undefined}>
            {short ? <>{fmt(given[k] ?? 0)}<span style={{ color: "var(--status-bad)" }}> / {fmt(ask)}</span></> : fmt(ask)}
          </td>
        );
      })}
      <td className="px-3 py-2 text-center">
        <span className="inline-flex items-center gap-1">
          {fresh && <Chip tone="fresh" icon={Sparkles} title={t("cflow.req.freshHint")}>{t("cflow.req.fresh")}</Chip>}
          <StateChip r={r} t={t} />
          {r.late && <Chip tone="bad" title={t("cflow.late")}>{t("cflow.req.lateShort")}</Chip>}
        </span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap max-w-[380px] truncate font-normal" style={{ color: "var(--text-2)" }}
        title={title || r.cancel_note || undefined}>
        {r.status === "cancelled" ? <span style={{ color: "var(--text-3)" }}>{r.cancel_note}</span>
          : r.parts.length ? r.parts.map((p, i) => (
            <span key={p.manager_id}>
              {i > 0 && <span className="px-1.5" style={{ color: "var(--text-4)" }}>·</span>}
              <PartLine p={p} t={t} tl={tl} />
            </span>
          )) : <span style={{ color: "var(--text-4)" }}>—</span>}
      </td>
      <td className="px-3 py-2">
        <DueText iso={r.due_at} now={now} t={t} live={r.status === "requested"} />
      </td>
      {/* every row one height: the cell holds a 32px control or a 32px blank */}
      <td className="px-3 py-[2px]">
        <span className="flex items-center justify-end gap-1 min-w-[140px] min-h-[32px]">
          {mayAssign(r) && (
            <Button size="sm" tint={!fresh} icon={<Split size={13} />} onClick={() => openAssign(r)}>{t("cflow.req.assign")}</Button>
          )}
          <ActionMenu label={`${t("cflow.actions")}: ${span(r.hour)}`} items={menu(r)} />
        </span>
      </td>
    </tr>
  );
}

function RequestCard({ r, t, tl, now, me, mayAssign, openAssign, menu }) {
  const fresh = isFresh(r, me);
  const addressee = r.logistics_key === me;
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

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--text-3)" }}>
          {addressee
            ? <span>{t("cflow.req.fromX").replace("{x}", tl(r.created_by) || "—")}</span>
            : <span>{t("cflow.req.toX").replace("{x}", tl(r.logistics_name) || "—")}</span>}
          {!addressee && <SeenMark r={r} t={t} now={now} />}
        </div>
        {r.note && (
          <p className="text-xs rounded-lg px-2.5 py-1.5" style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>{r.note}</p>
        )}

        {r.status === "assigned" && r.parts.length > 0 && (
          <ul className="flex flex-col gap-1 text-xs pt-2" style={{ borderTop: "1px solid var(--border)", color: "var(--text-2)" }}>
            {r.parts.map((p) => <li key={p.manager_id} className="min-w-0 truncate"><PartLine p={p} t={t} tl={tl} /></li>)}
          </ul>
        )}
        {r.status === "cancelled" && r.cancel_note && (
          <p className="text-xs" style={{ color: "var(--text-3)" }}>{r.cancel_note}</p>
        )}
      </div>
      {mayAssign(r) && (
        <div className="px-3.5 pb-3.5">
          <Button size="lg" className="w-full" tint={!fresh} icon={<Split size={15} />} onClick={() => openAssign(r)}>
            {t("cflow.req.assign")}
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
    queryKey: ["cflow-hour-need", day],
    queryFn: () => api.get("/api/container-flow/hour-need", { params: { day } }).then((r) => r.data.hours),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const hours = useMemo(() => {
    const by = new Map();
    const at = (h) => {
      if (!by.has(h)) by.set(h, { hour: h, need: 0, asked: 0, open: 0, overdue: false });
      return by.get(h);
    };
    for (const [h, c] of Object.entries(need.data ?? {})) at(Number(h)).need = sum(c);
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
export function NewRequestModal({ t, day, initialHour = null, onClose, onDone, onFail }) {
  const { tl } = useTranslit();
  const people = useQuery({
    queryKey: ["cflow-logistics"],
    queryFn: () => api.get("/api/container-flow/logistics").then((r) => r.data.people),
  });
  const list = people.data ?? [];
  const [who, setWho] = useState(null);
  const to = who ?? (list.length === 1 ? list[0].key : null);
  const [hour, setHour] = useState(() => initialHour ?? Math.min(47, Math.floor(tashkentNow().min / 60) + 1));
  const [counts, setCounts] = useState({});
  // The hour's figure from the «Konteynerlar» page fills the counts whenever
  // an hour is picked (the operator, 2026-11-14: «the number of containers
  // should appear by default, then if it is incorrect they will correct it by
  // hand»). A refetch never overwrites what was typed — only a new hour does.
  const need = useQuery({
    queryKey: ["cflow-hour-need", day],
    queryFn: () => api.get("/api/container-flow/hour-need", { params: { day } }).then((r) => r.data.hours),
    staleTime: 60_000,
  });
  const hourNeed = need.data?.[String(hour)] ?? null;
  const [filledFor, setFilledFor] = useState(null);
  useEffect(() => {
    if (!need.data || filledFor === hour) return;
    setFilledFor(hour);
    setCounts(Object.fromEntries(KEYS.map((k) => [k, need.data[String(hour)]?.[k] ?? null])));
  }, [need.data, hour, filledFor]);
  const changed = hourNeed != null && KEYS.some((k) => (counts[k] ?? 0) !== (hourNeed[k] ?? 0));
  const [note, setNote] = useState("");
  const any = KEYS.some((k) => counts[k] > 0);
  const m = useMutation({
    mutationFn: () => api.post("/api/container-flow/requests", {
      day, hour, logistics_key: to, note,
      counts: Object.fromEntries(KEYS.filter((k) => counts[k] > 0).map((k) => [k, counts[k]])),
    }),
    onSuccess: onDone, onError: onFail,
  });
  return (
    <Modal onClose={onClose} title={t("cflow.req.new")} subtitle={t("cflow.req.newSub")} maxWidth="max-w-xl"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button loading={m.isPending} disabled={!to || !any} onClick={() => m.mutate()}>{t("cflow.req.send")}</Button>
        </>
      )}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label={t("cflow.req.to")} required
          hint={!people.isLoading && !list.length ? t("cflow.req.noLogistics") : undefined}>
          <StyledSelect value={to} onChange={setWho} placeholder={t("cflow.pick")} disabled={!list.length}
            options={list.map((p) => ({ value: p.key, label: tl(p.name) }))} />
        </FormField>
        <FormField label={t("cflow.req.forHour")} required hint={t("cflow.req.forHourHint")}>
          <StyledSelect value={hour} onChange={setHour}
            options={Array.from({ length: 32 }, (_, h) => ({ value: h, label: h > 23 ? `${span(h)} (+1)` : span(h) }))} />
        </FormField>
      </div>
      <p className="text-[11px] -mb-1 min-h-[16px]" style={{ color: "var(--text-3)" }}>
        {need.isLoading ? t("cflow.req.needLoading")
          : hourNeed ? t(changed ? "cflow.req.needEdited" : "cflow.req.needFilled").replace("{span}", span(hour))
          : t("cflow.req.needNone").replace("{span}", span(hour))}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <FormField key={k} label={t(`production.cont.${k}`)}
            hint={hourNeed && (counts[k] ?? 0) !== (hourNeed[k] ?? 0) ? t("cflow.req.wasNeed").replace("{n}", hourNeed[k] ?? 0) : undefined}>
            <CountStepper min={0} value={counts[k] ?? null} placeholder="0" onChange={(n) => setCounts((c) => ({ ...c, [k]: n }))} />
          </FormField>
        ))}
      </div>
      <FormField label={t("cflow.comment")}>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={fieldCls} style={fieldStyle} />
      </FormField>
    </Modal>
  );
}

// Logistics: the request across brigadirs — a row per brigadir, a count per
// requested container; what is left shows under the rows. The rows START from
// each brigadir's own hour on «Konteynerlar» (`split-hint`: the asked counts
// shared out in proportion to their figures), until the person changes one.
let rowSeq = 1;
const blankRow = () => ({ id: rowSeq++, unit: null, counts: {}, need: null });

function AssignModal({ t, r, onClose, onDone, onFail }) {
  const { tl } = useTranslit();
  const types = KEYS.filter((k) => r.lines[k] != null);
  const units = useQuery({
    queryKey: ["cflow-all-units"],
    queryFn: () => api.get("/api/container-flow/units").then((x) => x.data.units),
    staleTime: 10 * 60_000,
  });
  const hint = useQuery({
    queryKey: ["cflow-split-hint", r.id],
    queryFn: () => api.get(`/api/container-flow/requests/${r.id}/split-hint`).then((x) => x.data.rows),
    staleTime: 60_000,
  });
  const [rows, setRows] = useState(() => [blankRow()]);
  const [touched, setTouched] = useState(false);
  const [filled, setFilled] = useState(false);
  const fromHint = (h) => h.map((x) => ({ id: rowSeq++, unit: x.manager_id, counts: { ...x.counts }, need: x.need }));
  useEffect(() => {
    if (filled || touched || !hint.data) return;
    setFilled(true);
    if (hint.data.length) setRows(fromHint(hint.data));
  }, [hint.data, filled, touched]);
  const [reason, setReason] = useState(null);
  const [comment, setComment] = useState("");
  const given = useMemo(() => {
    const g = {};
    for (const row of rows) for (const k of types) g[k] = (g[k] ?? 0) + (row.counts[k] ?? 0);
    return g;
  }, [rows, types]);
  const over = types.some((k) => given[k] > r.lines[k]);
  // «Why fewer?» only once something is split — not on an empty form.
  const short = types.some((k) => given[k] < r.lines[k]) && types.some((k) => given[k] > 0);
  const ready = rows.filter((row) => row.unit != null && sum(row.counts) > 0);
  const bad = rows.some((row) => (row.unit == null) !== (sum(row.counts) === 0));
  const taken = new Set(rows.map((x) => x.unit).filter((x) => x != null));
  const opts = (mine) => (units.data ?? []).filter((u) => u.id === mine || !taken.has(u.id))
    .map((u) => ({ value: u.id, label: `${tl(u.name)}${u.shift ? ` · S${u.shift}` : ""}` }))
    .sort((a, b) => a.label.localeCompare(b.label));   // by the name as shown, not the stored script
  const set = (id, patch) => { setTouched(true); setRows((rs) => rs.map((x) => (x.id === id ? { ...x, ...patch } : x))); };
  const m = useMutation({
    mutationFn: () => api.post(`/api/container-flow/requests/${r.id}/assign`, {
      parts: ready.map((row) => ({ manager_id: row.unit, counts: row.counts })),
      ...(short ? { reason, comment } : {}),
    }),
    onSuccess: onDone, onError: onFail,
  });
  const hinted = filled && (hint.data?.length ?? 0) > 0;
  return (
    <Modal onClose={onClose} title={t("cflow.req.assign")}
      subtitle={`${span(r.hour)} · ${types.map((k) => `${t(`cflow.ct.${k}`)} ${r.lines[k]}`).join(" · ")}`}
      maxWidth="max-w-3xl"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button icon={<Check size={14} />} loading={m.isPending}
            disabled={!ready.length || bad || over || (short && !reasonOk(reason, comment))} onClick={() => m.mutate()}>
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
              : hinted ? t(touched ? "cflow.split.edited" : "cflow.split.filled")
              : t("cflow.split.none")}
          </span>
          {hinted && touched && (
            <Button size="sm" variant="ghost" onClick={() => { setRows(fromHint(hint.data)); setTouched(false); }}>
              {t("cflow.split.reset")}
            </Button>
          )}
        </div>
        {rows.map((row, i) => (
          <div key={row.id} className="rounded-xl p-3 flex flex-col gap-2.5" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
            <div className="flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <FormField label={`${t("containers.brigadir")} ${i + 1}`} required
                  hint={row.need ? t("cflow.split.rowNeed").replace("{x}", countsText(t, row.need)) : undefined}>
                  <StyledSelect searchable value={row.unit} onChange={(v) => set(row.id, { unit: v, need: null })}
                    placeholder={t("cflow.pick")} options={opts(row.unit)} />
                </FormField>
              </div>
              {rows.length > 1 && (
                <Button size="lg" variant="ghost" aria-label={t("cflow.req.removeRow")} title={t("cflow.req.removeRow")}
                  icon={<Trash2 size={15} />} onClick={() => { setTouched(true); setRows((rs) => rs.filter((x) => x.id !== row.id)); }} />
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {types.map((k) => (
                <FormField key={k} label={t(`cflow.ct.${k}`)}>
                  <CountStepper min={0} max={r.lines[k]} value={row.counts[k] ?? null} placeholder="0"
                    onChange={(n) => set(row.id, { counts: { ...row.counts, [k]: n ?? 0 } })} />
                </FormField>
              ))}
            </div>
          </div>
        ))}
        <div>
          <Button variant="secondary" icon={<Plus size={14} />}
            onClick={() => { setTouched(true); setRows((rs) => [...rs, blankRow()]); }}>
            {t("cflow.req.addRow")}
          </Button>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
          {types.map((k) => {
            const left = r.lines[k] - (given[k] ?? 0);
            return (
              <span key={k} style={{ color: left < 0 ? "var(--status-bad)" : left > 0 ? "var(--status-warn)" : "var(--status-ok)" }}>
                {t(`cflow.ct.${k}`)}: {t("cflow.req.left").replace("{n}", left)}
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
