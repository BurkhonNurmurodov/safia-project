import { Undo2 } from "lucide-react";
import Button from "../../ui/Button";
import { useLang } from "../../../context/LangContext";
import { useTranslit } from "../../../utils/transliterate";
import {
  CAT_ICON, OUTCOME, RED, SRC_ICON, fmtDay, labelOf, num, targetText, timeAgo, tpl,
} from "./taxonomy";

/**
 * One event, read in full — the body of the side panel (`LogPanel.jsx`) and of
 * the phone sheet. It used to be the row's in-place expansion; the panel moved
 * it out of the table on 2026-11-03 so that opening an event never moves the
 * rows the reader is scanning.
 */

// ── chips ────────────────────────────────────────────────────────────────────

export function OutcomeChip({ v, t }) {
  const m = OUTCOME[v];
  if (!m) return <span style={{ color: "var(--text-4)" }}>—</span>;
  const { Icon, color } = m;
  return (
    <span
      title={labelOf(t, "logs.outHint.", v)}
      className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap"
      style={{ background: `${color}1f`, color, border: `1px solid ${color}55` }}
    >
      <Icon size={11} />
      {labelOf(t, "logs.out.", v)}
    </span>
  );
}

export function SourceChip({ v, t }) {
  const Icon = SRC_ICON[v];
  if (!Icon) return null;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" style={{ color: "var(--text-2)" }}>
      <Icon size={11} style={{ color: "var(--text-4)", flexShrink: 0 }} />
      {labelOf(t, "logs.src.", v)}
    </span>
  );
}

export function CategoryChip({ v, t }) {
  const Icon = CAT_ICON[v];
  const danger = v === "danger";
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap"
      style={{ color: danger ? RED : "var(--text-2)" }}
    >
      {Icon && <Icon size={11} style={{ color: danger ? RED : "var(--text-4)", flexShrink: 0 }} />}
      {labelOf(t, "logs.cat.", v)}
    </span>
  );
}

// ── the detail body ──────────────────────────────────────────────────────────

function Kv({ label, children }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-4)" }}>{label}</div>
      <div className="text-xs break-words" style={{ color: "var(--text-1)" }}>{children}</div>
    </div>
  );
}

/**
 * The panel's action bar — the one place on this tab that WRITES.
 *
 * It renders on every row, in one of three states, and that is the point: an
 * undo control that only appeared when it worked would leave the reader of a
 * profile-deletion guessing whether the platform forgot the button or the
 * action genuinely cannot be reversed. So the bar always says which, in words —
 * `undo.ok` offers it, `undo.why` explains the refusal, and a row already taken
 * back says by whom and when instead of offering it a second time.
 *
 * The verdict is the SERVER's (`services/action_undo.py`). Deriving "is this
 * undoable" in the browser would be a second definition of the rule, and the
 * one that is wrong is always the one the operator is looking at.
 */
