import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, LayoutGrid, Hash, Users, Flag, UserCheck, Clock, Factory as FactoryIcon,
  Settings2, Activity, Pencil, ShieldCheck, CalendarDays, Timer, Wrench,
  Boxes, SearchX, AlertTriangle, Layers, Archive, Workflow, Target,
  Link2, History, CalendarClock,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Button from "../components/ui/Button";
import ErrorScreen from "../components/ui/ErrorScreen";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import CellFormModal from "../components/CellFormModal";
import { CellManagerDialog, PendingChip } from "../components/CellManagerPicker";
import GroupBadge from "../components/ui/GroupBadge";
import { wcGroupLabel } from "../utils/wcGroup";
import { SectionHead } from "../components/ui/DataTable";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { useCapabilities, CAP } from "../hooks/useCapabilities";
import { useAuth } from "../context/AuthContext";
import api from "../utils/api";

/**
 * One production cell's own page — /cells/:id, where every cell reference on
 * the platform lands (via components/ui/CellLink). Shows the WHOLE record:
 * codes, all four workshop names, the ownership chain (brigadir → shift →
 * factory, leader), the accounting flags (in_load, att_included) and the
 * cell's footprint across every table that keys on it.
 *
 * Access is a valid session only — deliberately NOT page.view.cells: cells
 * are pressable from attendance, setup times, production and quality, so
 * anyone who can see a cell somewhere may open its card (the backend read,
 * /api/profiles/cells/:id/details, is gated the same way). Everyone gets the
 * same read-only view; holders of admin.cells.manage additionally get the
 * shared CellFormModal (codes / names / owners — the same form as /cells)
 * and the «Zagruzkada hisoblanadi» (in_load) and «Jarayonlar» (one_process)
 * switches, written through the register's own PUT /api/profiles/admin/cells/:id.
 *
 * «Verifix» (the live sync, 2026-10-12): whether the cell is tied to a Verifix
 * subdivision and what Verifix calls it, who decides its «Boshqaruvchi» (the
 * Verifix seat, or a person), the dated changes still waiting for their shift
 * opening, the cell's dated history (newest first — a change reaches no day
 * already filed) and the spans it stood archived. The cell's own brigadir (or
 * an admin / a register editor) gets «Boshqaruvchini tanlash», the picker
 * dialog the /cells register opens too.
 */

// ── shared building blocks (Profile.jsx design language) ─────────────────────

function Card({ icon, title, right, children }) {
  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={icon} title={title} right={right} />
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, children, top = false }) {
  return (
    <div className={`flex ${top ? "items-start" : "items-center"} justify-between gap-3 py-2 border-b last:border-b-0`}
         style={{ borderColor: "var(--border)" }}>
      <span className={`flex ${top ? "items-start" : "items-center"} gap-2 flex-shrink-0`}>
        {Icon && <Icon size={13} className={top ? "mt-0.5" : ""} style={{ color: "var(--text-4)" }} />}
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
          {label}
        </span>
      </span>
      <span className="min-w-0 text-right text-[13px]" style={{ color: "var(--text-1)" }}>{children}</span>
    </div>
  );
}

