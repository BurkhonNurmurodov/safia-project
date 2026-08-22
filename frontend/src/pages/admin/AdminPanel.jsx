import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import {
  Database, Languages, Users, ShieldCheck, Factory, IdCard, Megaphone, Trash2,
  ListChecks, KeyRound, History, DatabaseBackup, ClipboardCheck,
  Sliders, ChevronDown, X, AlertTriangle, Building2, Clock, GitBranch, UserX,
} from "lucide-react";
import Layout from "../../components/layout/Layout";
import { useLang } from "../../context/LangContext";
import { useAuth } from "../../context/AuthContext";
import { useCapabilities } from "../../hooks/useCapabilities";
import { usePersistentState } from "../../hooks/usePersistentState";
import ConfirmDialog from "../../components/ui/ConfirmDialog";

import TranslationsEditor from "./TranslationsEditor";
import UsersManagement from "./UsersManagement";
import ProfilesManagement from "./ProfilesManagement";
import FactoriesAdmin from "./Factories";
import PageAccess from "./PageAccess";
import Permissions from "./Permissions";
import ProductionUpload from "./ProductionUpload";
import AttendanceUpload from "./AttendanceUpload";
import Broadcast from "./Broadcast";
import AttendanceCleanup from "./AttendanceCleanup";
import ActionHistory from "./ActionHistory";
import LeaderTasksAdmin from "./LeaderTasksAdmin";
import DbBackup from "./DbBackup";
import DataSources from "./DataSources";
import DisplaySettings from "./DisplaySettings";
import ShiftTimes from "./ShiftTimes";
import IdleSource from "./IdleSource";
import LostWorkers from "./LostWorkers";

/**
 * The admin panel shell.
 *
 * What this replaces: fifteen destinations rendered as equal pills in ONE
 * horizontally-scrolling SegmentedToggle, with the scrollbar hidden. At 390px —
 * the Telegram WebView this product actually runs in — about three fitted, there
 * was no hint the other twelve existed, and nothing scrolled the selected one
 * into view, so whenever your current destination sat off-screen NOTHING on the
 * page looked selected. A full-database restore was a visual peer of a file
 * upload. That flat strip was the root of "structured awfully".
 *
 * The model here: destinations are grouped by the JOB they belong to, and the
 * navigation is persistent instead of a strip you scroll past. Daily upload work
 * is first, irreversible tools are last and marked, and the panel lives inside
 * the app's own Layout so admins keep the notifications bell, Settings and
 * profile they lose on every other screen of this panel.
 *
 * ONE array drives everything — order, grouping, landing tab and capability
 * filtering. The old code kept two parallel ordered lists of the same ids that
 * had already drifted: a grantee's computed landing tab was picked from one and
 * displayed by the other, so the selected tab was not the leftmost one they saw.
 */

const GROUPS = [
  { id: "daily",  labelKey: "admin.group.daily" },
  { id: "people", labelKey: "admin.group.people" },
  { id: "tools",  labelKey: "admin.group.tools" },
  { id: "danger", labelKey: "admin.group.danger", danger: true },
];

