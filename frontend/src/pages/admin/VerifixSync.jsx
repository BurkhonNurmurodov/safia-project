import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCcwDot, RefreshCw, FlaskConical, Link2, Unlink, SlidersHorizontal, History,
  CheckCircle2, XCircle, AlertTriangle, Loader2, Info, ChevronDown, ChevronRight,
  Building2, Users, UserPlus, UserRound, ArrowRightLeft, ShieldAlert, CircleDashed,
  Undo2, EyeOff, Ban, Grid3x3, UserX, Link2Off, SquareDashed,
} from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import FormField from "../../components/ui/FormField";
import SearchInput from "../../components/ui/SearchInput";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import StyledSelect from "../../components/ui/StyledSelect";
import CountStepper from "../../components/ui/CountStepper";
import CellLink from "../../components/ui/CellLink";
import TableCard, { Th, SectionHead } from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import { SkeletonBlock, SkeletonTable } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import { fill, fmtAt } from "./VerifixParity";

/**
 * «Verifix sinxron» — `/admin/upload?tab=verifixsync`.
 *
 * The platform's three registers (cells, leader and other profiles, brigadir
 * units) FOLLOW Verifix through a stored Verifix id per row
 * (docs/plan-verifix-live-sync.md). This page is where a person sees and
 * steers that: the org read the sync works on, its mode (off · report · on),
 * a pass or the tie run on demand, the per-pass caps, and four views —
 *
 *   «Takliflar»            the queue: what Verifix says that the sync will not
 *                          write by itself, one tap to apply or dismiss;
 *   «Bog'lanmaganlar»      the rows nothing ties to Verifix yet, tied by hand
 *                          by picking the Verifix record;
 *   «Qo'lda bog'langanlar» the hand ties (they win over every matching rule);
 *   «Jurnal»               every pass and tie run, with what it wrote.
 *
 * Nothing here is computed: every rule lives in `services/verifix_sync.py`,
 * and the page states what the server says. A decided suggestion STAYS where it
 * was, showing its outcome, until the tab is opened again — an action taken in
 * a list must never move the list.
 *
 * Admin-only and NOT grantable (no capKey in ADMIN_NAV): it moves people,
 * cells and access.
 */

const QK = ["admin-verifix-sync"];
const PROFILES_QK = ["admin-profiles"];
const BASE = "/api/admin/verifix-sync";

// The queue's sections, in the order a person should work them: the ones that
// need a CHOICE first, then the ones that move people or cells, then names,
// then what is information only.
const ITEM_ORDER = [
  "two_seats", "seat_no_profile", "tie_doubtful", "code_changed", "brigadir_differs",
  "leader_moved", "seat_changed", "seat_gone", "hold", "new_unit", "rename", "archived_open",
  "missing", "shared_tie", "not_a_cell", "unit_dismissed", "profile_dismissed", "seat_other_role",
];
const KIND_ICON = {
  two_seats: Users, seat_no_profile: UserPlus, tie_doubtful: ShieldAlert,
  code_changed: AlertTriangle, brigadir_differs: Building2, leader_moved: ArrowRightLeft,
  seat_changed: RefreshCw, seat_gone: UserX, hold: CircleDashed, new_unit: UserPlus,
  rename: UserRound, archived_open: Undo2, missing: EyeOff, shared_tie: Link2Off,
  not_a_cell: SquareDashed, unit_dismissed: Ban, profile_dismissed: Ban, seat_other_role: Info,
};
// A tap on these renames or creates a person / unit — the profiles register's
// own cache has to re-read.
const PROFILE_KINDS = new Set(["rename", "new_unit", "seat_no_profile", "tie_doubtful",
  "leader_moved", "hold"]);
const CAP_KEYS = ["cell_archived", "cell_created", "dismissed", "seat_moves", "profile_created"];
const TIE_GROUPS = ["cells", "leaders", "units", "others"];
const PROFILE_LISTS = ["leaders", "shift_managers", "top_managers", "admins", "guests", "idle_owners"];

const CARD = { background: "var(--bg-card)", border: "1px solid var(--border)" };
const INNER = { background: "var(--bg-inner)", border: "1px solid var(--border)" };
const TONE = {
  ok:    { ink: "var(--status-ok)",   bg: "rgba(34,197,94,0.12)", bd: "rgba(34,197,94,0.30)" },
  warn:  { ink: "var(--status-warn)", bg: "rgba(234,179,8,0.12)", bd: "rgba(234,179,8,0.30)" },
  bad:   { ink: "var(--status-bad)",  bg: "rgba(239,68,68,0.12)", bd: "rgba(239,68,68,0.30)" },
  grey:  { ink: "var(--text-3)",      bg: "var(--bg-inner)",      bd: "var(--border-md)" },
  brand: { ink: "var(--brand-text)",  bg: "var(--brand-bg)",      bd: "var(--brand-border)" },
};

const fmtDay = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");
const fmtDM = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");
const n0 = (v) => Number(v || 0).toLocaleString("ru-RU");

/** t(key), or `fb` when the bundle has no such key (a code the server added). */
const tOr = (t, key, fb) => {
  const v = t(key);
  return v === key ? fb : v;
};

/** The server's refusal in the reader's words: its `code` when we know it,
 *  else the server's own sentence. */
function errText(e, t) {
  const raw = e?.response?.data?.detail_raw;
  const code = raw?.code;
  if (code) {
    const v = t(`vsync.err.${code}`);
    if (v !== `vsync.err.${code}`) return fill(v, raw?.params || {});
  }
  const d = e?.response?.data?.detail;
  return (typeof d === "string" && d) || t("vsync.err.failed");
}

function guardText(g, t) {
  if (!g) return "";
  const [head, ...rest] = String(g).split(":");
  if (head === "found") {
    return fill(t("vsync.guard.found"), { pct: Math.round(parseFloat(rest[0] || "0") * 100) });
  }
  if (head === "cap") {
    const m = /(\d+)>(\d+)/.exec(rest[1] || "");
    return fill(t("vsync.guard.cap"), {
      what: tOr(t, `vsync.cap.${rest[0]}`, rest[0]), n: m?.[1] ?? "?", cap: m?.[2] ?? "?",
    });
  }
  return tOr(t, `vsync.guard.${head}`, g);
}

function whyText(w, t) {
  if (!w) return "—";
  if (w.startsWith("weak_")) return fill(t("vsync.why.weak"), { how: howText(w.slice(5), t) || "—" });
  return tOr(t, `vsync.why.${w}`, w);
}

function howText(h, t) {
  if (!h) return "";
  const [base, narrow] = String(h).split("+");
  const b = tOr(t, `vsync.how.${base}`, base);
  return narrow ? `${b} · ${tOr(t, `vsync.narrow.${narrow}`, narrow)}` : b;
}

const roleText = (role, t) => tOr(t, `vsync.role.${role}`, role || "—");

function statusChip(st, t, dismissed) {
  const tone = st === "W" ? "ok" : st === "D" ? "bad" : st === "U" ? "warn" : "grey";
  const label = tOr(t, `vsync.st.${st}`, st || "—");
  return (
    <Chip tone={tone}>
      {label}{st === "D" && dismissed ? ` · ${fmtDay(dismissed)}` : ""}
    </Chip>
  );
}

// ─── small pieces ────────────────────────────────────────────────────────────

function Chip({ tone = "grey", icon: Icon, children, title, className = "" }) {
  const c = TONE[tone] || TONE.grey;
  return (
    <span title={title}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${className}`}
      style={{ background: c.bg, color: c.ink, border: `1px solid ${c.bd}` }}>
      {Icon && <Icon size={11} className="flex-shrink-0" />}
      {children}
    </span>
  );
}

/** A cell is its CODE: a neutral chip, pressable onto /cells/:id. */
function CellCode({ id, code }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-mono font-semibold"
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}>
      <CellLink id={id}>{code || "—"}</CellLink>
    </span>
  );
}

function Alert({ tone = "bad", icon: Icon = AlertTriangle, children }) {
  const c = TONE[tone] || TONE.bad;
  return (
    <div className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs leading-snug"
      style={{ background: c.bg, border: `1px solid ${c.bd}`, color: "var(--text-1)" }}>
      <Icon size={14} className="flex-shrink-0 mt-px" style={{ color: c.ink }} />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

/** Our rows by id — the queue's payloads carry ids, and a person reads names.
 *  The state names every unit / profile / cell its items and ties refer to
 *  (`names`), read with the state itself. The run log's changes name rows the
 *  state does not, so while a run is open the profiles register (the cache the
 *  «Profillar» tab already fills) is the fallback — never a read on every
 *  visit. */
function useNames(tl, server, roster) {
  return useMemo(() => {
    const units = new Map();
    const profs = new Map();
    const cells = new Map();
    for (const s of roster?.supervisors || []) units.set(s.id, s.name);
    for (const key of PROFILE_LISTS) {
      for (const p of roster?.[key] || []) if (!profs.has(p.id)) profs.set(p.id, p.name);
    }
    for (const c of roster?.cells || []) cells.set(c.id, c.verifix_code);
    // The state's own names win: they were read beside the items they name.
    // JSON keys are strings; the payloads' ids are numbers.
    for (const [id, n] of Object.entries(server?.units || {})) units.set(Number(id), n);
    for (const [id, p] of Object.entries(server?.profiles || {})) profs.set(Number(id), p?.name);
    for (const [id, c] of Object.entries(server?.cells || {})) cells.set(Number(id), c);
    const known = (m, id) => (id == null ? null : m.get(Number(id)));
    const unit = (id) => (id == null ? null : known(units, id) ? tl(known(units, id)) : `#${id}`);
    const prof = (id) => (id == null ? null : known(profs, id) ? tl(known(profs, id)) : `#${id}`);
    const cell = (id) => (id == null ? null : known(cells, id) || `#${id}`);
    return { unit, prof, cell };
  }, [server, roster, tl]);
}

