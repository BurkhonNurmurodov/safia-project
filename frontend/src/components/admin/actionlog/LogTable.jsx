import { Fragment, useState } from "react";
import { ArrowRight, ChevronRight, EyeOff, KeyRound } from "lucide-react";
import TableCard, { Th } from "../../ui/DataTable";
import { SkeletonBlock } from "../../ui/Skeleton";
import { useLang } from "../../../context/LangContext";
import { useTranslit } from "../../../utils/transliterate";
import {
  AMBER, CAT_ICON, OUTCOME, RED, SRC_ICON,
  detail, firstOf, fmtDay, fmtDayShort, labelOf, num, roleLabel, tpl,
} from "./taxonomy";

/**
 * The register's table.
 *
 * **The columns follow the CATEGORY.** One generic table over fourteen kinds of
 * event is a table of mostly-empty cells: «Target» holds a document name on one
 * row, a task number on the next and nothing at all on the third, and the
 * reader has to open every row to find out which. So «All» keeps the generic
 * set and each category replaces the middle of it with the fields that category
 * actually carries — the same seven-ish columns, saying something every time.
 *
 * One `COLUMNS` map and one per-key `cell()` switch: adding a column later is
 * one entry and one `case`, not a new table.
 *
 * A row EXPANDS IN PLACE rather than opening a modal. The reader is scanning a
 * sequence — who did what, then what happened next — and a modal throws that
 * sequence away every time a question is asked of one line of it.
 */

const BASE = ["time", "who", "category", "action", "target", "outcome", "source"];

export const COLUMNS = {
  "":              BASE,
  attendance:      ["time", "who", "action", "unit", "day", "change", "outcome"],
  documents:       ["time", "who", "action", "document", "worker", "unit", "outcome"],
  identity:        ["time", "who", "action", "profile", "role", "change", "outcome"],
  sessions:        ["time", "who", "action", "login", "source", "outcome"],
  org:             ["time", "who", "action", "object", "change", "outcome"],
  leader_config:   ["time", "who", "action", "task", "level", "change", "outcome"],
  leader_review:   ["time", "who", "action", "leader", "day", "verdict", "outcome"],
  shopfloor:       ["time", "who", "action", "object", "day", "change", "outcome"],
  collab:          ["time", "who", "action", "item", "outcome"],
  comms:           ["time", "who", "action", "audience", "sent", "outcome"],
  sync_export:     ["time", "who", "action", "rows", "outcome"],
  config:          ["time", "who", "action", "setting", "change", "outcome"],
  danger:          ["time", "who", "action", "scope", "reason", "outcome"],
  other:           [...BASE, "request"],
};

export const colsFor = (category) => COLUMNS[category] || BASE;

// Columns the phone card renders in its own header instead of as a labelled
// line — they are the card's identity, not one of its facts.
const CARD_HEAD = new Set(["time", "who", "action", "outcome"]);

// ── small parts ──────────────────────────────────────────────────────────────

const val = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
};

function Mark({ text, title }) {
  return (
    <span
      title={title}
      className="text-[9px] font-semibold uppercase tracking-wide px-1 py-px rounded flex-shrink-0"
      style={{ background: "var(--bg-inner)", color: "var(--text-4)", border: "1px solid var(--border)" }}
    >
      {text}
    </span>
  );
}

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

function SourceChip({ v, t }) {
  const Icon = SRC_ICON[v];
  if (!Icon) return null;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" style={{ color: "var(--text-2)" }}>
      <Icon size={11} style={{ color: "var(--text-4)", flexShrink: 0 }} />
      {labelOf(t, "logs.src.", v)}
    </span>
  );
}

function CategoryChip({ v, t }) {
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

/** `field: old → new`, plus «+N» when the row changed more than one thing. */
function ChangeCell({ r, t }) {
  const cs = r.changes || [];
  if (!cs.length) return null;
  const c = cs[0];
  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      <span className="flex-shrink-0" style={{ color: "var(--text-4)" }}>{labelOf(t, "logs.f.", c.f)}:</span>
      <span className="truncate max-w-[90px]" style={{ color: "var(--text-4)", textDecoration: "line-through" }}>
        {val(c.old) ?? "—"}
      </span>
      <ArrowRight size={10} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
      <span className="truncate max-w-[110px]" style={{ color: "var(--text-1)" }}>{val(c.new) ?? "—"}</span>
      {cs.length > 1 && <Mark text={`+${cs.length - 1}`} title={tpl(t("logs.more"), { n: cs.length - 1 })} />}
    </span>
  );
}