export const ADMIN_NAV = [
  // Daily — the upload rhythm, in the order the day runs.
  { id: "attendance",   group: "daily",  Icon: ClipboardCheck, labelKey: "admin.tabAttendance",   descKey: "admin.desc.attendance" },
  { id: "data",         group: "daily",  Icon: Database,       labelKey: "admin.tabData",         descKey: "admin.desc.data" },
  { id: "production",   group: "daily",  Icon: Factory,        labelKey: "admin.tabProduction",   descKey: "admin.desc.production" },

  { id: "users",        group: "people", Icon: Users,          labelKey: "admin.tabUsers",        descKey: "admin.desc.users" },
  { id: "profiles",     group: "people", Icon: IdCard,         labelKey: "admin.tabProfiles",     descKey: "admin.desc.profiles" },
  // Sits with the identity registers, directly after the supervisor profiles it
  // assigns: factory → supervisor → cell → leader is one chain, and this is its
  // top link. Not in "daily" — it is configured once and then rarely touched.
  { id: "factories",    group: "people", Icon: Building2,      labelKey: "admin.tabFactories",    descKey: "admin.desc.factories" },
  { id: "access",       group: "people", Icon: ShieldCheck,    labelKey: "admin.tabAccess",       descKey: "admin.desc.access" },
  { id: "permissions",  group: "people", Icon: KeyRound,       labelKey: "admin.tabPermissions",  descKey: "admin.desc.permissions" },
  { id: "actions",      group: "people", Icon: History,        labelKey: "admin.tabActions",      descKey: "admin.desc.actions" },

  { id: "broadcast",    group: "tools",  Icon: Megaphone,      labelKey: "admin.tabBroadcast",    descKey: "admin.desc.broadcast" },
  { id: "ltasks",       group: "tools",  Icon: ListChecks,     labelKey: "admin.tabLtasks",       descKey: "admin.desc.ltasks" },
  // The cells' working start/end register — per-shift defaults a cell inherits,
  // its own pair overriding them. A register only: nothing scores off it yet.
  { id: "shifttimes",   group: "tools",  Icon: Clock,          labelKey: "admin.tabShiftTimes",   descKey: "admin.desc.shifttimes" },
  // Per-supervisor switch for WHERE a unit's ojidaniya minutes come from — the
  // «Смена отчёт» sheet row (everybody's default) or the headcount-weighted
  // per-cell interval model from a given date. The only place the rule shows.
  { id: "idlesource",   group: "tools",  Icon: GitBranch,      labelKey: "admin.tabIdleSource",   descKey: "admin.desc.idlesource" },
  // READ-ONLY audit of workers an approved → supervisor exchange left on no
  // roster (an upload wiped the receiving unit's day and nothing put them back).
  // A report, not a repair: restoring a row moves that day's historical numbers.
  { id: "lostworkers",  group: "tools",  Icon: UserX,          labelKey: "admin.tabLostWorkers",  descKey: "admin.desc.lostworkers" },
  { id: "translations", group: "tools",  Icon: Languages,      labelKey: "admin.tabTranslations", descKey: "admin.desc.translations" },
  // Split out of the old "data" tab, which was a junk drawer: a daily uploader
  // and two chart-colour editors for two OTHER pages, invisible below the fold
  // and unguessable from the tab name. `capKey` keeps it reachable by exactly
  // the people who could reach it before — the backend grants "data", and
  // splitting the UI must not quietly narrow anyone's access.
  { id: "display",      group: "tools",  Icon: Sliders,        labelKey: "admin.tabDisplay",      descKey: "admin.desc.display", capKey: "data" },

  { id: "cleanup",      group: "danger", Icon: Trash2,         labelKey: "admin.tabCleanup",      descKey: "admin.desc.cleanup", danger: true },
  { id: "dbdump",       group: "danger", Icon: DatabaseBackup, labelKey: "admin.tabDbDump",       descKey: "admin.desc.dbdump",  danger: true },
];

const VIEWS = {
  attendance:   AttendanceUpload,
  data:         DataSources,
  production:   ProductionUpload,
  users:        UsersManagement,
  profiles:     ProfilesManagement,
  factories:    FactoriesAdmin,
  access:       PageAccess,
  permissions:  Permissions,
  actions:      ActionHistory,
  broadcast:    Broadcast,
  ltasks:       LeaderTasksAdmin,
  shifttimes:   ShiftTimes,
  idlesource:   IdleSource,
  lostworkers:  LostWorkers,
  translations: TranslationsEditor,
  display:      DisplaySettings,
  cleanup:      AttendanceCleanup,
  dbdump:       DbBackup,
};

// ─── Unsaved-changes guard ────────────────────────────────────────────────────
// Switching destinations unmounts the previous one, and four of them hold their
// drafts in local state (page-access matrix, translation edits, capability
// draft, broadcast composer). One accidental tap used to destroy a whole
// translation pass with no warning. Any destination with pending edits calls
// useAdminDirty(true) and the shell interposes a confirm.