// ─── the queue: what an item says and what its tap does ──────────────────────

/** {subject, says, will} for one queue item — every sentence built from the
 *  payload the server stored, nothing inferred. */
function describe(it, ctx) {
  const { t, tl, tx, names } = ctx;
  const p = it.payload || {};
  const cell = p.cell != null ? <CellCode id={p.cell} code={p.code} /> : null;
  const who = (name, role) => (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{tl(name || "") || "—"}</span>
      {role && <Chip>{roleText(role, t)}</Chip>}
    </span>
  );
  const vfx = (v) => (v ? `${tl(v.name || "")}${v.job ? ` (${tx(v.job)})` : ""}` : "—");
  const unitOr = (id) => names.unit(id) || t("vsync.noUnit");
  switch (it.kind) {
    case "brigadir_differs":
      return {
        subject: cell,
        says: `${fill(t("vsync.it.brigadir_differs.says"), { brig: tl(p.brigadir || ""), to: unitOr(p.to_unit) })} ${
          p.from_unit ? fill(t("vsync.it.brigadir_differs.now"), { from: unitOr(p.from_unit) }) : t("vsync.it.brigadir_differs.nowNone")}`,
        will: fill(t("vsync.it.brigadir_differs.will"), { to: unitOr(p.to_unit) }),
      };
    case "leader_moved":
      return {
        subject: <span className="inline-flex items-center gap-2 flex-wrap">{who(p.name, "leader")}{cell}</span>,
        says: fill(t("vsync.it.leader_moved.says"), {
          name: tl(p.name || ""), code: p.code, to: unitOr(p.to_unit), from: unitOr(p.from_unit),
        }),
        will: fill(t("vsync.it.leader_moved.will"), { to: unitOr(p.to_unit), code: p.code }),
      };
    case "new_unit":
      return {
        subject: who(p.name, "supervisor"),
        says: fill(t("vsync.it.new_unit.says"), { vfx: vfx(p.vfx) }),
        will: fill(t("vsync.it.new_unit.will"), { name: tl(p.name || "") }),
      };
    case "code_changed":
      return {
        subject: cell,
        says: fill(t("vsync.it.code_changed.says"), { code: p.code, new: p.new_code }),
        will: fill(t("vsync.it.code_changed.will"), { new: p.new_code }),
      };
    case "rename":
      return {
        subject: who(p.name, p.unit != null ? "supervisor" : p.role),
        says: fill(t("vsync.it.rename.says"), { vfx: tl(p.vfx_name || "") }),
        will: t(p.unit != null ? "vsync.it.rename.willUnit" : "vsync.it.rename.will"),
      };
    case "tie_doubtful":
      return {
        subject: who(p.name, p.unit != null ? "supervisor" : p.role),
        says: fill(t("vsync.it.tie_doubtful.says"), { vfx: vfx(p.vfx) }),
        will: t("vsync.it.tie_doubtful.will"),
      };
    case "two_seats":
      return {
        subject: cell,
        says: fill(t("vsync.it.two_seats.says"), {
          n: (p.seats || []).length, list: (p.seats || []).map((s) => tl(s.name || "")).join(", "),
        }),
        will: t("vsync.it.two_seats.will"),
      };
    case "seat_changed":
      return {
        subject: cell,
        says: fill(t("vsync.it.seat_changed.says"), { seat: vfx(p.seat) }),
        will: fill(t("vsync.it.seat_changed.will"), { name: names.prof(p.profile) || tl(p.seat?.name || "") }),
      };
    case "hold":
      // A person chose another manager, so the seat's profile was made with no
      // unit: the tap connects it to the cell's brigada, the manager stays.
      if (p.why === "manual_manager") {
        return {
          subject: cell,
          says: fill(t("vsync.it.hold.saysManual"), { seat: vfx(p.seat), code: p.code }),
          will: t("vsync.it.hold.willManual"),
        };
      }
      return p.profile != null ? {
        subject: <span className="inline-flex items-center gap-2 flex-wrap">{who(p.name, "leader")}{cell}</span>,
        says: fill(t("vsync.it.hold.saysProfile"), {
          name: tl(p.name || ""), code: p.code, why: whyText(p.why, t),
        }),
        will: t("vsync.it.hold.will"),
      } : {
        subject: cell,
        says: fill(t("vsync.it.hold.saysSeat"), { seat: vfx(p.seat), code: p.code }),
        will: t("vsync.it.hold.willSeat"),
      };
    case "archived_open":
      return {
        subject: cell,
        says: fill(t("vsync.it.archived_open.says"), { by: tl(p.by || "") || "—" }),
        will: t("vsync.it.archived_open.will"),
      };
    case "seat_no_profile":
      return {
        subject: cell,
        says: fill(t("vsync.it.seat_no_profile.says"), {
          seat: vfx(p.seat), code: p.code, why: whyText(p.why, t),
        }),
        will: t("vsync.it.seat_no_profile.will"),
      };
    case "seat_gone": {
      // The seat may be a whole Verifix person, a bare id (no longer in the
      // list) or nobody at all.
      const seat = p.seat?.name ? vfx(p.seat) : p.seat?.id ? `id ${p.seat.id}` : "—";
      const says = {
        no_seat: "vsync.it.seat_gone.saysNoSeat", missing: "vsync.it.seat_gone.saysMissing",
        status: "vsync.it.seat_gone.saysStatus", left_cells: "vsync.it.seat_gone.saysLeft",
      }[p.why] || "vsync.it.seat_gone.saysNoSeat";
      const owner = names.prof(p.owner);
      const manager = names.prof(p.manager);
      const will = owner && manager ? "vsync.it.seat_gone.willBoth"
        : manager ? "vsync.it.seat_gone.willManager" : "vsync.it.seat_gone.willOwner";
      return {
        subject: cell,
        says: fill(t(says), { seat, st: tOr(t, `vsync.st.${p.seat?.status}`, p.seat?.status || "—") }),
        will: fill(t(will), { owner: owner || "—", manager: manager || "—" }),
      };
    }
    case "shared_tie":
      return {
        subject: who(p.name, p.role),
        says: fill(t("vsync.it.shared_tie.says"), {
          vfx: p.vfx?.name ? vfx(p.vfx) : `id ${p.vfx?.id || "—"}`,
          others: (p.others || []).map((o) => `${tl(o.name || "")} (${roleText(o.role, t)})`).join(", ") || "—",
        }),
        will: null,
      };
    case "not_a_cell":
      // The subdivision's own name is a workshop name — never printed.
      return { subject: cell, says: t("vsync.it.not_a_cell.says"), will: null };
    case "missing":
      return {
        subject: who(p.name, p.unit != null ? "supervisor" : p.role),
        says: fill(t("vsync.it.missing.says"), { id: p.vfx_id || "—" }),
        will: null,
      };
    case "unit_dismissed":
      return {
        subject: who(p.name, "supervisor"),
        says: fill(t("vsync.it.unit_dismissed.says"), { date: fmtDay(p.date) }),
        will: null,
      };
    case "profile_dismissed":
      return {
        subject: who(p.name, p.role),
        says: fill(t("vsync.it.profile_dismissed.says"), { date: fmtDay(p.date) }),
        will: null,
      };
    case "seat_other_role":
      return {
        subject: cell,
        says: fill(t("vsync.it.seat_other_role.says"), {
          seat: vfx(p.seat), role: roleText(p.role, t),
        }),
        will: null,
      };
    default:
      return {
        subject: cell || (p.name ? who(p.name, p.role) : <span className="font-mono text-xs">{it.key}</span>),
        says: t("vsync.it.unknown"),
        will: null,
      };
  }
}

/** The one line a decided item is listed by. */
function subjectText(it, ctx) {
  const p = it.payload || {};
  if (p.code) return p.code;
  if (p.name) return ctx.tl(p.name);
  if (p.vfx?.name) return ctx.tl(p.vfx.name);
  return it.key;
}