// Status pill: colored dot + tinted body (Profile's StatusTag look).
function Tag({ color, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
          style={{ background: `${color}1f`, color, border: `1px solid ${color}40` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

function CodeChip({ children, muted = false }) {
  return (
    <span className="font-mono text-[11px] px-2 py-0.5 rounded-md whitespace-nowrap"
          style={{ background: "var(--bg-inner)", border: "1px solid var(--border)",
                   color: muted ? "var(--text-3)" : "var(--text-1)" }}>
      {children}
    </span>
  );
}

const GREEN = "#22c55e";
const GREY  = "#94a3b8";

// «Bitta jarayon» — a cell specialised for one process. A property of the
// cell, not a status, so it wears the neutral skin and never a traffic light.
function ProcChip({ children }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
          style={{ background: "var(--bg-inner)", color: "var(--text-1)", border: "1px solid var(--border-md)" }}>
      <Target size={11} aria-hidden="true" style={{ color: "var(--text-3)" }} />
      {children}
    </span>
  );
}

// Date-only ISO → localized short date, in the UI language (a browser-default
// locale reads as someone else's software on an uz/ru page).
const DT_LOCALE = { uz: "uz-Latn-UZ", uz_cyrl: "uz-Cyrl-UZ", ru: "ru-RU", en: "en-GB" };
function fmtDate(iso, lang) {
  if (!iso) return null;
  try {
    // T00:00:00 pins the date to the local day — a bare "YYYY-MM-DD" parses
    // as UTC midnight and can render as the previous day west of Greenwich.
    return new Date(`${iso}T00:00:00`).toLocaleDateString(DT_LOCALE[lang] || "ru-RU",
      { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

// "12 soat 30 daq" from a derived minute count. The register stores only the two
// clocks — the length is always computed, never a column — so a null here just
// means the pair is unusable (equal times), not that the hours are unknown.
function fmtDur(min, t) {
  if (min == null || !Number.isFinite(min) || min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m
    ? t("admin.shiftTimes.durFmt").replace("{h}", h).replace("{m}", m)
    : t("admin.shiftTimes.durFmtH").replace("{h}", h);
}

// The «Egasi» row: the name, then — muted, on the same line — the unit the
// owner's PROFILE stands in when that is not this cell's (or that it has none
// yet), and where the value came from: Verifix's one read, or a person on the
// cell form. The details are on hover.
function OwnerValue({ owner, unitId, t, tl, lang }) {
  if (!owner) return <span style={{ color: "var(--text-4)" }}>{t("admin.profiles.cellUnassigned")}</span>;
  const elsewhere = owner.manager_id == null
    ? t("admin.profiles.cellOwnerNoUnit")
    : owner.manager_id !== unitId && owner.unit ? tl(owner.unit) : null;
  const when = owner.at ? fmtDate(String(owner.at).slice(0, 10), lang) : null;
  const src = owner.src === "verifix" ? t("cellPage.ownerSrcVerifix")
    : owner.src === "manual" ? t("cellPage.ownerSrcManual") : null;
  const tip = [
    owner.vfx_name ? `Verifix: ${owner.vfx_name}${owner.vfx_job ? ` · ${owner.vfx_job}` : ""}` : null,
    owner.src === "manual" ? [owner.by, when].filter(Boolean).join(" · ") : when,
  ].filter(Boolean).join("\n");
  return (
    <span title={tip || undefined}>
      {tl(owner.name)}
      {elsewhere && (
        <span className="ml-1.5 text-[11px]" style={{ color: owner.manager_id == null ? "#eab308" : "var(--text-3)" }}>
          · {elsewhere}
        </span>
      )}
      {src && <span className="ml-1.5 text-[11px]" style={{ color: "var(--text-4)" }}>· {src}</span>}
    </span>
  );
}

// ── The «Verifix» section ─────────────────────────────────────────────────────

// "2026-10-13" → "13.10.2026".
const dmy = (iso) => {
  const s = String(iso || "");
  return s.length >= 10 ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : s;
};
const fill = (s, vars) =>
  String(s ?? "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));

// A dated link's field, as the register's own columns name it.
const FIELD_KEY = {
  manager_id: "admin.profiles.colSupervisor",
  leader_id: "admin.profiles.colCellManager",
  owner_id: "admin.profiles.colCellOwner",
  archived: "cellVfx.fArchived",
};
const SRC_KEY = {
  verifix: "cellVfx.src.verifix", manual: "cellVfx.src.manual",
  grandfather: "cellVfx.src.grandfather", release: "cellVfx.src.release",
};

// One value of a dated link: a unit / a profile by name, the archive as a word.
function linkValue(field, value, name, t, tl) {
  if (field === "archived") return t(value ? "cellVfx.archivedOn" : "cellVfx.archivedOff");
  if (name) return tl(name);
  if (value == null) return t(field === "manager_id" ? "admin.profiles.cellNoSupervisor" : "admin.profiles.cellUnassigned");
  return `#${value}`;
}

// One dated change: when it counts, which link, before → after, who decided.
function HistoryRow({ h, t, tl }) {
  const after = linkValue(h.field, h.value, h.value_name, t, tl);
  // A «grandfather» mark keeps the value (value == prev): it states who
  // decides from then on and moves nothing, so it prints no «X → X».
  const before = h.field === "archived" || h.prev === h.value ? null
    : h.prev == null && !h.prev_name ? null : linkValue(h.field, h.prev, h.prev_name, t, tl);
  const who = [SRC_KEY[h.src] ? t(SRC_KEY[h.src]) : h.src, h.by && h.src !== "verifix" ? tl(h.by) : null]
    .filter(Boolean).join(" · ");
  return (
    <li className="py-2 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2 flex-wrap min-w-0 text-[12px]">
        <span className="font-mono tabular-nums" style={{ color: "var(--text-3)" }}>{dmy(h.from)}</span>
        <span className="font-semibold" style={{ color: "var(--text-2)" }}>{t(FIELD_KEY[h.field] || h.field)}</span>
        {!h.applied && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border-md)" }}>
            <CalendarClock size={11} aria-hidden="true" style={{ color: "var(--text-3)" }} />
            {t("cellVfx.waiting")}
          </span>
        )}
        <span className="ml-auto text-[11px]" style={{ color: "var(--text-3)" }}>{who}</span>
      </div>
      <div className="mt-0.5 text-[13px] break-words" style={{ color: "var(--text-1)" }}>
        {before && <><span style={{ color: "var(--text-3)" }}>{before}</span> → </>}
        {after}
      </div>
    </li>
  );
}

const HISTORY_SHOWN = 8;

// The changes waiting for their opening, {field: {value, from, src, by}},
// each named off the history row that recorded it.
function namedPending(vfx) {
  const history = vfx?.history || [];
  return Object.entries(vfx?.pending || {}).map(([field, p]) => {
    const h = history.find((x) => x.field === field && !x.applied && x.from === p.from
                                  && String(x.value) === String(p.value));
    return { field, ...p, name: h?.value_name || null };
  });
}

function VerifixCard({ vfx, pending, owner, canPick, onPick, t, tl }) {
  const [all, setAll] = useState(false);
  const history = vfx.history || [];
  const spans = vfx.archived_spans || [];
  const shown = all ? history : history.slice(0, HISTORY_SHOWN);
  const manual = vfx.manager_mode === "manual";
  return (
    <Card
      icon={Link2}
      title={t("cellVfx.title")}
      right={canPick && (
        <Button size="sm" tint icon={<Flag size={12} />} onClick={onPick}>
          {t("cellMgr.pickTitle")}
        </Button>
      )}
    >
      <div className="-my-2">
        <InfoRow icon={Link2} label={t("cellVfx.link")}>
          {vfx.tied ? (
            <span className="inline-flex items-center gap-1.5 flex-wrap justify-end">
              <Tag color={GREEN}>{t("cellVfx.tied")}</Tag>
              {vfx.code && <span>{vfx.code}</span>}
              {vfx.state && vfx.state !== "A" && <Tag color={GREY}>{t("cellVfx.closed")}</Tag>}
            </span>
          ) : (
            <Tag color={GREY}>{t("cellVfx.untied")}</Tag>
          )}
        </InfoRow>
        <InfoRow icon={Flag} label={t("cellVfx.decides")}>
          {t(manual ? "cellVfx.modeManual" : "cellVfx.modeVerifix")}
        </InfoRow>
        <InfoRow icon={UserCheck} label={t("cellVfx.seat")}>
          {owner
            ? tl(owner.name)
            : <span style={{ color: "var(--text-3)" }}>
                {t(vfx.seat_employee ? "cellVfx.seatNoProfile" : "cellVfx.noSeat")}
              </span>}
        </InfoRow>
        {pending.length > 0 && (
          <InfoRow icon={CalendarClock} label={t("cellVfx.pending")} top>
            <span className="flex flex-col items-end gap-1">
              {pending.map((p) => (
                <span key={p.field} className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
                  <span className="text-[11px] flex-shrink-0" style={{ color: "var(--text-3)" }}>
                    {t(FIELD_KEY[p.field] || p.field)}:
                  </span>
                  <PendingChip from={p.from} name={linkValue(p.field, p.value, p.name, t, tl)} />
                </span>
              ))}
            </span>
          </InfoRow>
        )}
      </div>
      {!vfx.tied && (
        <p className="mt-2 text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>{t("cellVfx.untiedNote")}</p>
      )}

      <div className="mt-4">
        <div className="flex items-center gap-2 mb-1">
          <History size={13} style={{ color: "var(--text-4)" }} />
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
            {t("cellVfx.history")}
          </span>
        </div>
        <p className="text-[11px] leading-snug mb-1" style={{ color: "var(--text-3)" }}>{t("cellVfx.historyHint")}</p>
        {history.length === 0 ? (
          <p className="py-2 text-[12px]" style={{ color: "var(--text-3)" }}>{t("cellVfx.historyEmpty")}</p>
        ) : (
          <>
            <ul>
              {shown.map((h, i) => <HistoryRow key={`${i}-${h.field}-${h.from}-${h.at || ""}`} h={h} t={t} tl={tl} />)}
            </ul>
            {history.length > HISTORY_SHOWN && (
              <Button size="sm" variant="ghost" className="mt-1" onClick={() => setAll((v) => !v)}>
                {all ? t("cellVfx.less") : fill(t("cellVfx.more"), { n: history.length - HISTORY_SHOWN })}
              </Button>
            )}
          </>
        )}
      </div>

      {spans.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-1">
            <Archive size={13} style={{ color: "var(--text-4)" }} />
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
              {t("cellVfx.spans")}
            </span>
          </div>
          <ul>
            {[...spans].reverse().map((sp) => (
              <li key={`${sp.from}-${sp.to || ""}`} className="py-1 text-[13px] tabular-nums" style={{ color: "var(--text-1)" }}>
                {dmy(sp.from)} — {sp.to ? dmy(sp.to) : <span style={{ color: "var(--text-3)" }}>{t("cellVfx.spanOpen")}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// One footprint line: label left, "N days · last <date> · extras" right,
// muted "no data yet" when the table has nothing for this cell.
function ActRow({ icon: Icon, label, parts, none }) {
  const has = parts && parts.length > 0;
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0"
         style={{ borderColor: "var(--border)" }}>
      <span className="flex items-center gap-2 flex-shrink-0">
        {Icon && <Icon size={13} style={{ color: "var(--text-4)" }} />}
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
          {label}
        </span>
      </span>
      {has
        ? <span className="min-w-0 text-right text-[13px] tabular-nums" style={{ color: "var(--text-1)" }}>
            {parts.join(" · ")}
          </span>
        : <span className="text-right text-[12px]" style={{ color: "var(--text-4)" }}>{none}</span>}
    </div>
  );
}

// One accounting flag: label + state on the first line, the consequence
// spelled out under it at 11px/--text-3 (the FormField `hint` discipline —
// never --text-4, where the eye skips exactly the text that matters).
function FlagRow({ icon: Icon, label, control, hint }) {
  return (
    <div className="py-2 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between gap-3 min-w-0">
        <span className="flex items-center gap-2 flex-shrink-0">
          {Icon && <Icon size={13} style={{ color: "var(--text-4)" }} />}
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
            {label}
          </span>
        </span>
        {control}
      </div>
      <p className="mt-1.5 text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>{hint}</p>
    </div>
  );
}


export default function CellDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  // «Zagruzkada hisoblanadi» is written through the register's own PUT
  // (CAP_CELLS_MANAGE) from 2026-10-04, like every other field of a cell.
  const { can, isLoading: capLoading } = useCapabilities();
  const canEdit = !capLoading && can(CAP.CELLS_MANAGE);
  const qc = useQueryClient();
  const toast = useToast();
  const { auth } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["cell-details", id],
    queryFn: () => api.get(`/api/profiles/cells/${id}/details`).then((r) => r.data),
    // A dead id stays dead — retrying only delays the 404 screen.
    retry: (count, err) =>
      ![404, 422].includes(err?.response?.status) && count < 1,
  });

  // The edit modal's option lists — the register endpoint already ships them,
  // cached under the same key the /cells page uses, fetched only for editors.
  const { data: reg } = useQuery({
    queryKey: ["admin-cells"],
    queryFn: () => api.get("/api/profiles/admin/cells").then((r) => r.data),
    enabled: canEdit,
  });

  const inLoadMut = useMutation({
    mutationFn: (val) => api.put(`/api/profiles/admin/cells/${id}`, { in_load: val }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cell-details", id] });
      qc.invalidateQueries({ queryKey: ["admin-cells"] });
      toast.success(t("cellPage.saved"));
    },
    onError: (e) => toast.error(e?.response?.data?.detail || t("admin.profiles.error")),
  });

  // «Jarayonlar» — read by checklist task 3 alone (backend services/one_process).
  const procMut = useMutation({
    mutationFn: (val) => api.put(`/api/profiles/admin/cells/${id}`, { one_process: val }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cell-details", id] });
      qc.invalidateQueries({ queryKey: ["admin-cells"] });
      toast.success(t("cellPage.saved"));
    },
    onError: (e) => toast.error(e?.response?.data?.detail || t("admin.profiles.error")),
  });

  const back = (
    <button onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-[var(--text-2)] hover:text-[var(--text-1)] text-sm mb-5 transition-colors">
      <ArrowLeft size={15} /> {t("profile.back")}
    </button>
  );

  if (isLoading) {
    return (
      <Layout title={t("cellPage.title")}>
        <div className="mx-auto w-full max-w-4xl">
          {back}
          <div className="space-y-4">
            <div className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-4">
                <SkeletonBlock className="w-16 h-16 rounded-2xl" />
                <div className="flex-1">
                  <SkeletonBlock className="h-5 w-1/2 mb-2" />
                  <SkeletonBlock className="h-4 w-1/3" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SkeletonBlock className="h-56 w-full rounded-2xl" />
              <SkeletonBlock className="h-56 w-full rounded-2xl" />
              <SkeletonBlock className="h-40 w-full rounded-2xl" />
              <SkeletonBlock className="h-40 w-full rounded-2xl" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    // 422 = the :id segment isn't even a number — same "no such cell" story.
    const gone = [404, 422].includes(error?.response?.status);
    return (
      <Layout title={t("cellPage.title")}>
        <ErrorScreen
          inline
          tone={gone ? "neutral" : "danger"}
          icon={gone ? SearchX : AlertTriangle}
          code={gone ? "404" : undefined}
          title={gone ? t("cellPage.notFound") : t("error.title")}
          message={gone ? t("cellPage.notFoundMsg") : (error?.response?.data?.detail || t("error.reload"))}
          action={gone
            ? { label: t("profile.back"), onClick: () => navigate(-1) }
            : { label: t("error.reload"), onClick: () => refetch() }}
        />
      </Layout>
    );
  }

  const c = data.cell;
  const sup = data.supervisor;
  const leader = data.leader;
  // «Egasi» — the leader Verifix seats in the cell (null on a backend that
  // predates the slot, which reads exactly like a cell nobody owns).
  const owner = data.owner || null;
  const factory = data.factory;
  const act = data.activity || {};
  // Working hours come resolved from the server (own pair, or the shift default
  // it inherits). Undefined on a backend that predates the register — the row
  // then reads exactly like a cell whose hours nobody has set.
  const hours = data.hours || null;
  // The Verifix live sync's block (null on a backend that predates it).
  const vfx = data.verifix || null;
  const pending = namedPending(vfx);
  const pendOf = (field) => pending.find((p) => p.field === field) || null;
  // «13.10 dan: X» beside a value in force — a change already waiting.
  const pendChip = (field) => {
    const p = pendOf(field);
    return p ? <PendingChip from={p.from} name={linkValue(field, p.value, p.name, t, tl)} /> : null;
  };
  // Who may pick the «Boshqaruvchi» (backend `_may_pick_manager`): an admin or
  // a register editor anywhere, a brigadir on their own unit's cell.
  const canPick = !c.archived_at && (
    canEdit || auth?.role === "admin"
    || (auth?.role === "supervisor" && c.manager_id != null && Number(auth?.role_id) === c.manager_id));
  const onSavedText = (msg) => {
    qc.invalidateQueries({ queryKey: ["cell-details", id] });
    qc.invalidateQueries({ queryKey: ["admin-cells"] });
    if (msg) toast.success(msg);
  };

  // A cell is its CODE — the workshop name is never printed (utils/cellName.js),
  // so the hero states the code and the people answerable for it.
  const name = c.verifix_code || "";
  const factoryName = factory
    ? (factory[`name_${lang}`] || factory.name_ru || factory.name_uz || factory.code)
    : null;
  // att_included NULL = derived: a cell with a supervisor counts.
  const attResolved = c.att_included ?? !!sup;
  const context = [
    leader ? tl(leader.name) : null,
    sup ? tl(sup.name) : null,
    sup?.shift != null ? `${t("profile.shift")} ${sup.shift}` : null,
    factoryName,
  ].filter(Boolean).join(" · ");

  const days = (n) => t("cellPage.actDays").replace("{n}", String(n));
  const last = (d) => t("cellPage.actLast").replace("{date}", fmtDate(d, lang) || "");

  return (
    <Layout title={name}>
      <div className="mx-auto w-full max-w-4xl">
        {back}
        <div className="space-y-4">

          {c.archived_at && (
            <div className="rounded-2xl px-4 py-3 flex items-center gap-2.5 text-sm"
                 style={{ background: "rgba(148,163,184,0.12)", border: "1px solid rgba(148,163,184,0.28)", color: "var(--text-2)" }}>
              <Archive size={16} className="flex-shrink-0" style={{ color: "#94a3b8" }} />
              <span>
                {t("admin.profiles.cellArchivedBanner")
                  .replace("{date}", new Date(c.archived_at).toLocaleString("ru-RU", {
                    timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  }))
                  .replace("{by}", c.archived_by || "—")}
              </span>
            </div>
          )}

          {/* Identity hero */}
          <div className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
                   style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
                <LayoutGrid size={28} style={{ color: "var(--brand-text)" }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xl font-semibold leading-tight break-words tabular-nums" style={{ color: "var(--text-1)" }}>
                  {name}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {c.sap_code && <CodeChip muted>SAP · {c.sap_code}</CodeChip>}
                  {/* The work-centre group letter, right after the code it
                      qualifies (services/wc_group.py) — none for a lone cell. */}
                  {c.sap_code && <GroupBadge group={c.wc_group} title={wcGroupLabel(c.sap_code, c.wc_group)} />}
                  <Tag color={c.in_load ? GREEN : GREY}>
                    {t(c.in_load ? "cellPage.inLoadOn" : "cellPage.inLoadOff")}
                  </Tag>
                  {c.one_process && <ProcChip>{t("cellPage.oneProcessOn")}</ProcChip>}
                </div>
                {context && <div className="mt-1.5 text-xs" style={{ color: "var(--text-3)" }}>{context}</div>}
              </div>
              {canEdit && (
                <div className="flex-shrink-0 sm:self-start">
                  <Button icon={<Pencil size={13} />} onClick={() => setEditOpen(true)}>
                    {t("admin.profiles.edit")}
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

            {/* Codes — a cell is identified by them and by nothing else
                (utils/cellName.js); the stored workshop names are edited in the
                register's own form and never printed. */}
            <Card icon={Hash} title={t("cellPage.secIdentity")}>
              <div className="-my-2">
                <InfoRow icon={Hash} label={t("admin.profiles.colVerifixCode")}>
                  <span className="font-mono">{c.verifix_code}</span>
                </InfoRow>
                <InfoRow icon={Hash} label={t("admin.profiles.colSapCode")}>
                  {c.sap_code
                    ? <span className="font-mono">{c.sap_code}</span>
                    : <span style={{ color: "var(--text-4)" }}>—</span>}
                </InfoRow>
                <InfoRow icon={Layers} label={t("admin.profiles.colGroup")}>
                  {c.wc_group
                    ? <GroupBadge group={c.wc_group} title={wcGroupLabel(c.sap_code, c.wc_group)} />
                    : <span style={{ color: "var(--text-4)" }}>—</span>}
                </InfoRow>
              </div>
            </Card>

            {/* Ownership chain */}
            <Card icon={Users} title={t("cellPage.secOwnership")}>
              <div className="-my-2">
                <InfoRow icon={ShieldCheck} label={t("admin.profiles.colSupervisor")}>
                  {sup
                    ? <>
                        {tl(sup.name)}
                        {sup.archived && (
                          <span className="ml-1.5 text-[11px]" style={{ color: "var(--text-4)" }}>
                            · {t("cellPage.archived")}
                          </span>
                        )}
                      </>
                    : <span style={{ color: "var(--text-4)" }}>{t("admin.profiles.cellNoSupervisor")}</span>}
                  {pendOf("manager_id") && <span className="ml-1.5">{pendChip("manager_id")}</span>}
                </InfoRow>
                <InfoRow icon={Clock} label={t("profile.shift")}>
                  {sup?.shift != null ? sup.shift : <span style={{ color: "var(--text-4)" }}>—</span>}
                </InfoRow>
                <InfoRow icon={Timer} label={t("admin.shiftTimes.hoursLabel")}>
                  {hours && hours.start && hours.end && hours.source !== "none" ? (
                    <>
                      <span className="font-mono">{hours.start} → {hours.end}</span>
                      {fmtDur(hours.minutes, t) && (
                        <span className="ml-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>
                          · {fmtDur(hours.minutes, t)}
                        </span>
                      )}
                      <span className="ml-1.5 text-[11px]" style={{ color: "var(--text-4)" }}>
                        · {t(hours.source === "own"
                            ? "admin.shiftTimes.srcOwn"
                            : "admin.shiftTimes.srcDefault")}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: "var(--text-4)" }}>{t("admin.shiftTimes.notSet")}</span>
                  )}
                </InfoRow>
                <InfoRow icon={FactoryIcon} label={t("profile.factory")}>
                  {factoryName || <span style={{ color: "var(--text-4)" }}>—</span>}
                </InfoRow>
                <InfoRow icon={Flag} label={t("admin.profiles.colCellManager")}>
                  {leader
                    ? tl(leader.name)
                    : <span style={{ color: "var(--text-4)" }}>{t("admin.profiles.cellUnassigned")}</span>}
                  {vfx?.manager_mode === "manual" && (
                    <span className="ml-1.5 text-[11px]" style={{ color: "var(--text-3)" }} title={t("cellMgr.manualTip")}>
                      · {t("cellMgr.manual")}
                    </span>
                  )}
                  {pendOf("leader_id") && <span className="ml-1.5">{pendChip("leader_id")}</span>}
                </InfoRow>
                <InfoRow icon={UserCheck} label={t("admin.profiles.colCellOwner")}>
                  <OwnerValue owner={owner} unitId={c.manager_id} t={t} tl={tl} lang={lang} />
                </InfoRow>
              </div>
            </Card>

            {/* Accounting flags */}
            <Card icon={Settings2} title={t("cellPage.secFlags")}>
              <div className="-my-2">
                <FlagRow
                  icon={LayoutGrid}
                  label={t("cellPage.inLoad")}
                  hint={t("cellPage.inLoadHint")}
                  control={canEdit
                    ? <SegmentedToggle
                        size="sm"
                        ariaLabel={t("cellPage.inLoad")}
                        value={c.in_load ? "1" : "0"}
                        onChange={(v) => {
                          if (inLoadMut.isPending) return;
                          const want = v === "1";
                          if (want !== Boolean(c.in_load)) inLoadMut.mutate(want);
                        }}
                        options={[
                          { value: "1", label: t("profile.zagruzka.on") },
                          { value: "0", label: t("profile.zagruzka.off") },
                        ]}
                      />
                    : <Tag color={c.in_load ? GREEN : GREY}>
                        {t(c.in_load ? "cellPage.inLoadOn" : "cellPage.inLoadOff")}
                      </Tag>}
                />
                <FlagRow
                  icon={Workflow}
                  label={t("cellPage.oneProcess")}
                  hint={t("cellPage.oneProcessHint")}
                  control={canEdit
                    ? <SegmentedToggle
                        size="sm"
                        ariaLabel={t("cellPage.oneProcess")}
                        value={c.one_process ? "one" : "many"}
                        onChange={(v) => {
                          if (procMut.isPending) return;
                          const want = v === "one";
                          if (want !== Boolean(c.one_process)) procMut.mutate(want);
                        }}
                        options={[
                          { value: "one", label: t("cellPage.oneProcessOn") },
                          { value: "many", label: t("cellPage.oneProcessOff") },
                        ]}
                      />
                    : c.one_process
                      ? <ProcChip>{t("cellPage.oneProcessOn")}</ProcChip>
                      : <span className="text-[12px]" style={{ color: "var(--text-2)" }}>{t("cellPage.oneProcessOff")}</span>}
                />
                <FlagRow
                  icon={CalendarDays}
                  label={t("cellPage.attIncluded")}
                  hint={t("cellPage.attIncludedHint")}
                  control={
                    <Tag color={attResolved ? GREEN : GREY}>
                      {c.att_included == null
                        ? t("cellPage.attAuto")
                        : t(c.att_included ? "cellPage.attYes" : "cellPage.attNo")}
                    </Tag>}
                />
              </div>
            </Card>

            {/* Footprint across the cell-keyed tables */}
            <Card icon={Activity} title={t("cellPage.secActivity")}>
              <div className="-my-2">
                <ActRow
                  icon={CalendarDays}
                  label={t("cellPage.actAttendance")}
                  none={t("cellPage.actNone")}
                  parts={act.attendance?.days > 0 ? [
                    days(act.attendance.days),
                    last(act.attendance.last),
                    act.attendance.last_people > 0
                      ? t("cellPage.actPeople").replace("{n}", String(act.attendance.last_people))
                      : null,
                  ].filter(Boolean) : []}
                />
                <ActRow
                  icon={Timer}
                  label={t("cellPage.actOjidaniya")}
                  none={t("cellPage.actNone")}
                  parts={act.ojidaniya?.days > 0 ? [
                    days(act.ojidaniya.days),
                    last(act.ojidaniya.last),
                  ] : []}
                />
                <ActRow
                  icon={Wrench}
                  label={t("cellPage.actPerenaladka")}
                  none={t("cellPage.actNone")}
                  parts={act.perenaladka?.days > 0 ? [
                    days(act.perenaladka.days),
                    last(act.perenaladka.last),
                    `Σ ${t("cellPage.actMin").replace("{n}", String(Math.round(act.perenaladka.minutes || 0)))}`,
                  ] : []}
                />
                <ActRow
                  icon={Boxes}
                  label={t("cellPage.actProduction")}
                  none={c.sap_code ? t("cellPage.actNone") : t("cellPage.noSap")}
                  parts={act.production?.days > 0 ? [
                    days(act.production.days),
                    last(act.production.last),
                  ] : []}
                />
              </div>
            </Card>

            {vfx && (
              <div className="lg:col-span-2 min-w-0">
                <VerifixCard vfx={vfx} pending={pending} owner={owner} canPick={canPick}
                             onPick={() => setPickOpen(true)} t={t} tl={tl} />
              </div>
            )}

          </div>
        </div>

        {/* Admin edit — the same form the /cells register opens */}
        {editOpen && (
          <CellFormModal
            mode="edit"
            // The form reads the waiting changes and the seat's name off the
            // register's row shape; this page holds them apart.
            item={{ ...c, pending: vfx?.pending || {}, owner: owner?.name || null }}
            units={(reg?.supervisors ?? []).filter((s) => !s.archived)}
            leaders={reg?.leaders ?? []}
            onClose={() => setEditOpen(false)}
            onSaved={onSavedText}
          />
        )}

        {/* The «Boshqaruvchi» picker alone — a brigadir's door on their cell */}
        {pickOpen && (
          <CellManagerDialog
            cell={c}
            subtitle={sup ? tl(sup.name) : undefined}
            onClose={() => setPickOpen(false)}
            onSaved={onSavedText}
          />
        )}

        {toast.node}
      </div>
    </Layout>
  );
}
