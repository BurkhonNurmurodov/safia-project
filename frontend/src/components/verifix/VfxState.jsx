import { useNavigate } from "react-router-dom";
import {
  PlugZap, ShieldOff, KeyRound, CloudOff, Hourglass, TriangleAlert, Lock, RefreshCw, CircleSlash,
} from "lucide-react";
import EmptyState from "../ui/EmptyState";
import Button from "../ui/Button";
import CellLink from "../ui/CellLink";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { fill, hm, dmy } from "./vfx";

/* The states every page of «Verifix (test)» shares: why Verifix answered
 * nothing (and the way out), a section the API role does not open, the chips
 * and the «as of» stamp. */

const ICONS = {
  not_configured: PlugZap, forbidden: ShieldOff, auth: KeyRound, missing: CircleSlash,
  network: CloudOff, slow: Hourglass, denied: Lock,
};

/** A whole page that could not be read. */
export function VfxError({ error, onRetry }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const code = error?.code || "error";
  const known = ["not_configured", "forbidden", "auth", "missing", "network", "slow", "denied"].includes(code);
  const key = known ? code : "error";
  const toCard = code === "not_configured" || code === "auth";
  return (
    <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <EmptyState
        icon={ICONS[code] || TriangleAlert}
        title={t(`vfx.err.${key}.title`)}
        message={[t(`vfx.err.${key}.msg`), !known && error?.message ? `«${error.message}»` : null].filter(Boolean).join(" ")}
        showUploadLink={false}
        height="h-64"
        action={toCard ? (
          <Button size="lg" variant="primary" onClick={() => navigate("/admin/upload?tab=verifix")}>
            {t("vfx.err.openCard")}
          </Button>
        ) : onRetry ? (
          <Button size="lg" variant="secondary" icon={<RefreshCw size={14} />} onClick={onRetry}>
            {t("vfx.retry")}
          </Button>
        ) : null}
      />
    </div>
  );
}

/** One section of a page the API role does not open — said where it would be. */
export function AccessNotice({ error, form, text: given }) {
  const { t } = useLang();
  if (!error && !given) return null;
  const closed = error?.code === "forbidden" || error?.code === "missing" || error?.code === "auth";
  const text = given || (closed
    ? fill(t(error.code === "missing" ? "vfx.access.missing" : "vfx.access.forbidden"), { form })
    : fill(t("vfx.access.error"), { msg: error.message || error.code }));
  return (
    <div className="rounded-xl px-3 py-2.5 flex items-start gap-2 text-xs"
      style={{ background: "var(--bg-inner)", border: "1px dashed var(--border-md)", color: "var(--text-2)" }}>
      <ShieldOff size={14} className="flex-shrink-0 mt-px" style={{ color: "var(--text-3)" }} />
      <span>{text}</span>
    </div>
  );
}

export function StatusDot({ color, label, title }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap" style={{ color: "var(--text-2)" }} title={title}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
      {label}
    </span>
  );
}

export function Chip({ color = "#94a3b8", children, title, mono = false }) {
  return (
    <span title={title}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${mono ? "font-mono" : ""}`}
      style={{ background: `${color}1f`, color, border: `1px solid ${color}55` }}>
      {children}
    </span>
  );
}

/** A Verifix node that is one of OUR cells: the code (pressable) and, under
 * it, who answers for it. A cell is its CODE — never the workshop name. */
export function CellChip({ cell, compact = false }) {
  const { tl } = useTranslit();
  if (!cell) return null;
  const who = [cell.sup && tl(cell.sup), !compact && cell.leader && tl(cell.leader)].filter(Boolean).join(" · ");
  return (
    <span className="inline-flex flex-col min-w-0">
      <CellLink id={cell.id} className="font-mono text-xs font-semibold" title={who || undefined}>{cell.code}</CellLink>
      {who && !compact && <span className="text-[11px] truncate max-w-[220px]" style={{ color: "var(--text-3)" }}>{who}</span>}
    </span>
  );
}

/** «Verifix · 14:32 holatiga» — when the shown data was read. */
export function FetchedAt({ at, today }) {
  const { t } = useLang();
  if (!at) return null;
  const sameDay = !today || at.slice(0, 10) === today;
  return (
    <span className="text-[11px] whitespace-nowrap tabular-nums" style={{ color: "var(--text-3)" }}>
      {fill(t("vfx.asOf"), { at: sameDay ? hm(at) : `${dmy(at)} ${hm(at)}` })}
    </span>
  );
}

/** The refresh control every page carries at the end of its toolbar. */
export function RefreshButton({ onClick, busy }) {
  const { t } = useLang();
  return (
    <Button size="lg" variant="secondary" loading={busy} icon={!busy ? <RefreshCw size={14} /> : null}
      onClick={onClick} title={t("vfx.refreshHint")}>
      <span className="hidden sm:inline">{t("vfx.refresh")}</span>
    </Button>
  );
}
