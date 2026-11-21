// «Konteyner berish» — the pieces every tab of the page shares
// (pages/ContainerFlow.jsx, docs/containers-flow.md).
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, LayoutGrid, Truck } from "lucide-react";
import FormField from "../ui/FormField";
import StyledSelect from "../ui/StyledSelect";
import { hourLabel, tashkentNow, prevISO } from "../production/HourlyContainers";
import api from "../../utils/api";
import { useTranslit } from "../../utils/transliterate";
import { cellLabel, cellName } from "../../utils/cellName";
import { usePersistentState } from "../../hooks/usePersistentState";
import { ontimeTone } from "../../utils/statusBands";

export const KEYS = ["yellow", "round", "grey", "bucket", "box"];
// «Jo'natish» (2026-11-19): a dispatch area's container and lid — packaging
// that leaves with the product, so they are types of their own, always shown
// with a truck (`TypeName`), and added into every total.
export const SEND_KEYS = ["send", "lid"];
export const ALL_KEYS = [...KEYS, ...SEND_KEYS];
export const isSend = (k) => SEND_KEYS.includes(k);
export const REASONS = ["short", "damaged", "wrong_type", "other"];

export const span = (h) => `${hourLabel(h)}:00–${hourLabel(h + 1)}:00`;
// The server sends Tashkent wall-clock ISO strings («2026-11-14T08:05+05:00»).
export const hhmm = (iso) => (iso ? String(iso).slice(11, 16) : "—");
export const sum = (o) => Object.values(o || {}).reduce((a, b) => a + (Number(b) || 0), 0);
export const fmt = (v) => (v == null ? "—" : Number(v).toLocaleString("ru-RU"));

// A refused step answers 409 with a code the page words; anything else is
// shown as it came.
export const errText = (t, e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") {
    const k = `cflow.err.${d}`;
    const s = t(k);
    if (s && s !== k) return s;
    return d;
  }
  return e?.message || t("cflow.err.unknown");
};

const TONES = {
  ok: ["#22c55e", "var(--status-ok)"],
  warn: ["#eab308", "var(--status-warn)"],
  bad: ["#ef4444", "var(--status-bad)"],
  idle: ["#94a3b8", "var(--text-3)"],
  // Not a status: a request its addressee has not opened yet.
  fresh: ["#C8973F", "var(--brand-text)"],
};

export function Chip({ tone = "idle", icon: Icon, title, children }) {
  const [hex, ink] = TONES[tone] ?? TONES.idle;
  return (
    <span title={title}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-[3px] text-[11px] font-semibold leading-none whitespace-nowrap align-middle"
      style={{ background: `${hex}24`, color: ink }}>
      {Icon && <Icon size={11} className="shrink-0" />}
      {children}
    </span>
  );
}

export const fieldCls = "w-full rounded-xl px-3 py-2 text-sm outline-none";
export const fieldStyle = { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };

// «Why fewer?» — the reason every lower number carries, and its words.
export function ReasonFields({ reason, setReason, comment, setComment, t, error }) {
  return (
    <>
      <FormField label={t("cflow.reason")} required error={error}>
        <StyledSelect value={reason} onChange={setReason} placeholder={t("cflow.reasonPick")}
          options={REASONS.map((r) => ({ value: r, label: t(`cflow.reason.${r}`) }))} />
      </FormField>
      <FormField label={t("cflow.comment")} required={reason === "other"}>
        <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)}
          className={fieldCls} style={fieldStyle} />
      </FormField>
    </>
  );
}

export const reasonOk = (reason, comment) => REASONS.includes(reason) && (reason !== "other" || comment.trim().length > 0);


// ── time ─────────────────────────────────────────────────────────────────────
// A clock that re-renders its caller every `ms` — the deadlines count down.
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

// Minutes from `now` to an ISO moment (negative once it has passed).
export const minsTo = (iso, now) => (iso ? Math.round((new Date(iso).getTime() - now) / 60_000) : null);
// The start of hour `h` of the production day `day` (past 23 = the next morning).
export const hourStartMs = (day, h) => new Date(`${day}T00:00:00+05:00`).getTime() + h * 3_600_000;
export const SOON_MIN = 30;           // the last half hour before a deadline reads yellow
export const UNSEEN_WARN_MIN = 15;    // a request nobody opened for this long reads yellow

export const durText = (t, m) => {
  const a = Math.abs(m);
  if (a < 60) return t("cflow.dur.m").replace("{m}", a);
  return t("cflow.dur.hm").replace("{h}", Math.floor(a / 60)).replace("{m}", a % 60);
};

