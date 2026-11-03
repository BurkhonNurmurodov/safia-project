import { useEffect, useRef } from "react";
import { ArrowRight, CheckCircle2, EyeOff, KeyRound } from "lucide-react";
import TableCard, { Th } from "../../ui/DataTable";
import { SkeletonBlock } from "../../ui/Skeleton";
import { useLang } from "../../../context/LangContext";
import { useTranslit } from "../../../utils/transliterate";
import {
  AMBER, GREEN, detail, firstOf, fmtDay, fmtDayShort, labelOf, num, roleLabel, targetText, tpl,
} from "./taxonomy";
import { CategoryChip, OutcomeChip, SourceChip } from "./LogDetail";

/**
 * The register's table.
 *
 * **The columns follow the CATEGORY.** One generic table over fourteen kinds of
 * event is a table of mostly-empty cells: «Target» holds a document name on one
 * row, a task number on the next and nothing at all on the third, and the
 * reader has to open every row to find out which. So the generic set (no
 * category, or several) keeps the row's anchors and each single category
 * replaces the middle of it with the fields that category actually carries —
 * the same seven-ish columns, saying something every time.
 *
 * One `COLUMNS` map and one per-key `cell()` switch: adding a column later is
 * one entry and one `case`, not a new table.
 *
 * **Every row is ONE line** (2026-11-03). The name and the role used to stack,
 * which made a 52px row and eight of them per screen; the role is a column of
 * its own in the generic view and a suffix on the name inside a category's own
 * columns. A row no longer expands in place — it opens the side panel
 * (`LogPanel.jsx`), so the rows the reader is scanning never move.
 */

const BASE = ["time", "who", "actorRole", "action", "target", "category", "outcome"];

const COLUMNS = {
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
  other:           [...BASE, "source", "request"],
};

const colsFor = (category) => COLUMNS[category] || BASE;

// A column key whose dictionary entry is spelled differently: the actor's role
// column reads «Rol» like the identity view's role column does.
const COL_LABEL = { actorRole: "role" };
const colLabel = (t, k) => labelOf(t, "logs.col.", COL_LABEL[k] || k);

// Columns the phone card renders in its own header instead of as a labelled
// line — they are the card's identity, not one of its facts.
const CARD_HEAD = new Set(["time", "who", "actorRole", "action", "outcome"]);

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

// One line. `withRole`: the role rides on the name («Aripova · Brigadir») where
// the column set has no role column of its own.
function WhoCell({ r, t, tl, withRole }) {
  const name = tl(r.actor) || r.actor_key || "—";
  const role = withRole && r.actor_role ? roleLabel(t, r.actor_role) : "";
  return (
    <span className="inline-flex items-center gap-1 min-w-0 max-w-[260px]" title={role ? `${name} · ${role}` : name}>
      <span className="truncate font-medium" style={{ color: "var(--text-1)" }}>{name}</span>
      {role && <span className="truncate flex-shrink" style={{ color: "var(--text-4)", maxWidth: 110 }}>· {role}</span>}
      {r.via_capability && (
        <span title={tpl(t("logs.viaCapability"), { cap: r.via_capability })} className="flex-shrink-0 inline-flex">
          <KeyRound size={10} style={{ color: AMBER }} />
        </span>
      )}
    </span>
  );
}