function WhoCell({ r, t, tl }) {
  return (
    <span className="inline-block min-w-0 align-middle">
      <span className="flex items-center gap-1 min-w-0">
        <span className="truncate max-w-[150px] font-medium" style={{ color: "var(--text-1)" }}>
          {tl(r.actor) || r.actor_key || "—"}
        </span>
        {r.via_capability && (
          <span title={tpl(t("logs.viaCapability"), { cap: r.via_capability })} className="flex-shrink-0 inline-flex">
            <KeyRound size={10} style={{ color: AMBER }} />
          </span>
        )}
      </span>
      {r.actor_role && (
        <span className="block text-[10px] truncate max-w-[150px]" style={{ color: "var(--text-4)" }}>
          {roleLabel(t, r.actor_role)}
        </span>
      )}
    </span>
  );
}

function TimeCell({ r, open, multiDay, t }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ChevronRight
        size={12}
        className="flex-shrink-0 transition-transform"
        style={{ color: "var(--text-4)", transform: open ? "rotate(90deg)" : "none" }}
      />
      <span className="tabular-nums" style={{ color: "var(--text-1)" }}>{r.time || "—"}</span>
      {multiDay && (
        <span className="tabular-nums text-[10px]" style={{ color: "var(--text-4)" }}>{fmtDayShort(r.date)}</span>
      )}
      {/* A thin automatic row must never be read as a rich one. */}
      {!r.enriched && <Mark text={t("logs.auto")} title={t("logs.autoHint")} />}
      {r.ghost && (
        <span title={t("logs.ghostHint")} className="inline-flex flex-shrink-0" aria-label={t("logs.ghost")}>
          <EyeOff size={11} style={{ color: "var(--text-4)" }} />
        </span>
      )}
    </span>
  );
}

function Plain({ children, w = "200px", tone = "var(--text-2)" }) {
  return (
    <span className="block truncate" style={{ maxWidth: w, color: tone }}>{children}</span>
  );
}

// ── the one cell switch ──────────────────────────────────────────────────────
// Returns a node, or null when this row has nothing for the column (the caller
// renders the em dash, so "empty" looks the same everywhere).