// A deadline as the time LEFT: plain while there is room, yellow inside the
// last half hour, red once it has passed. `live={false}` prints the clock.
export function DueText({ iso, now, t, live = true }) {
  if (!iso) return <span style={{ color: "var(--text-4)" }}>—</span>;
  if (!live) return <span className="tabular-nums" style={{ color: "var(--text-3)" }}>{hhmm(iso)}</span>;
  const m = minsTo(iso, now);
  const color = m < 0 ? "var(--status-bad)" : m <= SOON_MIN ? "var(--status-warn)" : "var(--text-2)";
  return (
    <span className="inline-flex items-center gap-1 tabular-nums whitespace-nowrap font-medium text-[13px]" style={{ color }}
      title={t("cflow.dueAt").replace("{at}", hhmm(iso))}>
      <Clock size={12} className="shrink-0" />
      {(m < 0 ? t("cflow.left.late") : t("cflow.left.in")).replace("{d}", durText(t, m))}
    </span>
  );
}

// A container type's name — with a small truck when it is a dispatch type
// (the operator: «add a little icon to know that it is for sending»). `long`
// is the full name a form field carries.
export function TypeName({ t, k, long = false }) {
  const name = t(long ? `production.cont.${k}` : `cflow.ct.${k}`);
  if (!isSend(k)) return name;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" title={t("cflow.snd.icon")}>
      <Truck size={12} className="shrink-0" aria-hidden style={{ color: TYPE_COLORS[k] }} />
      {name}
    </span>
  );
}

// «30 to'rtburchak, 8 chelak» — a set of counts as words.
export const countsText = (t, counts) => ALL_KEYS.filter((k) => counts?.[k])
  .map((k) => `${counts[k]} ${t(isSend(k) ? `production.cont.${k}` : `cflow.ct.${k}`).toLowerCase()}`).join(", ");

// ── to which cell how many (2026-11-20) ──────────────────────────────────────
// The twins of `container_flow.share_out` / `cell_split` — KEEP THEM IN STEP:
// the dialog shows the very numbers the split then stores.
export function shareOut(total, weights) {
  const w = weights.reduce((a, x) => a + x, 0);
  if (!(total > 0) || !(w > 0)) return weights.map(() => 0);
  const quota = weights.map((x) => (total * x) / w);
  const out = quota.map((q) => Math.floor(q));
  let left = total - out.reduce((a, x) => a + x, 0);
  const order = weights.map((_, i) => i).sort((a, b) => (quota[b] - out[b]) - (quota[a] - out[a]) || a - b);
  for (const i of order) { if (left <= 0) break; out[i] += 1; left -= 1; }
  return out;
}

// `entry` = one brigadir's {names, w: {ctype: [[cell, weight]…]}} from the split hint
export function cellSplit(entry, k, n) {
  if (!entry || !(n > 0)) return {};
  const ws = entry.w?.[k] ?? [];
  if (!ws.length) return entry.names?.length === 1 ? { [entry.names[0]]: n } : {};
  const got = shareOut(n, ws.map((x) => x[1]));
  const out = {};
  ws.forEach(([c], i) => { if (got[i]) out[c] = got[i]; });
  return out;
}

// {cell: {ctype: n}} for one brigadir's counts — every cell of theirs listed, in order
export function cellBreakdown(entry, counts, keys) {
  const out = {};
  for (const c of entry?.names ?? []) out[c] = {};
  for (const k of keys) {
    for (const [c, n] of Object.entries(cellSplit(entry, k, counts?.[k] ?? 0))) (out[c] ??= {})[k] = n;
  }
  return out;
}