const DirtyCtx = createContext(() => {});

export function useAdminDirty(isDirty) {
  const setDirty = useContext(DirtyCtx);
  useEffect(() => {
    setDirty(!!isDirty);
    return () => setDirty(false);
  }, [isDirty, setDirty]);
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function NavItem({ item, active, onClick, t }) {
  const { Icon } = item;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors"
      style={{
        background: active ? "var(--brand-bg)" : "transparent",
        color: active ? "var(--brand-text)" : "var(--text-2)",
        border: `1px solid ${active ? "var(--brand-border)" : "transparent"}`,
        fontWeight: active ? 600 : 500,
      }}
    >
      <Icon
        size={15}
        className="flex-shrink-0"
        style={{ color: active ? "var(--brand-text)" : item.danger ? "#ef4444" : "var(--text-3)" }}
      />
      <span className="text-xs truncate flex-1">{t(item.labelKey)}</span>
      {item.test && (
        <span
          className="text-[9px] px-1 py-0.5 rounded font-semibold flex-shrink-0"
          style={{ background: "rgba(234,179,8,0.15)", color: "#eab308" }}
        >
          TEST
        </span>
      )}
    </button>
  );
}

function NavGroups({ items, active, onPick, t }) {
  return (
    <div className="space-y-4">
      {GROUPS.map((g) => {
        const groupItems = items.filter((n) => n.group === g.id);
        if (!groupItems.length) return null;
        return (
          <div key={g.id}>
            <div
              className="flex items-center gap-1.5 px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: g.danger ? "#ef4444" : "var(--text-4)" }}
            >
              {g.danger && <AlertTriangle size={10} />}
              {t(g.labelKey)}
            </div>
            <div className="space-y-0.5">
              {groupItems.map((n) => (
                <NavItem key={n.id} item={n} active={n.id === active} onClick={() => onPick(n.id)} t={t} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Phone navigation: a grouped sheet, so no destination is ever off-screen. */
function NavSheet({ items, active, onPick, onClose, t }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portaled to body: `.page-enter`'s animated transform makes it the containing
  // block for position:fixed children, so an in-tree sheet would anchor to the
  // page instead of the viewport.
  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.6)", zIndex: 90 }}
      onClick={onClose}
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
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>
            {t("admin.title")}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.cancel")}
            className="p-2 rounded-lg"
            style={{ color: "var(--text-3)" }}
          >
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto px-3 py-3">
          <NavGroups items={items} active={active} onPick={onPick} t={t} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function AdminPanel() {
  const { t } = useLang();
  const { auth } = useAuth();
  // Non-admins reach this panel only through a capability grant, and then see
  // ONLY the destinations that grant covers (RequireAdminPanel in App.jsx lets
  // them in on the same basis). "permissions" is deliberately absent from every
  // grant path: handing out powers stays a real admin's job.
  const { capTabs, isLoading: capsLoading } = useCapabilities();
  const isAdmin = auth?.role === "admin";

  const items = useMemo(
    () => ADMIN_NAV.filter((n) => isAdmin || capTabs.includes(n.capKey ?? n.id)),
    [isAdmin, capTabs.join(",")], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const ids = items.map((n) => n.id);

  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get("tab");
  const [storedTab, setStoredTab] = usePersistentState("admin_tab", "attendance");

  const [dirty, setDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deniedTab, setDeniedTab] = useState(null);

  // ?tab= (the bot's notification buttons deep-link it) beats the remembered
  // destination; the remembered one beats the first allowed.
  const active = useMemo(() => {
    if (urlTab && ids.includes(urlTab)) return urlTab;
    if (ids.includes(storedTab)) return storedTab;
    return ids[0] ?? null;
  }, [urlTab, storedTab, ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // A deep link to a destination this person may not open used to snap them
  // somewhere unrelated with no explanation. Say so instead.
  useEffect(() => {
    if (capsLoading || !urlTab || ids.length === 0) return;
    setDeniedTab(ids.includes(urlTab) ? null : urlTab);
  }, [urlTab, ids.join(","), capsLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (active && active !== storedTab) setStoredTab(active);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  function commitNav(id) {
    setDirty(false);
    setStoredTab(id);
    setDeniedTab(null);
    // Pushed, not replaced: the back gesture should return to the destination
    // you came from rather than dropping you out of the panel entirely.
    setSearchParams({ tab: id });
    setSheetOpen(false);
  }

  function go(id) {
    if (id === active) { setSheetOpen(false); return; }
    if (dirty) { setPendingNav(id); return; }
    commitNav(id);
  }

  const current = items.find((n) => n.id === active) ?? null;
  const currentGroup = GROUPS.find((g) => g.id === current?.group);
  const View = active ? VIEWS[active] : null;
  // A grantee holding one destination got the whole strip machinery rendering a
  // single pill — a navigation control with nowhere to navigate.
  const showNav = items.length > 1;

  return (
    <DirtyCtx.Provider value={setDirty}>
      <Layout title={t("admin.title")}>
        <div className="flex gap-6 items-start">
          {showNav && (
            <nav
              className="hidden lg:block w-56 flex-shrink-0 sticky top-0 rounded-2xl p-2.5"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
              aria-label={t("admin.title")}
            >
              <NavGroups items={items} active={active} onPick={go} t={t} />
            </nav>
          )}

          {/* ONE content frame. Every destination used to pick its own width —
              3xl / 4xl / 5xl / 6xl — so the column jumped width and left edge on
              every switch, which reads as instability even when each screen is
              individually fine. */}
          <div className="flex-1 min-w-0 max-w-6xl">
            {showNav && (
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={sheetOpen}
                aria-label={`${t("admin.title")} — ${current ? t(current.labelKey) : ""}`}
                className="lg:hidden w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl mb-4"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)" }}
              >
                {current?.Icon && (
                  <current.Icon
                    size={16}
                    className="flex-shrink-0"
                    style={{ color: current.danger ? "#ef4444" : "var(--brand-text)" }}
                  />
                )}
                <span className="flex-1 min-w-0 text-left">
                  <span className="block text-[10px] uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
                    {currentGroup ? t(currentGroup.labelKey) : ""}
                  </span>
                  <span className="block text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>
                    {current ? t(current.labelKey) : ""}
                  </span>
                </span>
                <ChevronDown size={16} style={{ color: "var(--text-3)" }} className="flex-shrink-0" />
              </button>
            )}

            {deniedTab && (
              <div
                className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs mb-4"
                style={{ background: "rgba(234,179,8,0.10)", border: "1px solid rgba(234,179,8,0.30)", color: "#a16207" }}
              >
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                <span>{t("admin.tabDenied")}</span>
              </div>
            )}

            {/* The active destination names itself, so identity never depends on
                a pill that may be scrolled out of sight. */}
            {current && (
              <div className="mb-4">
                <h2 className="text-base font-bold flex items-center gap-2" style={{ color: "var(--text-1)" }}>
                  {t(current.labelKey)}
                  {current.danger && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider"
                      style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}
                    >
                      {t("admin.group.danger")}
                    </span>
                  )}
                </h2>
                <p className="text-xs mt-0.5 leading-snug" style={{ color: "var(--text-3)" }}>
                  {t(current.descKey)}
                </p>
              </div>
            )}

            {View ? <View /> : null}
          </div>
        </div>

        {sheetOpen && (
          <NavSheet items={items} active={active} onPick={go} onClose={() => setSheetOpen(false)} t={t} />
        )}

        <ConfirmDialog
          open={!!pendingNav}
          title={t("admin.unsavedTitle")}
          message={t("admin.unsavedMsg")}
          confirmLabel={t("admin.unsavedDiscard")}
          onCancel={() => setPendingNav(null)}
          onConfirm={() => { const id = pendingNav; setPendingNav(null); commitNav(id); }}
        />
      </Layout>
    </DirtyCtx.Provider>
  );
}