function cell(key, r, ctx) {
  const { t, tl, multiDay, open } = ctx;
  switch (key) {
    case "time":     return <TimeCell r={r} open={open} multiDay={multiDay} t={t} />;
    case "who":      return <WhoCell r={r} t={t} tl={tl} />;
    case "category": return <CategoryChip v={r.category} t={t} />;
    case "action":   return <Plain w="260px" tone="var(--text-1)">{labelOf(t, "logs.act.", r.action)}</Plain>;
    case "outcome":  return <OutcomeChip v={r.outcome} t={t} />;
    case "source":   return <SourceChip v={r.source} t={t} />;
    case "unit":     return val(tl(r.unit)) && <Plain w="160px">{tl(r.unit)}</Plain>;
    case "day":      return r.day ? <span className="tabular-nums" style={{ color: "var(--text-2)" }}>{fmtDay(r.day)}</span> : null;
    case "change":   return <ChangeCell r={r} t={t} />;
    case "target":   return val(tl(r.target)) && <Plain w="200px">{tl(r.target)}</Plain>;

    case "document": {
      const v = firstOf(tl(r.target), labelOf(t, "logs.f.", detail(r, ["doc_type"])));
      return v && <Plain w="180px">{v}</Plain>;
    }
    case "worker": {
      const v = firstOf(detail(r, ["worker", "workers"]));
      return v && <Plain w="160px">{tl(String(v))}</Plain>;
    }
    case "profile": {
      const v = firstOf(tl(r.target), detail(r, ["user", "profile"]));
      return v && <Plain w="180px">{v}</Plain>;
    }
    case "role": {
      const v = detail(r, ["role", "scope", "page"]);
      return v && <Plain w="140px">{roleLabel(t, v)}</Plain>;
    }
    case "login": {
      const v = firstOf(detail(r, ["user", "login", "username"]), tl(r.target));
      return v && <Plain w="180px">{v}</Plain>;
    }
    case "object": {
      const v = firstOf(tl(r.target), tl(r.unit), detail(r, ["unit", "cell", "name"]));
      return v && <Plain w="200px">{v}</Plain>;
    }
    case "task": {
      const v = firstOf(tl(r.target), detail(r, ["task", "task_id"]));
      return v && <Plain w="180px">{v}</Plain>;
    }
    case "level": {
      const v = firstOf(detail(r, ["level"]), tl(r.unit));
      return v && <Plain w="130px">{labelOf(t, "logs.f.", v)}</Plain>;
    }
    case "leader": {
      const v = firstOf(detail(r, ["leader"]), tl(r.target));
      return v && <Plain w="170px">{tl(String(v))}</Plain>;
    }
    case "verdict": {
      const v = detail(r, ["verdict", "resolution", "status", "state"]);
      return v && <Plain w="140px">{labelOf(t, "logs.f.", v)}</Plain>;
    }
    case "item": {
      const v = firstOf(tl(r.target), detail(r, ["task", "concern", "text"]));
      return v && <Plain w="260px">{v}</Plain>;
    }
    case "audience": {
      const v = firstOf(detail(r, ["audience"]), tl(r.target));
      return v && <Plain w="220px">{v}</Plain>;
    }
    case "sent": {
      const v = detail(r, ["sent", "count", "total"]);
      return v == null ? null : (
        <span className="tabular-nums" style={{ color: "var(--text-1)" }}>{num(v)}</span>
      );
    }
    case "rows": {
      const v = detail(r, ["rows", "count", "total", "workers"]);
      return v == null ? null : (
        <span className="tabular-nums" style={{ color: "var(--text-1)" }}>{num(v)}</span>
      );
    }
    case "setting": {
      const v = firstOf(tl(r.target), detail(r, ["key", "setting", "id"]));
      return v && <Plain w="200px">{labelOf(t, "logs.f.", v)}</Plain>;
    }
    case "scope": {
      const v = firstOf(tl(r.unit), tl(r.target), detail(r, ["unit", "date", "state"]));
      return v && <Plain w="200px">{v}</Plain>;
    }
    case "reason":
      return r.reason ? <Plain w="240px" tone="var(--text-3)">{r.reason}</Plain> : null;
    case "request":
      return r.path ? (
        <span className="text-[10px] font-mono truncate block" style={{ maxWidth: 260, color: "var(--text-4)" }}>
          {r.method} {r.path}
        </span>
      ) : null;
    default:
      return null;
  }
}

// ── the expanded row ─────────────────────────────────────────────────────────

function Kv({ label, children }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-4)" }}>{label}</div>
      <div className="text-xs break-words" style={{ color: "var(--text-1)" }}>{children}</div>
    </div>
  );
}

export function LogDetail({ r }) {
  const { t } = useLang();
  const { tl } = useTranslit();

  // The identification block always leads with the row's own anchors, then the
  // handler's own lines. A category whose columns already show one of these
  // still repeats it here: the panel has to be readable on its own.
  const facts = [
    r.target ? [t("logs.det.target"), `${tl(r.target)}${r.target_kind ? ` · ${labelOf(t, "logs.f.", r.target_kind)}` : ""}`] : null,
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
    // `whitespace-normal` is load-bearing, not decoration: TableCard sets
    // `whitespace-nowrap` on the <table> element and white-space INHERITS, so
    // without this reset every `break-words` below is inert and a danger row's
    // reason renders as one endless line the reader has to scroll sideways
    // through. Reset here rather than passing `wrap` to TableCard, which would
    // relax the whole register to fix one panel.
    <div className="px-3 py-3 space-y-3 whitespace-normal" style={{ background: "var(--bg-inner)" }}>
      {facts.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-4)" }}>
            {t("logs.det.details")}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
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

// ── phone card ───────────────────────────────────────────────────────────────

function LogCard({ r, cols, open, onToggle, ctx }) {
  const { t, tl } = ctx;
  const lines = cols
    .filter((k) => !CARD_HEAD.has(k))
    .map((k) => [k, cell(k, r, { ...ctx, open })])
    .filter(([, node]) => node);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: r.category === "danger" ? "rgba(239,68,68,0.06)" : "var(--bg-card)",
        border: `1px solid ${r.category === "danger" ? "rgba(239,68,68,0.30)" : "var(--border)"}`,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full text-left px-3 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand)]"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs">{cell("time", r, { ...ctx, open })}</span>
          <OutcomeChip v={r.outcome} t={t} />
        </div>
        <div className="text-sm font-semibold mt-1 leading-snug" style={{ color: "var(--text-1)" }}>
          {labelOf(t, "logs.act.", r.action)}
        </div>
        <div className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-3)" }}>
          {tl(r.actor) || r.actor_key || "—"}
          {r.actor_role ? ` · ${roleLabel(t, r.actor_role)}` : ""}
        </div>
        {lines.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {lines.map(([k, node]) => (
              <div key={k} className="flex items-start gap-2 text-[11px]">
                <span className="flex-shrink-0" style={{ color: "var(--text-4)" }}>{labelOf(t, "logs.col.", k)}</span>
                <span className="min-w-0 flex-1">{node}</span>
              </div>
            ))}
          </div>
        )}
      </button>
      {open && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <LogDetail r={r} />
        </div>
      )}
    </div>
  );
}