function ItemCard({ it, ctx }) {
  const { t, tl, tx, untiedLeaders, busy, onApply, onDismiss, onUntieItem } = ctx;
  const p = it.payload || {};
  const info = !it.applicable;
  const [choice, setChoice] = useState(it.kind === "rename" ? (p.new || "") : "");
  const [tried, setTried] = useState(false);
  const d = describe(it, ctx);
  const isBusy = !!busy[it.id];
  // Decided on this visit: the card stays where it was, at its height, saying
  // what became of it — an action taken in a list never moves the list.
  const outcome = it.outcome || null;
  const applied = outcome === "applied";

  // A suggestion that waits on something only a person elsewhere can give
  // (the cell's brigadir) offers no tap that is sure to be refused.
  const waits = it.kind === "hold" && p.profile == null;
  const needsChoice = it.kind === "two_seats" || it.kind === "rename";
  const missing = needsChoice && !String(choice).trim();

  const approve = (c) => {
    if (needsChoice && missing) { setTried(true); return; }
    onApply(it, c);
  };

  const approveLabel = it.kind === "seat_no_profile"
    ? t(choice ? "vsync.approve.seat_no_profile_tie" : "vsync.approve.seat_no_profile")
    : tOr(t, `vsync.approve.${it.kind}`, t("vsync.approve.default"));

  let choiceNode = null;
  if (it.kind === "two_seats") {
    choiceNode = (
      <FormField label={t("vsync.pickSeat")} required
        error={tried && missing ? t("vsync.pickSeatErr") : undefined}>
        <StyledSelect value={choice} onChange={setChoice} placeholder={t("vsync.pickSeatPh")}
          ariaLabel={t("vsync.pickSeat")} disabled={!!outcome}
          options={(p.seats || []).map((s) => ({
            value: s.id, label: `${tl(s.name || "")}${s.job ? ` · ${tx(s.job)}` : ""}`,
          }))} />
      </FormField>
    );
  } else if (it.kind === "rename") {
    choiceNode = (
      <FormField label={t("vsync.newName")} required
        hint={fill(t("vsync.newNameHint"), { vfx: p.vfx_name || "—" })}
        error={tried && missing ? t("vsync.newNameErr") : undefined}>
        <input value={choice} onChange={(e) => setChoice(e.target.value)}
          aria-label={t("vsync.newName")} spellCheck={false} disabled={!!outcome}
          className="w-full rounded-xl px-3 py-2 text-base sm:text-sm outline-none"
          style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }} />
      </FormField>
    );
  } else if (it.kind === "seat_no_profile") {
    choiceNode = (
      <FormField label={t("vsync.tieExisting")} hint={t("vsync.tieExistingHint")}>
        <StyledSelect searchable value={choice} onChange={setChoice} disabled={!!outcome}
          searchPlaceholder={t("vsync.searchPerson")} ariaLabel={t("vsync.tieExisting")}
          options={[
            { value: "", label: t("vsync.createNewOpt") },
            ...untiedLeaders.map((x) => ({
              value: String(x.id),
              label: `${tl(x.name || "")}${x.unit ? ` · ${tl(x.unit)}` : ""}`,
              title: `${tl(x.name || "")} ${x.name || ""}`,
            })),
          ]} />
      </FormField>
    );
  }

  return (
    <div className="rounded-xl p-3 space-y-2.5" style={{ ...INNER, opacity: outcome ? 0.8 : 1 }}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">{d.subject}</div>
        {it.first_seen && (
          <span className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}
            title={fill(t("vsync.lastSeen"), { at: fmtAt(it.last_seen) })}>
            {fill(t("vsync.since"), { at: fmtAt(it.first_seen) })}
          </span>
        )}
      </div>

      <dl className="space-y-1 text-[13px] leading-snug">
        <div>
          <dt className="inline font-semibold" style={{ color: "var(--text-3)" }}>{t("vsync.says")} </dt>
          <dd className="inline" style={{ color: "var(--text-1)" }}>{d.says}</dd>
        </div>
        <div>
          <dt className="inline font-semibold" style={{ color: "var(--text-3)" }}>
            {info ? t("vsync.infoOnly") : t("vsync.will")}{" "}
          </dt>
          <dd className="inline" style={{ color: "var(--text-2)" }}>
            {info ? t("vsync.infoOnlyBody") : d.will}
          </dd>
        </div>
      </dl>

      {choiceNode && <div className="max-w-md">{choiceNode}</div>}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5 min-h-[38px]">
        {outcome ? (
          <>
            {applied && it.res?.from && (
              <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                {fill(t("vsync.fromDate"), { d: fmtDM(it.res.from) })}
              </span>
            )}
            <Chip tone={applied || outcome === "untied" ? "ok" : "grey"}
              icon={applied || outcome === "untied" ? CheckCircle2 : XCircle}>
              {t(outcome === "untied" ? "vsync.out.untiedNow" : applied ? "vsync.out.appliedNow"
                : info ? "vsync.out.closedNow" : "vsync.out.dismissedNow")}
            </Chip>
          </>
        ) : info ? (
          <>
            {/* One Verifix person on several profiles: nothing on this page
                lists a rule-made tie, so the way out is here — untie THIS
                profile (it moves to «Bog'lanmaganlar»). */}
            {it.kind === "shared_tie" && p.profile != null && (
              <Button size="lg" variant="danger" tint icon={<Unlink size={14} />} disabled={isBusy}
                onClick={() => onUntieItem(it)}>
                {t("vsync.approve.untie")}
              </Button>
            )}
            <Button size="lg" variant="secondary" tint loading={isBusy}
              onClick={() => onDismiss(it, false)}>
              {t("vsync.close")}
            </Button>
          </>
        ) : (
          <>
            <Button size="lg" variant="ghost" tint disabled={isBusy}
              onClick={() => onDismiss(it, true)}>
              {tOr(t, `vsync.dismiss.${it.kind}`, t("vsync.dismiss.default"))}
            </Button>
            {it.kind === "tie_doubtful" ? (
              <>
                <Button size="lg" variant="danger" tint icon={<Unlink size={14} />} disabled={isBusy}
                  onClick={() => onApply(it, "untie")}>
                  {t("vsync.approve.untie")}
                </Button>
                <Button size="lg" variant="success" tint icon={<CheckCircle2 size={14} />} loading={isBusy}
                  onClick={() => onApply(it, null)}>
                  {t("vsync.approve.tie_doubtful")}
                </Button>
              </>
            ) : !waits && (
              <Button size="lg" variant={it.kind === "code_changed" ? "danger" : "primary"} tint
                loading={isBusy}
                onClick={() => approve(it.kind === "two_seats" || it.kind === "rename"
                  ? String(choice).trim() : it.kind === "seat_no_profile" ? (choice || null) : null)}>
                {approveLabel}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DecidedList({ decided, ctx }) {
  const { t, tl } = ctx;
  const [open, setOpen] = useState(false);
  if (!decided.length) return null;
  const tone = { applied: "ok", dismissed: "grey", settled: "brand" };
  // The choice a tap carried, where it reads as something: the spelling a
  // rename took, the seat two_seats named. A profile / employee id does not.
  const noteText = (it) => {
    if (!it.note || it.note === "untie") return null;
    if (it.kind === "rename") return `«${tl(it.note)}»`;
    if (it.kind === "two_seats") {
      const s = (it.payload?.seats || []).find((x) => x.id === it.note);
      return s ? tl(s.name || "") : null;
    }
    return null;
  };
  return (
    <section className="rounded-2xl overflow-hidden" style={CARD}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 min-h-[44px] text-left"
        style={{ borderBottom: open ? "1px solid var(--border)" : "none" }}>
        {open ? <ChevronDown size={15} style={{ color: "var(--text-3)" }} />
          : <ChevronRight size={15} style={{ color: "var(--text-3)" }} />}
        <span className="text-xs font-semibold uppercase tracking-wider flex-1" style={{ color: "var(--text-3)" }}>
          {t("vsync.decided")}
        </span>
        <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{decided.length}</span>
      </button>
      {open && (
        <ul>
          {decided.map((it) => (
            <li key={it.id} className="px-4 py-2 flex items-center gap-x-3 gap-y-1 flex-wrap text-xs"
              style={{ borderTop: "1px solid var(--border)" }}>
              <span className="font-medium" style={{ color: "var(--text-1)" }}>
                {tOr(t, `vsync.kind.${it.kind}`, it.kind)}
              </span>
              <span className="font-mono" style={{ color: "var(--text-2)" }}>{subjectText(it, ctx)}</span>
              <Chip tone={tone[it.status] || "grey"}>{tOr(t, `vsync.out.${it.status}`, it.status)}</Chip>
              {noteText(it) && (
                <span className="truncate max-w-[220px]" style={{ color: "var(--text-3)" }} title={noteText(it)}>
                  {noteText(it)}
                </span>
              )}
              {it.note === "untie" && <Chip tone="bad">{t("vsync.approve.untie")}</Chip>}
              <span className="ml-auto tabular-nums" style={{ color: "var(--text-3)" }}>
                {tl(it.decided_by || "") || "—"} · {fmtAt(it.decided_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ItemsTab({ items, decided, kept, ctx }) {
  const { t } = ctx;
  const groups = useMemo(() => {
    const all = [...items.filter((i) => !kept[i.id]), ...Object.values(kept)];
    const by = new Map();
    for (const it of all) {
      if (!by.has(it.kind)) by.set(it.kind, []);
      by.get(it.kind).push(it);
    }
    const order = [...ITEM_ORDER, ...[...by.keys()].filter((k) => !ITEM_ORDER.includes(k)).sort()];
    return order.filter((k) => by.has(k)).map((k) => [k, by.get(k).sort((a, b) =>
      String(a.first_seen || "").localeCompare(String(b.first_seen || "")) || a.id - b.id)]);
  }, [items, kept]);

  return (
    <div className="space-y-4">
      {groups.length === 0 ? (
        <div className="rounded-2xl" style={CARD}>
          <EmptyState showUploadLink={false} icon={CheckCircle2} height="h-44"
            title={t("vsync.noItems")} message={t("vsync.noItemsBody")} />
        </div>
      ) : groups.map(([kind, rows]) => {
        const open = rows.filter((r) => !r.outcome).length;
        return (
          <section key={kind} className="rounded-2xl overflow-hidden" style={CARD}>
            <SectionHead icon={KIND_ICON[kind] || Info} title={tOr(t, `vsync.kind.${kind}`, kind)}
              right={<span className="text-xs tabular-nums font-semibold" style={{ color: "var(--text-2)" }}>{open}</span>} />
            <div className="p-3 space-y-3">
              {rows.map((it) => <ItemCard key={it.id} it={it} ctx={ctx} />)}
            </div>
          </section>
        );
      })}
      <DecidedList decided={decided} ctx={ctx} />
    </div>
  );
}

// ─── the untied rows ─────────────────────────────────────────────────────────

function UntiedTable({ icon, title, rows, tiedN, cols, match, onTie, ctx }) {
  const { t } = ctx;
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle ? rows.filter((r) => match(r, needle)) : rows;
  const n = cols.length + 1;
  return (
    <TableCard icon={icon} title={title} maxHeight="55vh"
      right={(
        <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
          {fill(t("vsync.untiedCount"), { n: rows.length, m: n0(tiedN) })}
        </span>
      )}
      toolbar={rows.length > 0 ? (
        <SearchInput value={q} onChange={setQ} placeholder={t("common.search")}
          className="flex-1 min-w-[180px] max-w-[340px]" />
      ) : null}>
      <thead>
        <tr>
          {cols.map((c) => <Th key={c.key} label={c.label} cls={c.thCls || ""} />)}
          <Th label="" cls="w-[1%]" />
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={n} className="px-3 py-4">
            <EmptyState showUploadLink={false} icon={CheckCircle2} height="h-24"
              title={t("vsync.allTied")} message={t("vsync.allTiedBody")} />
          </td></tr>
        ) : shown.length === 0 ? (
          <tr><td colSpan={n} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>
            {t("vsync.noMatch")}
          </td></tr>
        ) : shown.map((r) => (
          <tr key={r.id}>
            {cols.map((c) => <td key={c.key} className="px-3 py-2 whitespace-nowrap">{c.render(r)}</td>)}
            <td className="px-3 py-1 text-right whitespace-nowrap">
              <Button size="lg" variant="primary" tint icon={<Link2 size={14} />} onClick={() => onTie(r)}>
                {t("vsync.tieBtn")}
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
}

function UntiedTab({ data, ctx, onTie }) {
  const { t, tl } = ctx;
  const u = data.untied || {};
  const tied = data.tied || {};
  const twoWords = (s) => String(s || "").split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
  const nameMatch = (r, needle) =>
    `${tl(r.name || "")} ${r.name || ""} ${tl(r.unit || "")} ${r.unit || ""}`.toLowerCase().includes(needle);
  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-snug flex gap-2" style={{ color: "var(--text-3)" }}>
        <Info size={15} className="flex-shrink-0 mt-px" />
        <span>{t("vsync.untiedLead")}</span>
      </p>
      <UntiedTable ctx={ctx} icon={Grid3x3} title={t("vsync.untiedCells")} rows={u.cells || []}
        tiedN={tied.cells}
        cols={[
          { key: "code", label: t("vsync.colCode"), render: (r) => <CellCode id={r.id} code={r.code} /> },
          { key: "unit", label: t("vsync.colUnit"),
            render: (r) => <span style={{ color: "var(--text-2)" }}>{r.unit ? tl(r.unit) : "—"}</span> },
          { key: "state", label: t("vsync.colState"),
            render: (r) => (r.archived ? <Chip>{t("vsync.archived")}</Chip> : <Chip tone="ok">{t("vsync.active")}</Chip>) },
        ]}
        match={(r, needle) => `${r.code || ""} ${tl(r.unit || "")} ${r.unit || ""}`.toLowerCase().includes(needle)}
        onTie={(r) => onTie({ kind: "cell", vkind: "division", our_id: r.id, label: r.code, query: r.code || "" })} />
      <UntiedTable ctx={ctx} icon={Users} title={t("vsync.untiedPeople")} rows={u.people || []}
        tiedN={tied.people}
        cols={[
          { key: "name", label: t("vsync.colName"),
            render: (r) => <span className="font-medium">{tl(r.name || "") || "—"}</span> },
          { key: "role", label: t("vsync.colRole"), render: (r) => <Chip>{roleText(r.role, t)}</Chip> },
          { key: "unit", label: t("vsync.colUnit"),
            render: (r) => <span style={{ color: "var(--text-2)" }}>{r.unit ? tl(r.unit) : "—"}</span> },
        ]}
        match={nameMatch}
        onTie={(r) => onTie({
          kind: r.role === "leader" ? "leader" : "profile", vkind: "person", our_id: r.id,
          label: tl(r.name || ""), query: twoWords(r.name),
        })} />
      <UntiedTable ctx={ctx} icon={Building2} title={t("vsync.untiedUnits")} rows={u.units || []}
        tiedN={tied.units}
        cols={[
          { key: "name", label: t("vsync.colUnitName"),
            render: (r) => <span className="font-medium">{tl(r.name || "") || "—"}</span> },
        ]}
        match={nameMatch}
        onTie={(r) => onTie({
          kind: "unit", vkind: "person", our_id: r.id, label: tl(r.name || ""), query: twoWords(r.name),
        })} />
    </div>
  );
}

/** Pick the Verifix record a row of ours IS. The search reads the stored
 *  directory; nothing is ever matched for the operator — they choose. */
function TieModal({ target, onClose, onDone, ctx }) {
  const { t, tl, tx } = ctx;
  const start = (target.query || "").trim();
  const [q, setQ] = useState(target.query || "");
  const [dq, setDq] = useState(start);
  const [picked, setPicked] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onQ = (v) => {
    setQ(v);
    // A pick the new search may no longer show must not stay armed.
    setPicked(null);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDq(v.trim()), 300);
  };

  const enabled = dq.length >= 2;
  const { data, isFetching, isError } = useQuery({
    queryKey: ["admin-verifix-sync-search", target.vkind, dq],
    queryFn: () => api.get(`${BASE}/search`, { params: { q: dq, kind: target.vkind } }).then((r) => r.data),
    enabled,
    staleTime: 30_000,
  });
  const items = enabled ? (data?.items || []) : [];
  const division = target.vkind === "division";

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    setErr("");
    try {
      const res = (await api.post(`${BASE}/tie`, {
        kind: target.kind, our_id: target.our_id, vfx_id: String(picked.id),
      })).data;
      onDone(res, target, picked);
    } catch (e) {
      setErr(errText(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} icon={<Link2 size={16} />} maxWidth="max-w-xl"
      title={t("vsync.tieTitle")}
      subtitle={fill(t(division ? "vsync.tieSubCell" : "vsync.tieSubPerson"), { what: target.label || "—" })}
      dismissable={!busy}
      footer={(
        <>
          <Button size="lg" variant="secondary" onClick={onClose} disabled={busy}>{t("common.cancel")}</Button>
          <Button size="lg" variant="primary" icon={<Link2 size={14} />} loading={busy}
            disabled={!picked} onClick={submit}>
            {t("vsync.tieBtn")}
          </Button>
        </>
      )}>
      <p className="text-xs leading-snug" style={{ color: "var(--text-3)" }}>
        {t(division ? "vsync.tieHintCell" : "vsync.tieHintPerson")}
      </p>
      <SearchInput value={q} onChange={onQ}
        placeholder={t(division ? "vsync.searchDivision" : "vsync.searchPerson")} />

      {!enabled ? (
        <p className="text-xs py-2" style={{ color: "var(--text-3)" }}>{t("vsync.typeTwo")}</p>
      ) : isError ? (
        <Alert>{t("vsync.searchFailed")}</Alert>
      ) : data?.reason === "no_read" ? (
        <Alert tone="warn">{t("vsync.guard.no_read")}</Alert>
      ) : isFetching && !data ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <SkeletonBlock key={i} className="h-12 rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs py-2" style={{ color: "var(--text-3)" }}>{t("vsync.noResults")}</p>
      ) : (
        <ul role="listbox" aria-label={t("vsync.tieTitle")} className="space-y-1.5">
          {items.map((r) => {
            const sel = picked?.id === r.id;
            return (
              <li key={r.id}>
                <button type="button" role="option" aria-selected={sel} onClick={() => setPicked(r)}
                  className="w-full text-left rounded-xl px-3 py-2 min-h-[44px] flex items-center gap-2.5"
                  style={{
                    background: sel ? "var(--brand-bg)" : "var(--bg-inner)",
                    border: `1px solid ${sel ? "var(--brand-border)" : "var(--border)"}`,
                  }}>
                  <span className="w-4 h-4 rounded-full flex-shrink-0 grid place-items-center"
                    style={{ border: `2px solid ${sel ? "var(--brand)" : "var(--border-md)"}` }}>
                    {sel && <span className="w-2 h-2 rounded-full" style={{ background: "var(--brand)" }} />}
                  </span>
                  {division ? (
                    <span className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-sm" style={{ color: "var(--text-1)" }}>
                        {r.code || "—"}
                      </span>
                      <span className="text-xs min-w-0 truncate" style={{ color: "var(--text-2)" }}>{tx(r.name || "")}</span>
                      <Chip tone={r.state === "A" ? "ok" : "grey"}>
                        {tOr(t, `vsync.div.${r.state}`, r.state || "—")}
                      </Chip>
                    </span>
                  ) : (
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{tl(r.name || "")}</span>
                        {statusChip(r.status, t, r.dismissed)}
                      </span>
                      <span className="block text-xs truncate mt-0.5" style={{ color: "var(--text-3)" }}>
                        {[r.job && tx(r.job), r.unit && tx(r.unit)].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {items.length >= 40 && (
            <li className="text-[11px] pt-1" style={{ color: "var(--text-3)" }}>{t("vsync.first40")}</li>
          )}
        </ul>
      )}
      {err && <Alert>{err}</Alert>}
    </Modal>
  );
}

// ─── the hand ties ───────────────────────────────────────────────────────────

function TiesTab({ ties, ctx, onUntie }) {
  const { t, tl, names } = ctx;
  const [q, setQ] = useState("");
  // The state names both sides of a tie (`our_name`, `vfx_name`, read with
  // it); the id maps are only the fallback for a row renamed since.
  const rows = useMemo(() => ties.map((x) => ({
    ...x,
    label: x.kind === "cell" ? (x.our_name || names.cell(x.our_id))
      : x.kind === "unit" ? (x.our_name ? tl(x.our_name) : names.unit(x.our_id))
        : (x.our_name ? tl(x.our_name) : names.prof(x.our_id)),
    vfxLabel: x.kind === "cell" || !x.vfx_name ? "" : tl(x.vfx_name),
  })), [ties, names, tl]);
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? rows.filter((r) => `${r.label || ""} ${r.vfxLabel} ${r.vfx_name || ""} ${r.vfx_id || ""} ${tl(r.by || "")}`
      .toLowerCase().includes(needle))
    : rows;
  return (
    <TableCard icon={Link2} title={t("vsync.tab.ties")}
      right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{n0(ties.length)}</span>}
      toolbar={ties.length > 0 ? (
        <SearchInput value={q} onChange={setQ} placeholder={t("common.search")}
          className="flex-1 min-w-[180px] max-w-[340px]" />
      ) : null}>
      <thead>
        <tr>
          <Th label={t("vsync.colKind")} />
          <Th label={t("vsync.colOurs")} />
          <Th label={t("vsync.colVfx")} />
          <Th label={t("vsync.colBy")} />
          <Th label={t("vsync.colAt")} />
          <Th label="" cls="w-[1%]" />
        </tr>
      </thead>
      <tbody>
        {ties.length === 0 ? (
          <tr><td colSpan={6} className="px-3 py-4">
            <EmptyState showUploadLink={false} icon={Link2} height="h-24"
              title={t("vsync.noTies")} message={t("vsync.noTiesBody")} />
          </td></tr>
        ) : shown.length === 0 ? (
          <tr><td colSpan={6} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>
            {t("vsync.noMatch")}
          </td></tr>
        ) : shown.map((r) => (
          <tr key={r.id}>
            <td className="px-3 py-2 whitespace-nowrap"><Chip>{tOr(t, `vsync.tieKind.${r.kind}`, r.kind)}</Chip></td>
            <td className="px-3 py-2 whitespace-nowrap">
              {r.kind === "cell"
                ? <CellCode id={r.our_id} code={r.label} />
                : <span className="font-medium">{r.label || "—"}</span>}
            </td>
            {/* A cell's Verifix side is its subdivision — whose name is the
                workshop name, never printed (a cell is its CODE): the id. */}
            <td className="px-3 py-2 whitespace-nowrap">
              <span className="inline-flex items-center gap-2">
                {r.vfxLabel && <span style={{ color: "var(--text-1)" }}>{r.vfxLabel}</span>}
                <span className="font-mono text-xs" style={{ color: "var(--text-3)" }}>{r.vfx_id}</span>
                {r.vfx_name
                  ? (r.kind !== "cell" && r.vfx_status && r.vfx_status !== "W" && statusChip(r.vfx_status, t))
                  : <Chip tone="warn">{t("vsync.vfxGone")}</Chip>}
              </span>
            </td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-2)" }}>{tl(r.by || "") || "—"}</td>
            <td className="px-3 py-2 whitespace-nowrap tabular-nums" style={{ color: "var(--text-3)" }}>{fmtAt(r.at)}</td>
            <td className="px-3 py-1 text-right whitespace-nowrap">
              <Button size="lg" variant="danger" tint icon={<Unlink size={14} />} onClick={() => onUntie(r)}>
                {t("vsync.untie")}
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
}

// Rows a person UNTIED: no pass ties them back by itself (the tie run and the
// automatic tie by code both skip them) until the block is lifted here.
function BlockedCard({ rows, ctx, onLift }) {
  const { t, tl, names } = ctx;
  if (!rows.length) return null;
  const label = (x) => (x.kind === "cell" ? (x.our_name || names.cell(x.our_id))
    : x.kind === "unit" ? (x.our_name ? tl(x.our_name) : names.unit(x.our_id))
      : (x.our_name ? tl(x.our_name) : names.prof(x.our_id)));
  return (
    <TableCard icon={Unlink} title={t("vsync.blockedTitle")}
      right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{n0(rows.length)}</span>}
      toolbar={(
        <p className="text-xs leading-snug" style={{ color: "var(--text-3)" }}>{t("vsync.blockedLead")}</p>
      )}>
      <thead>
        <tr>
          <Th label={t("vsync.colKind")} />
          <Th label={t("vsync.colOurs")} />
          <Th label={t("vsync.colBy")} />
          <Th label={t("vsync.colAt")} />
          <Th label="" cls="w-[1%]" />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="px-3 py-2 whitespace-nowrap"><Chip>{tOr(t, `vsync.tieKind.${r.kind}`, r.kind)}</Chip></td>
            <td className="px-3 py-2 whitespace-nowrap">
              {r.kind === "cell"
                ? <CellCode id={r.our_id} code={label(r)} />
                : <span className="font-medium">{label(r) || "—"}</span>}
            </td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-2)" }}>{tl(r.by || "") || "—"}</td>
            <td className="px-3 py-2 whitespace-nowrap tabular-nums" style={{ color: "var(--text-3)" }}>{fmtAt(r.at)}</td>
            <td className="px-3 py-1 text-right whitespace-nowrap">
              <Button size="lg" variant="secondary" icon={<Link2 size={14} />}
                onClick={() => onLift({ ...r, label: label(r) })}>
                {t("vsync.liftBlock")}
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
}

// ─── the run log ─────────────────────────────────────────────────────────────

function runSummary(r, t) {
  const c = r.counts || {};
  if (r.kind === "tie" || r.kind === "tie_dry") {
    const sum = (suf) => TIE_GROUPS.reduce((a, g) => a + (Number(c[`${g}_${suf}`]) || 0), 0);
    return fill(t("vsync.sumTie"), { tied: sum("tied"), untied: sum("untied") });
  }
  let ch = 0;
  for (const [k, v] of Object.entries(c)) if (!k.startsWith("queue_")) ch += Number(v) || 0;
  const parts = [fill(t("vsync.sumChanges"), { n: ch })];
  if (c.queue_opened) parts.push(fill(t("vsync.sumOpened"), { n: c.queue_opened }));
  if (c.queue_settled) parts.push(fill(t("vsync.sumSettled"), { n: c.queue_settled }));
  return parts.join(" · ");
}

function RunsTab({ runs, ctx, onOpen }) {
  const { t } = ctx;
  return (
    <TableCard icon={History} title={t("vsync.tab.runs")}
      right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{n0(runs.length)}</span>}>
      <thead>
        <tr>
          <Th label={t("vsync.colAt")} />
          <Th label={t("vsync.colKind")} />
          <Th label={t("vsync.colMode")} />
          <Th label={t("vsync.colResult")} />
          <Th label={t("vsync.colCounts")} />
          <Th label={t("vsync.colTook")} align="right" />
        </tr>
      </thead>
      <tbody>
        {runs.length === 0 ? (
          <tr><td colSpan={6} className="px-3 py-4">
            <EmptyState showUploadLink={false} icon={History} height="h-24"
              title={t("vsync.noRuns")} message={t("vsync.noRunsBody")} />
          </td></tr>
        ) : runs.map((r) => (
          <tr key={r.id} onClick={() => onOpen(r.id)} style={{ cursor: "pointer" }}>
            <td className="px-3 py-2 tabular-nums whitespace-nowrap">
              <button type="button" className="underline decoration-dotted underline-offset-2"
                style={{ color: "var(--text-1)" }}
                onClick={(e) => { e.stopPropagation(); onOpen(r.id); }}>
                {fmtAt(r.finished_at || r.started_at)}
              </button>
            </td>
            <td className="px-3 py-2 whitespace-nowrap">{tOr(t, `vsync.run.${r.kind}`, r.kind)}</td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-2)" }}>
              {r.mode ? tOr(t, `vsync.mode.${r.mode}`, r.mode) : "—"}
            </td>
            <td className="px-3 py-2 whitespace-nowrap">
              {r.ok
                ? <Chip tone="ok" icon={CheckCircle2}>{t("vsync.runOk")}</Chip>
                : (
                  <Chip tone="bad" icon={XCircle} title={guardText(r.guard, t)}
                    className="max-w-[260px] overflow-hidden">
                    <span className="truncate min-w-0">{r.guard ? guardText(r.guard, t) : t("vsync.runFailed")}</span>
                  </Chip>
                )}
            </td>
            <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{runSummary(r, t)}</td>
            <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: "var(--text-3)" }}>
              {r.ms != null ? fill(t("vsync.sec"), { s: (r.ms / 1000).toFixed(1) }) : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
}

/** One change of a pass, as one line: what, on which row, to what. */
function changeParts(c, ctx) {
  const { t, tl, names } = ctx;
  let subject = c.code || "";
  if (!subject && c.name) subject = tl(c.name);
  if (!subject && c.vfx?.name) subject = tl(c.vfx.name);
  if (!subject && c.key) {
    const [role, id] = String(c.key).split(":");
    subject = role === "supervisor" ? names.unit(Number(id)) : names.prof(Number(id));
  }
  if (!subject && c.profile != null) subject = names.prof(c.profile);
  if (!subject && c.unit != null) subject = names.unit(c.unit);
  let detail = "";
  switch (c.kind) {
    case "owner":
    case "manager":
    case "grandfather":
      detail = c.to == null ? t("vsync.chTo.none")
        : String(c.to).startsWith("new:") ? t("vsync.chTo.new") : `→ ${names.prof(Number(c.to))}`;
      break;
    case "cell_archived":
      detail = whyText(c.why, t);
      break;
    case "dismissed":
      detail = fill(t("vsync.chDismissed"), { d: fmtDay(c.date) });
      break;
    case "unit_kind":
    case "leader_kind":
      detail = c.job ? ctx.tx(c.job) : "";
      break;
    case "profile_created":
      detail = c.vfx?.job ? ctx.tx(c.vfx.job) : "";
      if (c.unit == null) detail = [detail, t("vsync.chUnconnected")].filter(Boolean).join(" · ");
      break;
    default:
      break;
  }
  return { subject: subject || "—", detail };
}

function ChangeList({ title, rows, ctx, tone = "ok" }) {
  const { t } = ctx;
  if (!rows?.length) return null;
  return (
    <details open={rows.length <= 40} className="rounded-xl overflow-hidden" style={INNER}>
      <summary className="px-3 min-h-[40px] flex items-center gap-2 cursor-pointer text-xs font-semibold"
        style={{ color: "var(--text-2)" }}>
        <span className="flex-1">{title}</span>
        <Chip tone={tone}>{n0(rows.length)}</Chip>
      </summary>
      <ul>
        {rows.map((c, i) => {
          const { subject, detail } = changeParts(c, ctx);
          // A unit / leader kind change carries the kind it moves TO.
          const kv = c.kind === "unit_kind" || c.kind === "leader_kind"
            ? (c.value ?? c.to ?? null) : null;
          const kindWord = tOr(t, `vsync.ch.${c.kind}`, c.kind) + (kv
            ? `: ${tOr(t, `vsync.${c.kind === "unit_kind" ? "uk" : "lk"}.${kv}`, String(kv))}` : "");
          return (
            <li key={i} className="px-3 py-1.5 flex items-center gap-x-2.5 gap-y-1 flex-wrap text-xs"
              style={{ borderTop: "1px solid var(--border)" }}>
              <span className="font-medium" style={{ color: "var(--text-1)" }}>{kindWord}</span>
              <span className="font-mono" style={{ color: "var(--text-2)" }}>{subject}</span>
              {detail && <span style={{ color: "var(--text-3)" }}>{detail}</span>}
              {c.refused && <Chip tone="bad">{fill(t("vsync.refused"), { code: errCodeText(c.refused, t) })}</Chip>}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

const errCodeText = (code, t) => tOr(t, `vsync.err.${code}`, code);

function TieGroup({ group, part, ctx }) {
  const { t, tl } = ctx;
  if (!part) return null;
  const isCells = group === "cells";
  const subject = (r) => (isCells ? r.code : tl(r.name || "")) || `#${r.id}`;
  const lists = [
    ["tied", "ok", (r) => (
      <>
        <span className={isCells ? "font-mono" : "font-medium"} style={{ color: "var(--text-1)" }}>{subject(r)}</span>
        {!isCells && r.vfx && (
          <span style={{ color: "var(--text-3)" }}>↔ {tl(r.vfx.name || "")}{r.vfx.job ? ` · ${ctx.tx(r.vfx.job)}` : ""}</span>
        )}
        {r.how && <Chip>{howText(r.how, t)}</Chip>}
      </>
    )],
    ["untied", "warn", (r) => (
      <>
        <span className={isCells ? "font-mono" : "font-medium"} style={{ color: "var(--text-1)" }}>{subject(r)}</span>
        {r.role && <Chip>{roleText(r.role, t)}</Chip>}
        <span style={{ color: "var(--text-3)" }}>{whyText(r.why, t)}</span>
      </>
    )],
    ["doubtful", "bad", (r) => (
      <>
        <span className="font-medium" style={{ color: "var(--text-1)" }}>{subject(r)}</span>
        <span style={{ color: "var(--text-3)" }}>↔ {tl(r.vfx?.name || "")}</span>
      </>
    )],
  ];
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
          {t(`vsync.grp.${group}`)}
        </span>
        <Chip tone="ok">{fill(t("vsync.tiedN"), { n: (part.tied || []).length })}</Chip>
        <Chip>{fill(t("vsync.alreadyN"), { n: part.already || 0 })}</Chip>
        {(part.untied || []).length > 0 && <Chip tone="warn">{fill(t("vsync.untiedN"), { n: part.untied.length })}</Chip>}
        {(part.doubtful || []).length > 0 && <Chip tone="bad">{fill(t("vsync.doubtfulN"), { n: part.doubtful.length })}</Chip>}
      </div>
      {lists.map(([key, tone, render]) => {
        const rows = part[key] || [];
        if (!rows.length) return null;
        return (
          <details key={key} open={rows.length <= 30} className="rounded-xl overflow-hidden" style={INNER}>
            <summary className="px-3 min-h-[40px] flex items-center gap-2 cursor-pointer text-xs font-semibold"
              style={{ color: "var(--text-2)" }}>
              <span className="flex-1">{t(`vsync.list.${key}`)}</span>
              <Chip tone={tone}>{n0(rows.length)}</Chip>
            </summary>
            <ul>
              {rows.map((r, i) => (
                <li key={`${r.id}-${i}`} className="px-3 py-1.5 flex items-center gap-x-2.5 gap-y-1 flex-wrap text-xs"
                  style={{ borderTop: "1px solid var(--border)" }}>
                  {render(r)}
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </section>
  );
}

function RunModal({ id, onClose, ctx }) {
  const { t } = ctx;
  const { data: r, isLoading, isError } = useQuery({
    queryKey: ["admin-verifix-sync-run", id],
    queryFn: () => api.get(`${BASE}/runs/${id}`).then((x) => x.data),
    staleTime: 60_000,
  });
  const ch = r?.changes || {};
  const tie = r && (r.kind === "tie" || r.kind === "tie_dry");
  const empty = r && !r.guard && (tie
    ? TIE_GROUPS.every((g) => !ch[g])
    : !(ch.done?.length || ch.would?.length || ch.items?.length));
  return (
    <Modal onClose={onClose} icon={<History size={16} />} maxWidth="max-w-3xl"
      title={r ? `${tOr(t, `vsync.run.${r.kind}`, r.kind)} · ${fmtAt(r.finished_at || r.started_at)}` : t("vsync.runTitle")}
      subtitle={r ? [
        r.mode ? `${t("vsync.colMode")}: ${tOr(t, `vsync.mode.${r.mode}`, r.mode)}` : null,
        r.org_at ? fill(t("vsync.readAt"), { at: fmtAt(r.org_at) }) : null,
        r.ms != null ? fill(t("vsync.sec"), { s: (r.ms / 1000).toFixed(1) }) : null,
      ].filter(Boolean).join(" · ") : undefined}
      footer={<Button size="lg" variant="secondary" onClick={onClose}>{t("vsync.close")}</Button>}>
      {isLoading ? (
        <div className="space-y-2">
          <SkeletonBlock className="h-10 rounded-xl" />
          <SkeletonBlock className="h-24 rounded-xl" />
        </div>
      ) : isError || !r ? (
        <Alert>{t("vsync.loadFailed")}</Alert>
      ) : (
        <div className="space-y-3">
          {r.guard && <Alert>{fill(t("vsync.guardRun"), { why: guardText(r.guard, t) })}</Alert>}
          {tie ? (
            TIE_GROUPS.map((g) => <TieGroup key={g} group={g} part={ch[g]} ctx={ctx} />)
          ) : (
            <>
              <ChangeList title={t("vsync.listDone")} rows={ch.done} ctx={ctx} tone="ok" />
              <ChangeList title={t("vsync.listWould")} rows={ch.would} ctx={ctx} tone="brand" />
              {ch.items?.length > 0 && (
                <details className="rounded-xl overflow-hidden" style={INNER}>
                  <summary className="px-3 min-h-[40px] flex items-center gap-2 cursor-pointer text-xs font-semibold"
                    style={{ color: "var(--text-2)" }}>
                    <span className="flex-1">{t("vsync.listItems")}</span>
                    <Chip>{n0(ch.items.length)}</Chip>
                  </summary>
                  <ul>
                    {ch.items.map((it, i) => (
                      <li key={`${it.kind}-${it.key}-${i}`}
                        className="px-3 py-1.5 flex items-center gap-x-2.5 flex-wrap text-xs"
                        style={{ borderTop: "1px solid var(--border)" }}>
                        <span className="font-medium" style={{ color: "var(--text-1)" }}>
                          {tOr(t, `vsync.kind.${it.kind}`, it.kind)}
                        </span>
                        <span className="font-mono" style={{ color: "var(--text-2)" }}>
                          {subjectText({ ...it, payload: it.payload || {} }, ctx)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
          {empty && <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("vsync.runEmpty")}</p>}
        </div>
      )}
    </Modal>
  );
}

// ─── the caps ────────────────────────────────────────────────────────────────

function CapsModal({ caps, defaults, onClose, onSaved, ctx }) {
  const { t } = ctx;
  const [draft, setDraft] = useState(() => Object.fromEntries(CAP_KEYS.map((k) => [k, caps?.[k] ?? defaults?.[k] ?? 0])));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const bad = (k) => !Number.isInteger(draft[k]) || draft[k] < 0 || draft[k] > 5000;
  const anyBad = CAP_KEYS.some(bad);
  const changed = CAP_KEYS.some((k) => draft[k] !== caps?.[k]);

  const save = async () => {
    if (anyBad) { setTried(true); return; }
    setBusy(true);
    setErr("");
    try {
      const res = (await api.put(`${BASE}/caps`, { caps: draft })).data;
      onSaved(res.caps);
    } catch (e) {
      setErr(errText(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} icon={<SlidersHorizontal size={16} />} title={t("vsync.capsTitle")}
      subtitle={t("vsync.capsSub")} dismissable={!busy}
      footer={(
        <>
          <Button size="lg" variant="secondary" onClick={onClose} disabled={busy}>{t("common.cancel")}</Button>
          <Button size="lg" variant="primary" loading={busy} disabled={!changed} onClick={save}>
            {t("common.save")}
          </Button>
        </>
      )}>
      <div className="grid sm:grid-cols-2 gap-4">
        {CAP_KEYS.map((k) => (
          <FormField key={k} label={t(`vsync.cap.${k}`)}
            hint={fill(t("vsync.capDefault"), { n: defaults?.[k] ?? "—" })}
            error={tried && bad(k) ? t("vsync.capErr") : undefined}>
            <CountStepper value={draft[k]} min={0} max={5000} invalid={tried && bad(k)}
              aria-label={t(`vsync.cap.${k}`)}
              onChange={(v) => setDraft((d) => ({ ...d, [k]: v }))} />
          </FormField>
        ))}
      </div>
      <div className="flex justify-start">
        <Button size="lg" variant="ghost" icon={<Undo2 size={14} />} disabled={busy}
          onClick={() => setDraft(Object.fromEntries(CAP_KEYS.map((k) => [k, defaults?.[k] ?? 0])))}>
          {t("vsync.capsReset")}
        </Button>
      </div>
      {err && <Alert>{err}</Alert>}
    </Modal>
  );
}

// ─── the header: the read, the mode, the buttons ─────────────────────────────

function HeaderCard({ data, ctx, modeBusy, onMode, starting, onStart, onCaps }) {
  const { t } = ctx;
  const org = data.org || {};
  const job = data.job || {};
  const running = !!job.kind;
  const lastPass = (data.runs || []).find((r) => r.kind === "pass");
  const modes = data.modes?.length ? data.modes : ["off", "report", "on"];
  const busyAny = running || !!starting;
  const jobWord = job.kind === "tie" ? t("vsync.jobTie") : t("vsync.jobPass");

  return (
    <div className="rounded-2xl overflow-hidden" style={CARD}>
      <SectionHead icon={RefreshCcwDot} title={t("vsync.title")}
        right={running ? (
          <Chip tone="brand" icon={Loader2} className="[&_svg]:animate-spin">{jobWord}</Chip>
        ) : null} />
      <div className="p-4 space-y-4">
        {/* the org read the sync works on */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-sm font-medium" style={{ color: "var(--text-1)" }}>
              {org.read_at ? fill(t("vsync.readAt"), { at: fmtAt(org.read_at) }) : t("vsync.neverRead")}
            </span>
            {org.read_at && (
              <span className="text-sm tabular-nums" style={{ color: "var(--text-2)" }}>
                {fill(t("vsync.orgCounts"), { d: n0(org.divisions), e: n0(org.employees), w: n0(org.working) })}
              </span>
            )}
          </div>
          {/* «Never read» is already the line above; the alert is for a read
              that came back too thin to act on. */}
          {org.guard && !(org.guard === "no_read" && !org.read_at) && (
            <Alert>{fill(t("vsync.guardNow"), { why: guardText(org.guard, t) })}</Alert>
          )}
          {org.error && (
            <Alert>{fill(t("vsync.readError"), { e: org.error, at: fmtAt(org.error_at) || "—" })}</Alert>
          )}
          {lastPass && (
            <div className="flex items-center gap-2 flex-wrap text-xs" style={{ color: "var(--text-3)" }}>
              <span>{fill(t("vsync.lastPass"), { at: fmtAt(lastPass.finished_at || lastPass.started_at) })}</span>
              {lastPass.ok
                ? <Chip tone="ok" icon={CheckCircle2}>{runSummary(lastPass, t)}</Chip>
                : <Chip tone="bad" icon={XCircle}>{guardText(lastPass.guard, t) || t("vsync.runFailed")}</Chip>}
            </div>
          )}
        </div>

        {/* the mode */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
            {t("vsync.modeLabel")}
          </div>
          <SegmentedToggle value={data.mode} onChange={onMode} ariaLabel={t("vsync.modeLabel")}
            options={modes.map((m) => ({ value: m, label: tOr(t, `vsync.mode.${m}`, m), disabled: modeBusy }))} />
          <p className="text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
            {tOr(t, `vsync.modeHint.${data.mode}`, "")}
          </p>
        </div>

        {/* the actions */}
        <div className="flex flex-wrap gap-2">
          <Button size="lg" variant="primary" icon={<RefreshCw size={15} />}
            loading={starting === "pass"} disabled={busyAny} onClick={() => onStart("pass")}>
            {t("vsync.checkNow")}
          </Button>
          <Button size="lg" variant="secondary" icon={<FlaskConical size={15} />}
            loading={starting === "dry"} disabled={busyAny} onClick={() => onStart("dry")}>
            {t("vsync.dry")}
          </Button>
          <span className="hidden sm:block w-px self-stretch mx-1" style={{ background: "var(--border)" }} />
          <Button size="lg" variant="secondary" icon={<FlaskConical size={15} />}
            loading={starting === "tie_dry"} disabled={busyAny} onClick={() => onStart("tie_dry")}>
            {t("vsync.tieDry")}
          </Button>
          <Button size="lg" variant="secondary" icon={<Link2 size={15} />}
            loading={starting === "tie"} disabled={busyAny} onClick={() => onStart("tie")}>
            {t("vsync.tieRun")}
          </Button>
          <Button size="lg" variant="ghost" icon={<SlidersHorizontal size={15} />} onClick={onCaps}
            className="sm:ml-auto">
            {t("vsync.caps")}
          </Button>
        </div>

        {running ? (
          <p className="text-xs flex items-center gap-2" style={{ color: "var(--text-2)" }}>
            <Loader2 size={14} className="animate-spin flex-shrink-0" />
            {fill(t("vsync.jobRunning"), { what: jobWord, at: fmtAt(job.started) })}
          </p>
        ) : job.error ? (
          <Alert>{fill(t("vsync.jobFailed"), { e: job.error })}</Alert>
        ) : (
          <p className="text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>{t("vsync.actionsHint")}</p>
        )}
      </div>
    </div>
  );
}

// ─── the page ────────────────────────────────────────────────────────────────

const START = {
  pass:    ["pass", { dry: false, force_read: true }],
  dry:     ["pass", { dry: true, force_read: false }],
  tie_dry: ["tie-run", { dry: true, force_read: false }],
  tie:     ["tie-run", { dry: false, force_read: false }],
};

export default function VerifixSync() {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const qc = useQueryClient();
  const {
    success: okToast, error: errToast, warning: warnToast, info: infoToast, node: toastNode,
  } = useToast({ position: "bottom" });

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: QK,
    queryFn: () => api.get(BASE).then((r) => r.data),
    // While a tie run or a pass runs on the server, read every 3 s so its end
    // shows; at rest a minute is enough (the scheduled pass runs every ten).
    refetchInterval: (q) => (q.state.data?.job?.kind ? 3000 : 60_000),
  });

  const [tab, setTab] = usePersistentState("admin.verifixsync.tab", "items");
  const [kept, setKept] = useState({});
  // The items being sent right now, by id — two cards may be pressed at once.
  const [busy, setBusy] = useState({});
  const [starting, setStarting] = useState(null);
  const [modeBusy, setModeBusy] = useState(false);
  const [capsOpen, setCapsOpen] = useState(false);
  const [tieTarget, setTieTarget] = useState(null);
  const [runOpen, setRunOpen] = useState(null);
  // ONE confirm for every action that asks first; its failure stays INSIDE it.
  const [ask, setAsk] = useState(null);
  const [askErr, setAskErr] = useState("");
  const [askBusy, setAskBusy] = useState(false);

  // The profiles register only while a run is open — its changes name rows
  // the state's own `names` does not (see useNames).
  const { data: roster } = useQuery({
    queryKey: PROFILES_QK,
    queryFn: () => api.get("/api/profiles/admin/list").then((r) => r.data),
    staleTime: 60_000,
    enabled: runOpen != null,
  });
  const names = useNames(tl, data?.names, roster);

  const refresh = (profiles = false) => {
    qc.invalidateQueries({ queryKey: QK });
    if (profiles) qc.invalidateQueries({ queryKey: PROFILES_QK });
  };

  // A job the server finished: say how it ended, and open what a TRIAL run
  // found (that is why somebody pressed it). The run is the one recorded
  // AFTER the press — a job that recorded nothing (the scheduled pass held
  // the slot) must not open whichever older run happens to be newest.
  const jobKind = data?.job?.kind || null;
  const prevKind = useRef(null);
  const startedRef = useRef(null);
  useEffect(() => {
    const prev = prevKind.current;
    prevKind.current = jobKind;
    if (!prev || jobKind) return;
    const started = startedRef.current;
    startedRef.current = null;
    if (prev === "tie") qc.invalidateQueries({ queryKey: PROFILES_QK });
    if (data?.job?.error) {
      errToast(fill(t("vsync.jobFailed"), { e: data.job.error }));
      return;
    }
    if (!started) {
      // Somebody else's press: say only that it ended.
      okToast(t(prev === "tie" ? "vsync.tieDone" : "vsync.passDone"));
      return;
    }
    const run = (data?.runs || []).find((r) => r.id > started.after && r.kind === started.what);
    if (!run) {
      warnToast(t("vsync.noNewRun"));
      return;
    }
    if (!run.ok) {
      errToast(fill(t("vsync.guardRun"), { why: guardText(run.guard, t) || t("vsync.runFailed") }));
      setRunOpen(run.id);
      return;
    }
    okToast(t(prev === "tie" ? "vsync.tieDone" : "vsync.passDone"));
    if (started.dry) setRunOpen(run.id);
  }, [jobKind]); // eslint-disable-line react-hooks/exhaustive-deps

  const startCore = async (what) => {
    const [path, body0] = START[what];
    // A trial pass with the sync OFF must read Verifix itself: without
    // `force_read` the server answers «off» and records nothing at all.
    const body = what === "dry" ? { ...body0, force_read: data?.mode === "off" } : body0;
    const after = Math.max(0, ...(data?.runs || []).map((r) => r.id));
    const res = (await api.post(`${BASE}/${path}`, body)).data;
    if (!res.started) {
      warnToast(t("vsync.jobBusy"));
      refresh();
      return;
    }
    // The run's kind as the log records it: pass · dry · tie · tie_dry.
    startedRef.current = { what, after, dry: what === "dry" || what === "tie_dry" };
    // A job that ended before the server answered still has to be SEEN
    // ending, so the page holds it as running until the next read says not.
    const kind = res.job?.kind || (path === "tie-run" ? "tie" : "pass");
    qc.setQueryData(QK, (old) => (old ? { ...old, job: { ...(res.job || {}), kind } } : old));
    refresh();
    infoToast(t(`vsync.started.${what}`));
  };

  const onStart = async (what) => {
    if (what === "tie") {
      setAsk({
        tone: "warning", title: t("vsync.tieAskTitle"), message: t("vsync.tieAskBody"),
        confirmLabel: t("vsync.tieRun"), run: () => startCore("tie"),
      });
      return;
    }
    setStarting(what);
    try {
      await startCore(what);
    } catch (e) {
      errToast(errText(e, t));
    } finally {
      setStarting(null);
    }
  };

  const setModeCore = async (m) => {
    await api.put(`${BASE}/mode`, { mode: m });
    qc.setQueryData(QK, (old) => (old ? { ...old, mode: m } : old));
    okToast(fill(t("vsync.modeSaved"), { m: tOr(t, `vsync.mode.${m}`, m) }));
  };
  const onMode = async (m) => {
    if (!data || m === data.mode) return;
    if (m === "on") {
      setAsk({
        tone: "warning", title: t("vsync.onAskTitle"), message: t("vsync.onAskBody"),
        confirmLabel: t("vsync.onAskOk"), run: () => setModeCore("on"),
      });
      return;
    }
    setModeBusy(true);
    try {
      await setModeCore(m);
    } catch (e) {
      errToast(errText(e, t));
    } finally {
      setModeBusy(false);
    }
  };

  const appliedMsg = (res) => {
    const parts = [t("vsync.applied")];
    if (res?.from) parts.push(fill(t("vsync.fromDate"), { d: fmtDM(res.from) }));
    if (res?.moved != null) parts.push(fill(t("vsync.movedRows"), { n: n0(res.moved) }));
    if (res?.unit) parts.push(t("vsync.unitCreated"));
    return parts.join(" · ");
  };

  const applyCore = async (it, choice) => {
    let res;
    try {
      res = (await api.post(`${BASE}/items/${it.id}/apply`, { choice: choice ?? null })).data;
    } catch (e) {
      refresh();
      throw e;
    }
    const untie = choice === "untie";
    setKept((k) => ({ ...k, [it.id]: { ...it, outcome: untie ? "untied" : "applied", res } }));
    okToast(untie ? t("vsync.untied") : appliedMsg(res));
    refresh(PROFILE_KINDS.has(it.kind));
  };
  const dismissCore = async (it) => {
    try {
      await api.post(`${BASE}/items/${it.id}/dismiss`);
    } catch (e) {
      refresh();
      throw e;
    }
    setKept((k) => ({ ...k, [it.id]: { ...it, outcome: "dismissed" } }));
    refresh();
  };

  const onApply = async (it, choice) => {
    if (it.kind === "code_changed") {
      const p = it.payload || {};
      setAsk({
        tone: "danger", title: t("vsync.codeAskTitle"),
        message: fill(t("vsync.codeAskBody"), { code: p.code, new: p.new_code }),
        confirmLabel: t("vsync.approve.code_changed"), run: () => applyCore(it, null),
      });
      return;
    }
    if (choice === "untie") {
      setAsk({
        tone: "danger", title: t("vsync.untieAskTitle"), message: t("vsync.untieDoubtBody"),
        confirmLabel: t("vsync.approve.untie"), run: () => applyCore(it, "untie"),
      });
      return;
    }
    setBusy((b) => ({ ...b, [it.id]: true }));
    try {
      await applyCore(it, choice);
    } catch (e) {
      errToast(errText(e, t));
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[it.id]; return n; });
    }
  };

  // Dismissing a SUGGESTION is remembered — it does not come back until
  // Verifix says something else — so it asks; closing an information line
  // does not.
  const onDismiss = async (it, askFirst) => {
    if (askFirst) {
      setAsk({
        tone: "warning", title: t("vsync.dismissAskTitle"), message: t("vsync.dismissAskBody"),
        confirmLabel: tOr(t, `vsync.dismiss.${it.kind}`, t("vsync.dismiss.default")),
        run: () => dismissCore(it),
      });
      return;
    }
    setBusy((b) => ({ ...b, [it.id]: true }));
    try {
      await dismissCore(it);
    } catch (e) {
      errToast(errText(e, t));
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[it.id]; return n; });
    }
  };

  const onUntie = (row) => setAsk({
    tone: "warning", title: t("vsync.untieAskTitle"),
    message: fill(t("vsync.untieAskBody"), { what: row.label || `#${row.our_id}` }),
    confirmLabel: t("vsync.untie"),
    run: async () => {
      await api.post(`${BASE}/tie`, { kind: row.kind, our_id: row.our_id, vfx_id: null });
      okToast(t("vsync.untied"));
      refresh(true);
    },
  });

  const onLift = (row) => setAsk({
    tone: "warning", title: t("vsync.liftAskTitle"),
    message: fill(t("vsync.liftAskBody"), { what: row.label || `#${row.our_id}` }),
    confirmLabel: t("vsync.liftBlock"),
    run: async () => {
      await api.post(`${BASE}/tie`, { kind: row.kind, our_id: row.our_id, vfx_id: null, release: true });
      okToast(t("vsync.lifted"));
      refresh(true);
    },
  });

  const onUntieItem = (it) => {
    const p = it.payload || {};
    setAsk({
      tone: "danger", title: t("vsync.untieAskTitle"), message: t("vsync.untieDoubtBody"),
      confirmLabel: t("vsync.approve.untie"),
      run: async () => {
        await api.post(`${BASE}/tie`, {
          kind: p.role === "leader" ? "leader" : "profile", our_id: p.profile, vfx_id: null,
        });
        setKept((k) => ({ ...k, [it.id]: { ...it, outcome: "untied" } }));
        okToast(t("vsync.untied"));
        refresh(true);
      },
    });
  };

  const confirmAsk = async () => {
    if (!ask) return;
    setAskBusy(true);
    setAskErr("");
    try {
      await ask.run();
      setAsk(null);
    } catch (e) {
      setAskErr(errText(e, t));
    } finally {
      setAskBusy(false);
    }
  };

  const switchTab = (v) => {
    setTab(v);
    setKept({});
  };

  const untiedLeaders = useMemo(
    () => (data?.untied?.people || []).filter((p) => p.role === "leader")
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    [data],
  );
  const ctx = { t, tl, tx, names, untiedLeaders, busy, onApply, onDismiss, onUntieItem };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-64 rounded-2xl" />
        <SkeletonBlock className="h-10 w-80 rounded-xl" />
        <div className="rounded-2xl" style={CARD}><SkeletonTable rows={5} cols={4} /></div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="rounded-2xl" style={CARD}>
        <EmptyState showUploadLink={false} tone="danger" icon={AlertTriangle} height="h-48"
          title={t("vsync.loadFailed")} message={t("vsync.loadFailedBody")}
          action={(
            <Button size="lg" variant="secondary" icon={<RefreshCw size={14} />} loading={isFetching}
              onClick={() => refetch()}>
              {t("vsync.retry")}
            </Button>
          )} />
      </div>
    );
  }

  const items = data.items || [];
  const untiedN = ["cells", "people", "units"].reduce((a, k) => a + (data.untied?.[k]?.length || 0), 0);
  const tabs = [
    ["items", `${t("vsync.tab.items")} · ${items.length}`],
    ["untied", `${t("vsync.tab.untied")} · ${untiedN}`],
    ["ties", `${t("vsync.tab.ties")} · ${(data.ties || []).length}`],
    ["runs", t("vsync.tab.runs")],
  ];
  const view = tabs.some(([k]) => k === tab) ? tab : "items";

  return (
    <div className="space-y-4">
      {toastNode}
      <HeaderCard data={data} ctx={ctx} modeBusy={modeBusy} onMode={onMode}
        starting={starting} onStart={onStart} onCaps={() => setCapsOpen(true)} />

      <SegmentedToggle asTabs value={view} onChange={switchTab} options={tabs}
        ariaLabel={t("vsync.title")} />

      {view === "items" && (
        <ItemsTab items={items} decided={data.decided || []} kept={kept} ctx={ctx} />
      )}
      {view === "untied" && (
        <UntiedTab data={data} ctx={ctx} onTie={setTieTarget} />
      )}
      {view === "ties" && (
        <div className="space-y-4">
          <TiesTab ties={data.ties || []} ctx={ctx} onUntie={onUntie} />
          <BlockedCard rows={data.blocked || []} ctx={ctx} onLift={onLift} />
        </div>
      )}
      {view === "runs" && (
        <RunsTab runs={data.runs || []} ctx={ctx} onOpen={setRunOpen} />
      )}

      {capsOpen && (
        <CapsModal caps={data.caps} defaults={data.cap_defaults} ctx={ctx}
          onClose={() => setCapsOpen(false)}
          onSaved={(caps) => {
            qc.setQueryData(QK, (old) => (old ? { ...old, caps } : old));
            setCapsOpen(false);
            okToast(t("vsync.capsSaved"));
          }} />
      )}
      {tieTarget && (
        <TieModal key={`${tieTarget.kind}:${tieTarget.our_id}`} target={tieTarget} ctx={ctx}
          onClose={() => setTieTarget(null)}
          onDone={(res, target, picked) => {
            setTieTarget(null);
            okToast(fill(t("vsync.tiedOk"), {
              what: target.label || "—",
              vfx: target.vkind === "division" ? (picked.code || picked.id) : tl(picked.name || ""),
            }));
            refresh(true);
          }} />
      )}
      {runOpen != null && (
        <RunModal key={runOpen} id={runOpen} ctx={ctx} onClose={() => setRunOpen(null)} />
      )}

      <ConfirmDialog
        open={!!ask}
        tone={ask?.tone || "warning"}
        title={ask?.title}
        message={ask?.message}
        confirmLabel={ask?.confirmLabel}
        loading={askBusy}
        error={askErr}
        onConfirm={confirmAsk}
        onCancel={() => { if (!askBusy) { setAsk(null); setAskErr(""); } }}
      />
    </div>
  );
}
