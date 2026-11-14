// «Konteyner berish» — the pieces every tab of the page shares
// (pages/ContainerFlow.jsx, docs/containers-flow.md).
import { AlertTriangle } from "lucide-react";
import FormField from "../ui/FormField";
import StyledSelect from "../ui/StyledSelect";
import GroupBadge from "../ui/GroupBadge";
import { hourLabel } from "../production/HourlyContainers";

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