// ── the table ────────────────────────────────────────────────────────────────

export default function LogTable({
  rows, category, loading, multiDay, empty, icon, title, subtitle, right,
}) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const [openId, setOpenId] = useState(null);
  const cols = colsFor(category);
  const ctx = { t, tl, multiDay };

  const toggle = (id) => setOpenId((cur) => (cur === id ? null : id));
  const onKey = (e, id) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      toggle(id);
    }
  };

  const body = () => {
    if (loading && !rows.length) {
      return Array.from({ length: 10 }).map((_, i) => (
        <tr key={`sk-${i}`}>
          {cols.map((c) => (
            <td key={c} className="px-3 py-2.5"><SkeletonBlock className="h-4 w-full" /></td>
          ))}
        </tr>
      ));
    }
    if (!rows.length) {
      return (
        <tr>
          <td colSpan={cols.length} className="px-3 py-6 whitespace-normal">{empty}</td>
        </tr>
      );
    }
    return rows.map((r) => {
      const open = openId === r.id;
      return (
        <Fragment key={r.id}>
          <tr
            tabIndex={0}
            role="button"
            aria-expanded={open}
            onClick={() => toggle(r.id)}
            onKeyDown={(e) => onKey(e, r.id)}
            className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand)]"
            // Danger rows carry their own tint. They lose the hover highlight in
            // exchange — an inline background outranks the card's hover class —
            // which is the right trade: a database restore should look different
            // at rest, not only under a pointer no phone has.
            style={r.category === "danger" ? { background: "rgba(239,68,68,0.06)" } : undefined}
          >
            {cols.map((c) => (
              <td key={c} className="px-3 py-2 align-middle">
                {cell(c, r, { ...ctx, open }) ?? <span style={{ color: "var(--text-4)" }}>—</span>}
              </td>
            ))}
          </tr>
          {open && (
            <tr>
              <td colSpan={cols.length} className="p-0">
                <LogDetail r={r} />
              </td>
            </tr>
          )}
        </Fragment>
      );
    });
  };

  const mobile = loading && !rows.length
    ? (
      <div className="p-3 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    )
    : !rows.length
      ? <div className="px-3 py-6">{empty}</div>
      // An ARRAY, not a wrapper: TableCard's `mobileCards` stacks these as
      // standalone cards that scroll with the page — a phone must not have to
      // scroll a list inside a list.
      : rows.map((r) => (
        <LogCard
          key={r.id}
          r={r}
          cols={cols}
          ctx={ctx}
          open={openId === r.id}
          onToggle={() => toggle(r.id)}
        />
      ));

  return (
    <TableCard
      icon={icon}
      title={title}
      subtitle={subtitle}
      right={right}
      minWidth={cols.length > 6 ? 980 : 820}
      mobile={mobile}
      mobileCards
    >
      <thead>
        <tr>
          {cols.map((c) => (
            <Th
              key={c}
              label={labelOf(t, "logs.col.", c)}
              hint={c === "time" ? t("logs.newestFirst") : undefined}
            />
          ))}
        </tr>
      </thead>
      <tbody>{body()}</tbody>
    </TableCard>
  );
}