function UndoBar({ r, onUndo, busy }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const u = r.undo;
  if (!u) return null;

  if (r.undone) {
    return (
      <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>
        <Undo2 size={12} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
        <span className="min-w-0">
          {tpl(t("logs.undo.doneBy"), {
            who: tl(r.undone.actor) || "—",
            ago: timeAgo(r.undone.at, t),
          })}
        </span>
      </div>
    );
  }

  if (!u.ok) {
    return (
      <div className="flex items-start gap-1.5 text-[11px]" style={{ color: "var(--text-4)" }}>
        <Undo2 size={12} className="flex-shrink-0 mt-px" />
        <span className="min-w-0">{labelOf(t, "logs.undo.why.", u.why)}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <span className="text-[11px] min-w-0" style={{ color: "var(--text-3)" }}>
        {tpl(t("logs.undo.will"), { action: labelOf(t, "logs.act.", u.action) })}
      </span>
      <Button
        size="md" variant="primary" tint loading={busy}
        icon={!busy ? <Undo2 size={13} /> : null}
        onClick={(e) => { e.stopPropagation(); onUndo?.(r); }}
      >
        {t("logs.undo.do")}
      </Button>
    </div>
  );
}

/**
 * `narrow` — the 440px panel: the facts grid keeps two columns instead of
 * opening up to four at `md`, which is a viewport breakpoint and says nothing
 * about the width of the panel the grid actually sits in.
 */
export default function LogDetail({ r, onUndo, busy = false, narrow = false }) {
  const { t } = useLang();
  const { tl, tx } = useTranslit();

  // The identification block always leads with the row's own anchors, then the
  // handler's own lines. A category whose columns already show one of these
  // still repeats it here: the panel has to be readable on its own.
  const facts = [
    r.target ? [t("logs.det.target"), `${targetText(r, { tl, tx })}${r.target_kind ? ` · ${labelOf(t, "logs.f.", r.target_kind)}` : ""}`] : null,
    r.unit ? [labelOf(t, "logs.col.", "unit"), tl(r.unit)] : null,
    r.day ? [labelOf(t, "logs.col.", "day"), fmtDay(r.day)] : null,
    ...(r.details || [])
      .filter((d) => d.v !== null && d.v !== undefined && d.v !== "")
      .map((d) => [labelOf(t, "logs.f.", d.k), String(d.v)]),
  ].filter(Boolean);

  const tech = [
    r.method && `${r.method} ${r.path || ""}`.trim(),
    r.status != null && `${t("logs.det.status")} ${r.status}`,
    r.ms != null && `${num(r.ms)} ${t("logs.det.ms")}`,
    r.ip && `IP ${r.ip}`,
    r.version && `v${r.version}`,
    r.telegram_id && `TG ${r.telegram_id}`,
    r.id != null && `#${r.id}`,
  ].filter(Boolean);

  return (
    <div className="px-3 py-3 space-y-3 whitespace-normal" style={{ background: "var(--bg-inner)" }}>
      {facts.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-4)" }}>
            {t("logs.det.details")}
          </p>
          <div className={`grid gap-x-4 gap-y-2 ${narrow ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4"}`}>
            {facts.map(([k, v], i) => <Kv key={`${k}-${i}`} label={k}>{v}</Kv>)}
          </div>
        </div>
      )}

      {(r.changes || []).length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-4)" }}>
            {t("logs.det.changes")}
          </p>
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <table className="w-full text-xs" style={{ background: "var(--bg-card)" }}>
              <thead>
                <tr style={{ background: "var(--bg-inner)" }}>
                  <th className="text-left font-semibold px-2.5 py-1.5 w-1/4" style={{ color: "var(--text-4)" }}>{t("logs.det.field")}</th>
                  <th className="text-left font-semibold px-2.5 py-1.5" style={{ color: "var(--text-4)" }}>{t("logs.det.old")}</th>
                  <th className="text-left font-semibold px-2.5 py-1.5" style={{ color: "var(--text-4)" }}>{t("logs.det.new")}</th>
                </tr>
              </thead>
              <tbody>
                {r.changes.map((c, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-2.5 py-1.5 align-top" style={{ color: "var(--text-3)" }}>{labelOf(t, "logs.f.", c.f)}</td>
                    <td className="px-2.5 py-1.5 align-top break-words" style={{ color: "var(--text-4)" }}>
                      {c.old === null || c.old === undefined || c.old === "" ? "—" : String(c.old)}
                    </td>
                    <td className="px-2.5 py-1.5 align-top break-words font-medium" style={{ color: "var(--text-1)" }}>
                      {c.new === null || c.new === undefined || c.new === "" ? "—" : String(c.new)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {r.reason && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-4)" }}>
            {t("logs.det.reason")}
          </p>
          <p
            className="text-xs leading-relaxed rounded-xl px-3 py-2 break-words"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-2)" }}
          >
            {r.reason}
          </p>
        </div>
      )}

      {/* Last of the human-readable half, and the only control on this tab: what
          can still be done ABOUT this row, after everything it says has been
          read. Above the request line, which is machine detail. */}
      {onUndo && r.undo && (
        <div className="pt-0.5" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="pt-2.5">
            <UndoBar r={r} onUndo={onUndo} busy={busy} />
          </div>
        </div>
      )}

      {/* Technical, and therefore muted and last: the request line answers "was
          this the app or somebody with a token", which is a question you only
          ask after the human-readable half has failed to explain something. */}
      {tech.length > 0 && (
        <p className="text-[10px] font-mono leading-relaxed break-all" style={{ color: "var(--text-4)" }}>
          {tech.join("  ·  ")}
        </p>
      )}
    </div>
  );
}
