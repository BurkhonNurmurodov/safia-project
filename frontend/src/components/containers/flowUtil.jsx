// «Konteyner berish» — the pieces every tab of the page shares
// (pages/ContainerFlow.jsx, docs/containers-flow.md).
import { useEffect, useState } from "react";
import { AlertTriangle, Clock } from "lucide-react";
import FormField from "../ui/FormField";
import StyledSelect from "../ui/StyledSelect";
import GroupBadge from "../ui/GroupBadge";
import { hourLabel } from "../production/HourlyContainers";
import { ontimeTone } from "../../utils/statusBands";

export const KEYS = ["yellow", "round", "grey", "bucket", "box"];
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

// What a batch waits on — one chip, traffic-light: grey not started, yellow on
// its way, red a dispute or a missed deadline, green closed.
export function StatusChip({ b, t }) {
  if (b.overdue) return <Chip tone="bad" icon={AlertTriangle}>{t("cflow.st.overdue")}</Chip>;
  const tone = { requested: "idle", issued: "warn", delivered: "warn", disputed: "bad", closed: "ok" }[b.status] ?? "idle";
  return <Chip tone={tone}>{t(`cflow.st.${b.status}`)}</Chip>;
}

export function KindChip({ kind, t }) {
  if (kind === "regular") return null;
  return <Chip tone="idle" title={t(`cflow.kindHint.${kind}`)}>{t(`cflow.kind.${kind}`)}</Chip>;
}

// A team as it is named everywhere: the work centre's code, its group letter,
// «harfsiz» for a grouped centre's unlettered lines.
export function TeamLabel({ team, t }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0 whitespace-nowrap">
      <span className="font-mono text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>{team.work_center}</span>
      <GroupBadge group={team.group} />
      {team.rest && <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{t("cflow.rest")}</span>}
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

// Batches of one hour together, hours in order.
export function byHour(batches) {
  const m = new Map();
  for (const b of batches) {
    if (!m.has(b.hour)) m.set(b.hour, []);
    m.get(b.hour).push(b);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

export const lineOf = (b, k) => b.lines.find((ln) => ln.ctype === k) ?? null;


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

// «30 to'rtburchak, 8 chelak» — a set of counts as words.
export const countsText = (t, counts) => KEYS.filter((k) => counts?.[k])
  .map((k) => `${counts[k]} ${t(`cflow.ct.${k}`).toLowerCase()}`).join(", ");

// The same counts as pills — on a card, where there is room to read them.
export function CountPills({ counts, t, of }) {
  const keys = KEYS.filter((k) => counts?.[k] != null && (counts[k] || of?.[k]));
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
            {t(`cflow.ct.${k}`)}
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
export const TYPE_COLORS = { yellow: "#eab308", round: "#f97316", grey: "#94a3b8", bucket: "#3b82f6", box: "#14b8a6" };

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