// The breakdown as rows: the cell — its verifix CODE, how a cell is named
// (`utils/cellName.js`); a team with no cell by its work centre — and its counts.
// `workshops` ({code: {lang: name}}) names the cell's WORKSHOP under its code
// (2026-11-21, the operator, on the split dialog: «remove the names, put just
// workshop names») — the one place outside /cells that prints it (`utils/cellName.js`).
// The name has a ROW OF ITS OWN and wraps (the operator, the same day: «add
// another row … make the given name visible for all devices»): on one line with
// the counts it was cut to «0811 · T…» on a phone, whenever the counts were long.
export function CellList({ t, cells, workshops, className = "" }) {
  const { tx, lang } = useTranslit();
  const rows = Object.entries(cells ?? {});
  if (!rows.length) return null;
  return (
    <div className={`rounded-lg overflow-hidden ${className}`} style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
      {rows.map(([c, n], i) => {
        const text = countsText(t, n);
        const who = workshops?.[c] ? tx(cellName(workshops[c], lang, "")) : "";
        return (
          <div key={c || "_"} className="px-2.5 py-1.5 text-xs" title={cellLabel(c, who) || undefined}
            style={i ? { borderTop: "1px solid var(--border)" } : undefined}>
            <div className="flex items-start gap-2">
              <LayoutGrid size={13} className="shrink-0 mt-px" aria-hidden style={{ color: "var(--text-3)" }} />
              <b className="shrink-0 font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{c || "—"}</b>
              <span className="flex-1 min-w-0 text-right tabular-nums" style={{ color: text ? "var(--text-2)" : "var(--text-4)" }}>{text || "—"}</span>
            </div>
            {who && (
              <div className="mt-0.5 pl-[21px] leading-snug break-words" style={{ color: "var(--text-2)" }}>{who}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// «9123: 120 to'rtburchak; 7331: …» in one line — a tooltip.
export const cellsText = (t, cells) => Object.entries(cells ?? {})
  .filter(([, n]) => countsText(t, n))
  .map(([c, n]) => `${c}: ${countsText(t, n)}`).join("; ");

// The same counts as pills — on a card, where there is room to read them.
export function CountPills({ counts, t, of }) {
  const keys = ALL_KEYS.filter((k) => counts?.[k] != null && (counts[k] || of?.[k]));
  return (
    <span className="flex flex-wrap gap-1.5">
      {keys.map((k) => {
        const short = of && (counts[k] ?? 0) < (of[k] ?? 0);
        return (
          <span key={k} className="inline-flex items-baseline gap-1 rounded-lg px-2 py-1 text-xs whitespace-nowrap"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
            <b className="tabular-nums text-[13px]" style={{ color: short ? "var(--status-bad)" : "var(--text-1)" }}>
              {fmt(counts[k])}{of ? <span style={{ color: "var(--text-3)", fontWeight: 500 }}> / {fmt(of[k])}</span> : null}
            </b>
            <TypeName t={t} k={k} />
          </span>
        );
      })}
    </span>
  );
}


// ── colours a chart reuses (one fixed hue per identity, on every chart) ─────
// The three stages of a request's containers: asked → split → received.
export const STAGE_COLORS = { asked: "#3b82f6", given: "#a855f7", received: "#22c55e" };
// A container type wears its own colour wherever a chart splits by type.
export const TYPE_COLORS = {
  yellow: "#eab308", round: "#f97316", grey: "#94a3b8", bucket: "#3b82f6", box: "#14b8a6",
  send: "#a855f7", lid: "#ec4899",
};

// The on-time band for a WHOLE percent (58, not 0.58 — `statusBands` judges
// fractions): "ok" | "warn" | "bad" | null.
export const onTimeTone = (pct) => (pct == null ? null : ontimeTone(pct / 100));

// ── keeping the page's parts in step (2026-11-15) ────────────────────────────
// The app keeps every answer a minute, and across reloads (App.jsx's
// QueryClient: staleTime 60 s + a persister). A request deleted on «So'rovlar»
// stayed on «Qabul» from that copy — on the deleter's screen and on the
// brigadir's phone. So: every write on this page re-reads EVERY «cflow-» query
// (`refreshFlow`), and the two lists people act on — «So'rovlar» and «Qabul» —
// are re-read whenever they are opened or the app comes back to the front
// (`LIVE_LIST`), the kept copy shown only for the moment the new one takes.
export const refreshFlow = (qc) =>
  qc.invalidateQueries({ predicate: (q) => String(q.queryKey?.[0] ?? "").startsWith("cflow-") });
export const LIVE_LIST = { staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: "always" };

// ── a brigadir's EXTRA request (2026-11-18, components in FlowExtras.jsx) ────
export const EXTRA_REASONS = ["plan", "damaged", "short", "other"];
export const reasonText = (t, e) => [t(`cflow.ex.reason.${e.reason}`), e.comment].filter(Boolean).join(" — ");
export const extraWaiting = (data) => (data?.extras ?? []).filter((e) => e.stage === "asked").length;

// The day's asks, one read for every part of the page that shows them.
export function useExtras(day, enabled = true) {
  return useQuery({
    queryKey: ["cflow-extras", day],
    queryFn: () => api.get("/api/container-flow/extras", { params: { day } }).then((r) => r.data),
    refetchInterval: 60_000,
    enabled,
    ...LIVE_LIST,
  });
}

// The production day opens at 08:00: 00:00–07:59 still belongs to the day
// that started the evening before (the server's `DAY_START_HOUR`).
export const DAY_START_MIN = 8 * 60;
export const liveDay = (now) => (now.min < DAY_START_MIN ? prevISO(now.iso) : now.iso);
// the production day running now — what a page opens on, never the calendar
// date (2026-11-20: «Hisobot» opened on an empty 20th at 00:09 while the
// night's requests sat on the 19th)
export const prodToday = () => liveDay(tashkentNow());

// The hour a production day is at now: 0–23 today, 24+ for the night past
// midnight (the day started yesterday), 48 for a day already over.
export function hourNow(day) {
  const n = tashkentNow();
  const h = Math.floor(n.min / 60);
  if (day === n.iso) return h;
  if (day === prevISO(n.iso)) return 24 + h;
  return day > n.iso ? 0 : 48;
}
export const canAskFor = (day) => hourNow(day) <= 31;
// «Yangi so'rov» opens on the production day's NEXT hour (2026-11-20: after
// midnight it took the calendar hour — 01:00 of a day already over), kept
// inside the day's 08:00 → 07:00 (+1).
export const defaultHour = (day) => Math.min(31, Math.max(DAY_START_MIN / 60, hourNow(day) + 1));

// THE grid a dialog's count fields sit in (2026-11-20): never a cell narrower
// than one CountStepper (38 + 8 + 80 + 8 + 38 = 172px), so a phone gets one
// column instead of two cut numbers («1221» read «12» in the split dialog).
// `COUNT_GRID` keeps empty tracks, so the columns of two groups line up;
// `COUNT_PAIR` lets two counts share the row.
export const COUNT_GRID = "grid grid-cols-[repeat(auto-fill,minmax(min(172px,100%),1fr))]";
export const COUNT_PAIR = "grid grid-cols-[repeat(auto-fit,minmax(min(172px,100%),1fr))]";

// ── whom AXO sends a request to (2026-11-18, the operator: «AXO should send
// one request and this request should go to both, and one of them should
// approve it») ────────────────────────────────────────────────────────────────
// Every logistics person at once — whoever splits it first takes it (the
// server's `ALL_KEY`) — or one named person. The form starts on «everybody»
// unless this device last picked a person who is still listed.
export const ALL_KEY = "*";
export function useLogisticsPick(initial = null) {
  const people = useQuery({
    queryKey: ["cflow-logistics"],
    queryFn: () => api.get("/api/container-flow/logistics").then((r) => r.data.people),
  });
  const list = people.data ?? [];
  const [last, setLast] = usePersistentState("cflow_last_logistics_v2", ALL_KEY);
  const [who, setWho] = useState(initial);
  const remembered = last === ALL_KEY || list.some((p) => p.key === last) ? last : ALL_KEY;
  const to = list.length ? (who ?? remembered) : null;
  return { loading: people.isLoading, list, to, setWho, remember: () => setLast(to) };
}

export function LogisticsField({ t, pick }) {
  const { tl } = useTranslit();
  const { loading, list, to, setWho } = pick;
  return (
    <FormField label={t("cflow.req.to")} required
      hint={!loading && !list.length ? t("cflow.req.noLogistics")
        : to === ALL_KEY ? t("cflow.req.toAllHint") : undefined}>
      <StyledSelect value={to} onChange={setWho} placeholder={t("cflow.pick")} disabled={!list.length}
        options={[{ value: ALL_KEY, label: t("cflow.req.toAll") }, ...list.map((p) => ({ value: p.key, label: tl(p.name) }))]} />
    </FormField>
  );
}

// The addressee as words: a name, or «every logistics person» while nobody took it.
export const toName = (t, tl, r) => (r.logistics_key === ALL_KEY ? t("cflow.req.toAll") : tl(r.logistics_name) || "—");

// ── «Jo'natish jadvali» — the dispatch areas (2026-11-19) ───────────────────
// The schedule, one read for the form, «Sozlamalar» and the table names.
export function useSendAreas(enabled = true) {
  return useQuery({
    queryKey: ["cflow-send-areas"],
    queryFn: () => api.get("/api/container-flow/send-areas").then((r) => r.data),
    staleTime: 60_000,
    enabled,
  });
}
export const shiftName = (t, s) => (s ? t(`cflow.sa.shift.${s}`) : "—");