function TimeCell({ r, multiDay, t }) {
  return (
    <span className="inline-flex items-center gap-1.5">
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

// «done» is the row's normal state and the table is mostly made of it, so it
// is a quiet mark: the word and the shape, without the chip. The three
// outcomes that mean something went wrong keep their coloured chips, which is
// what lets the eye find them in a page of fifty.
function OutcomeCell({ v, t }) {
  if (v === "done") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px]" title={labelOf(t, "logs.outHint.", v)} style={{ color: "var(--text-4)" }}>
        <CheckCircle2 size={11} style={{ color: GREEN, opacity: 0.8 }} />
        {labelOf(t, "logs.out.", v)}
      </span>
    );
  }
  return <OutcomeChip v={v} t={t} />;
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
  const { t, tl, multiDay, withRole } = ctx;
  switch (key) {
    case "time":      return <TimeCell r={r} multiDay={multiDay} t={t} />;
    case "who":       return <WhoCell r={r} t={t} tl={tl} withRole={withRole} />;
    case "actorRole": return r.actor_role ? <Plain w="120px">{roleLabel(t, r.actor_role)}</Plain> : null;
    case "category":  return <CategoryChip v={r.category} t={t} />;
    case "action":    return <Plain w="260px" tone="var(--text-1)">{labelOf(t, "logs.act.", r.action)}</Plain>;
    case "outcome":   return <OutcomeCell v={r.outcome} t={t} />;
    case "source":    return <SourceChip v={r.source} t={t} />;
    case "unit":      return val(tl(r.unit)) && <Plain w="160px">{tl(r.unit)}</Plain>;
    case "day":       return r.day ? <span className="tabular-nums" style={{ color: "var(--text-2)" }}>{fmtDay(r.day)}</span> : null;
    case "change":    return <ChangeCell r={r} t={t} />;
    case "target":    return val(targetText(r, ctx)) && <Plain w="200px">{targetText(r, ctx)}</Plain>;

    case "document": {
      const v = firstOf(targetText(r, ctx), labelOf(t, "logs.f.", detail(r, ["doc_type"])));
      return v && <Plain w="180px">{v}</Plain>;
    }
    case "worker": {
      const v = firstOf(detail(r, ["worker", "workers"]));
      return v && <Plain w="160px">{tl(String(v))}</Plain>;
    }
    case "profile": {
      const v = firstOf(targetText(r, ctx), detail(r, ["user", "profile"]));
      return v && <Plain w="180px">{v}</Plain>;
    }
    case "role": {
      const v = detail(r, ["role", "scope", "page"]);
      return v && <Plain w="140px">{roleLabel(t, v)}</Plain>;
    }
    case "login": {
      const v = firstOf(detail(r, ["user", "login", "username"]), targetText(r, ctx));
      return v && <Plain w="180px">{v}</Plain>;
    }
    case "object": {
      const v = firstOf(targetText(r, ctx), tl(r.unit), detail(r, ["unit", "cell", "name"]));
      return v && <Plain w="200px">{v}</Plain>;
    }
    case "task": {
      const v = firstOf(targetText(r, ctx), detail(r, ["task", "task_id"]));
      return v && <Plain w="180px">{v}</Plain>;
    }
    case "level": {
      const v = firstOf(detail(r, ["level"]), tl(r.unit));
      return v && <Plain w="130px">{labelOf(t, "logs.f.", v)}</Plain>;
    }
    case "leader": {
      // The «leader» detail is a name; the fallback target is often a TASK
      // (a checklist answer names no leader), so it is rendered by its kind.
      const lead = detail(r, ["leader"]);
      const v = lead != null ? tl(String(lead)) : targetText(r, ctx);
      return v && <Plain w="170px">{v}</Plain>;
    }
    case "verdict": {
      const v = detail(r, ["verdict", "resolution", "status", "state"]);
      return v && <Plain w="140px">{labelOf(t, "logs.f.", v)}</Plain>;
    }
    case "item": {
      const v = firstOf(targetText(r, ctx), detail(r, ["task", "concern", "text"]));
      return v && <Plain w="260px">{v}</Plain>;
    }
    case "audience": {
      const v = firstOf(detail(r, ["audience"]), targetText(r, ctx));
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
      const v = firstOf(targetText(r, ctx), detail(r, ["key", "setting", "id"]));
      return v && <Plain w="200px">{labelOf(t, "logs.f.", v)}</Plain>;
    }
    case "scope": {
      const v = firstOf(tl(r.unit), targetText(r, ctx), detail(r, ["unit", "date", "state"]));
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

// ── phone card ───────────────────────────────────────────────────────────────

function LogCard({ r, cols, selected, onSelect, ctx }) {
  const { t, tl } = ctx;
  const lines = cols
    .filter((k) => !CARD_HEAD.has(k))
    .map((k) => [k, cell(k, r, ctx)])
    .filter(([, node]) => node);
  const danger = r.category === "danger";

  return (
    <button
      type="button"
      onClick={() => onSelect(r)}
      aria-pressed={selected}
      aria-label={t("logs.openRow")}
      className="w-full text-left rounded-2xl px-3 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand)]"
      style={{
        background: selected ? "var(--brand-bg)" : danger ? "rgba(239,68,68,0.06)" : "var(--bg-card)",
        border: `1px solid ${selected ? "var(--brand-border)" : danger ? "rgba(239,68,68,0.30)" : "var(--border)"}`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs">{cell("time", r, ctx)}</span>
        <OutcomeCell v={r.outcome} t={t} />
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
              <span className="flex-shrink-0" style={{ color: "var(--text-4)" }}>{colLabel(t, k)}</span>
              <span className="min-w-0 flex-1">{node}</span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

// ── the table ────────────────────────────────────────────────────────────────

export default function LogTable({
  rows, category, loading, multiDay, empty, selectedId = null, onSelect,
}) {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const cols = colsFor(category);
  const withRole = !cols.includes("actorRole");
  const ctx = { t, tl, tx, multiDay, withRole };

  // One ref per row, so the keyboard can walk them and the panel can hand focus
  // back to the row it was opened from.
  const rowRefs = useRef(new Map());
  const lastSel = useRef(null);
  useEffect(() => {
    if (selectedId != null) {
      lastSel.current = selectedId;
      rowRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest" });
      return;
    }
    const id = lastSel.current;
    lastSel.current = null;
    if (id != null) rowRefs.current.get(id)?.focus({ preventScroll: true });
  }, [selectedId]);

  const onKey = (e, i) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      onSelect(rows[i]);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const next = rows[i + (e.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      e.preventDefault();
      rowRefs.current.get(next.id)?.focus();
      // With the panel open, walking the rows walks the panel too.
      if (selectedId != null) onSelect(next);
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
    return rows.map((r, i) => {
      const selected = selectedId === r.id;
      return (
        <tr
          key={r.id}
          ref={(el) => { if (el) rowRefs.current.set(r.id, el); else rowRefs.current.delete(r.id); }}
          tabIndex={0}
          role="button"
          aria-pressed={selected}
          aria-label={t("logs.openRow")}
          onClick={() => onSelect(r)}
          onKeyDown={(e) => onKey(e, i)}
          className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand)]"
          // The selected row wears the brand tint and a stripe; a danger row
          // its red tint. Both are inline so they outrank the card's hover
          // class — a database restore should look different at rest, not
          // only under a pointer no phone has.
          style={selected
            ? { background: "var(--brand-bg)", boxShadow: "inset 3px 0 var(--brand)" }
            : r.category === "danger" ? { background: "rgba(239,68,68,0.06)" } : undefined}
        >
          {cols.map((c) => (
            <td key={c} className="px-3 py-2 align-middle">
              {cell(c, r, ctx) ?? <span style={{ color: "var(--text-4)" }}>—</span>}
            </td>
          ))}
        </tr>
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
        <LogCard key={r.id} r={r} cols={cols} ctx={ctx} selected={selectedId === r.id} onSelect={onSelect} />
      ));

  return (
    <TableCard minWidth={cols.length > 7 ? 1100 : 960} mobile={mobile} mobileCards>
      <thead>
        <tr>
          {cols.map((c) => (
            <Th key={c} label={colLabel(t, c)} hint={c === "time" ? t("logs.newestFirst") : undefined} />
          ))}
        </tr>
      </thead>
      <tbody>{body()}</tbody>
    </TableCard>
  );
}
