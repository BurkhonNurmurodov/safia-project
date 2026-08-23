import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ChevronDown, Layers, X } from "lucide-react";
import { useLang } from "../../../context/LangContext";
import { SkeletonBlock } from "../../ui/Skeleton";
import { CAT_ICON, DANGER_CAT, RED, labelOf, num } from "./taxonomy";

/**
 * The category rail — the register's primary axis.
 *
 * It is the admin panel's own navigation one level down, and it deliberately
 * looks like it: same brand-gold selected row, same grouped sheet on a phone.
 * Two rules it is built on.
 *
 * **A category with nothing in this window is DIMMED, never hidden.** A row that
 * disappears reads as "this cannot happen here", which is false — it means
 * nobody did it today. Dimming says the true thing and keeps the list's shape
 * constant, so the eye learns where «Sessions» sits and finds it there
 * tomorrow.
 *
 * **The counts come from the summary, which computes them WITHOUT the category
 * filter.** Selecting one category must not zero the other thirteen: the whole
 * point of the rail is telling the reader where the rest of the activity is.
 */

function RailRow({ Icon, label, count, hint, active, dim, danger, onClick, sub }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      aria-current={active ? "true" : undefined}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors"
      style={{
        background: active ? "var(--brand-bg)" : "transparent",
        border: `1px solid ${active ? "var(--brand-border)" : "transparent"}`,
        color: active ? "var(--brand-text)" : "var(--text-2)",
        fontWeight: active ? 600 : 500,
        // Dimmed, not hidden — and never dimmed while selected, or the reader's
        // own choice would look disabled.
        opacity: dim && !active ? 0.45 : 1,
      }}
    >
      <span
        className="grid place-items-center w-6 h-6 rounded-md flex-shrink-0"
        style={{
          background: active ? "var(--bg-card)" : danger ? "rgba(239,68,68,0.12)" : "var(--bg-inner)",
          border: danger && !active ? "1px solid rgba(239,68,68,0.30)" : "1px solid transparent",
        }}
      >
        <Icon size={13} style={{ color: active ? "var(--brand-text)" : danger ? RED : "var(--text-3)" }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs truncate">{label}</span>
        {sub && (
          <span className="block text-[10px] leading-tight truncate mt-0.5" style={{ color: "var(--text-4)" }}>
            {sub}
          </span>
        )}
      </span>
      <span
        className="text-[11px] tabular-nums flex-shrink-0 text-right"
        style={{ color: active ? "var(--brand-text)" : "var(--text-4)" }}
      >
        {num(count)}
      </span>
    </button>
  );
}

function GroupCaption({ label, danger }) {
  return (
    <div
      className="flex items-center gap-1.5 px-2 mt-3 mb-1 text-[10px] font-semibold uppercase tracking-wider"
      style={{ color: danger ? RED : "var(--text-4)" }}
    >
      {danger && <AlertTriangle size={10} />}
      {label}
    </div>
  );
}

/** The rows, shared by the desktop rail and the phone sheet. */
function RailBody({ cats, total, value, onPick, t, withHints }) {
  const normal = cats.filter((c) => c.key !== DANGER_CAT);
  const danger = cats.filter((c) => c.key === DANGER_CAT);
  const row = (c) => {
    const Icon = CAT_ICON[c.key] || Layers;
    return (
      <RailRow
        key={c.key}
        Icon={Icon}
        label={labelOf(t, "logs.cat.", c.key)}
        sub={withHints ? labelOf(t, "logs.catHint.", c.key) : null}
        hint={labelOf(t, "logs.catHint.", c.key)}
        count={c.count}
        dim={!c.count}
        danger={c.key === DANGER_CAT}
        active={value === c.key}
        onClick={() => onPick(c.key)}
      />
    );
  };
  return (
    <div className="space-y-0.5">
      <RailRow
        Icon={Layers}
        label={t("logs.all")}
        sub={withHints ? t("logs.allHint") : null}
        hint={t("logs.allHint")}
        count={total}
        active={!value}
        onClick={() => onPick("")}
      />
      <GroupCaption label={t("logs.group.sections")} />
      {normal.map(row)}
      {danger.length > 0 && (
        <>
          <GroupCaption label={t("admin.group.danger")} danger />
          {danger.map(row)}
        </>
      )}
    </div>
  );
}

/** Phone sheet — the admin panel's NavSheet shape, portaled past `.page-enter`. */
function RailSheet({ cats, total, value, onPick, onClose, t }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.6)", zIndex: 90 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("logs.rail")}
    >
      <div
        className="modal-card w-full max-w-lg rounded-t-2xl flex flex-col"
        style={{
          background: "var(--bg-card)",
          borderTop: "1px solid var(--border-md)",
          maxHeight: "80vh",
          paddingBottom: "calc(var(--tg-safe-bottom, 0px) + 0.5rem)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{t("logs.rail")}</span>
          <button type="button" onClick={onClose} aria-label={t("common.cancel")} className="p-2 rounded-lg" style={{ color: "var(--text-3)" }}>
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto px-3 py-3">
          <RailBody cats={cats} total={total} value={value} onPick={onPick} t={t} withHints />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function CategoryRail({ cats, total, value, loading, onChange, sheetOpen, onSheet }) {
  const { t } = useLang();
  const current = cats.find((c) => c.key === value);
  const Icon = current ? (CAT_ICON[current.key] || Layers) : Layers;
  const pick = (key) => { onChange(key); onSheet(false); };

  return (
    <>
      {/* lg+: the sticky rail. Fixed width so the table beside it never reflows
          when a count grows a digit. */}
      <nav
        className="hidden lg:block w-[200px] flex-shrink-0 sticky top-0 rounded-2xl p-2"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        aria-label={t("logs.rail")}
      >
        {loading && !cats.length ? (
          <div className="space-y-1.5 p-1">
            {Array.from({ length: 10 }).map((_, i) => <SkeletonBlock key={i} className="h-7 w-full rounded-lg" />)}
          </div>
        ) : (
          <RailBody cats={cats} total={total} value={value} onPick={pick} t={t} />
        )}
      </nav>

      {/* Below lg: one 38px control naming the current section — never a pill
          strip. At 390px three of fifteen fit and the selected one is usually
          off-screen, at which point nothing looks selected. */}
      <button
        type="button"
        onClick={() => onSheet(true)}
        aria-haspopup="dialog"
        aria-expanded={sheetOpen}
        className="lg:hidden w-full flex items-center gap-2 px-3 py-2 rounded-xl mb-3"
        style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)" }}
      >
        <Icon size={15} className="flex-shrink-0" style={{ color: current?.key === "danger" ? RED : "var(--brand-text)" }} />
        <span className="flex-1 min-w-0 text-left text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>
          {current ? labelOf(t, "logs.cat.", current.key) : t("logs.all")}
        </span>
        <span className="text-xs tabular-nums flex-shrink-0" style={{ color: "var(--text-4)" }}>
          {num(current ? current.count : total)}
        </span>
        <ChevronDown size={15} className="flex-shrink-0" style={{ color: "var(--text-3)" }} />
      </button>

      {sheetOpen && (
        <RailSheet cats={cats} total={total} value={value} onPick={pick} onClose={() => onSheet(false)} t={t} />
      )}
    </>
  );
}
