// The admin app's pages — THE list (order, grouping, icons, labels and
// capability filtering). Every admin page is a route of its own, /panel/<id>
// (pages/admin/AdminPage.jsx is the frame, pages/admin/adminPages.js the lazy
// page map); the sidebar, the header search, the launcher tile and the browser
// tab title all derive from this list. Never keep a second copy.
import {
  AlertTriangle, BellRing, Building2, CalendarDays, CircleSlash, ClipboardCheck, ClipboardList, Clock, Database, DatabaseBackup, Factory, FileClock, Fingerprint, GitBranch, GraduationCap, History, IdCard, KeyRound, Languages, ListChecks, Megaphone, RefreshCcwDot, ScrollText, ShieldCheck, ShieldQuestion, Sparkles, SquareKanban, CookingPot, Trash2, UserMinus, UserX, Users, UsersRound, Wrench,
} from "lucide-react";

// The admin app's home; /panel/<id> is a page. The old single page,
// /admin/upload?tab=<id>, redirects here (App.jsx), so a link already sent in
// Telegram keeps working.
export const ADMIN_HOME = "/panel";
export const adminPage = (id) => `${ADMIN_HOME}/${id}`;

// May this viewer open this page? Admins open every page; anybody else only
// the pages their capability grants name (capability_tabs on the server).
export const adminAllows = (n, isAdmin, capTabs = []) => isAdmin || capTabs.includes(n.capKey ?? n.id);

// The first page a viewer may open, in register order — null when none.
export const firstAdminPage = (isAdmin, capTabs = []) => ADMIN_NAV.find((n) => adminAllows(n, isAdmin, capTabs)) ?? null;

// The four sections of the admin app's sidebar. `icon` heads each folder and
// is deliberately none of the page icons inside it.
export const ADMIN_GROUPS = [
  { id: "daily",  labelKey: "admin.group.daily",  icon: CalendarDays },
  { id: "people", labelKey: "admin.group.people", icon: UsersRound },
  { id: "tools",  labelKey: "admin.group.tools",  icon: Wrench },
  { id: "danger", labelKey: "admin.group.danger", icon: AlertTriangle, danger: true },
];

export const ADMIN_NAV = [
  // Daily — the upload rhythm, in the order the day runs.
  { id: "attendance",   group: "daily",  Icon: ClipboardCheck, labelKey: "admin.tabAttendance",   descKey: "admin.desc.attendance" },
  // «Davomat (Verifix)» — the same day read from Verifix instead of a file,
  // the загрузка's cells only, saved apart (a TEST: nothing reads it). No
  // capKey: it reads attendance with the platform's Verifix login, so like the
  // «Verifix» card it is admin-only and never grantable.
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
  // Every change on the platform, by category — one register nothing writes to
  // twice: read-only and append-only. Sits with the other accountability
  // surfaces, and carries no `capKey`, so like "permissions" it is admin-only.
  { id: "logs",         group: "people", Icon: ScrollText,     labelKey: "admin.tabLogs",         descKey: "admin.desc.logs" },

  { id: "broadcast",    group: "tools",  Icon: Megaphone,      labelKey: "admin.tabBroadcast",    descKey: "admin.desc.broadcast" },
  { id: "ltasks",       group: "tools",  Icon: ListChecks,     labelKey: "admin.tabLtasks",       descKey: "admin.desc.ltasks" },
  // What the leaders actually FILED, in both collection layers — the Google
  // Form rows and the bot days — with the proofs behind them, the per-task
  // reopen, and the choice of which submission counts on a day that holds
  // both. Sits directly under the matrix that CONFIGURES those tasks: one
  // configures the checklist, the other reads what came back. It can delete a
  // scored day and move a leader's score, so the one grant that admits it is
  // «Lider nazorati — admin» (`leaders.admin`, whose tab list names all four
  // leader destinations — the tab id IS the key, so no `capKey`).
  { id: "ltdaily",      group: "tools",  Icon: ClipboardList,  labelKey: "admin.tabLtDaily",      descKey: "admin.desc.ltdaily" },
  // Leader-days taken OUT of the results — the one control that makes a day
  // count NEITHER way, for the leader and their brigadir at once. Sits with the
  // other two leader surfaces: one configures the checklist, one reads what came
  // back, this one says which of it counts. Admitted only by «Lider nazorati —
  // admin», like "ltdaily" — it moves a leader's score and a brigadir's.
  { id: "ltexclude",    group: "tools",  Icon: CircleSlash,    labelKey: "admin.tabLtExclude",    descKey: "admin.desc.ltexclude" },
  // The same "does not count" about a PERSON instead of a night: a leader whose
  // results stop from a date on, open-ended. Sits immediately after the day
  // exclusions because the two are read together and are constantly mistaken
  // for one another. Admitted only by «Lider nazorati — admin», like its
  // neighbour.
  { id: "ltcutoff",     group: "tools",  Icon: UserMinus,      labelKey: "admin.tabLtCutoff",     descKey: "admin.desc.ltcutoff" },
  // «Imtihon» — the dashboard exam: assign it, read the results, edit the
  // bank. Grantable through `admin.exam.manage` (tab id = capability tab).
  { id: "exam",         group: "tools",  Icon: GraduationCap,  labelKey: "admin.tabExam",         descKey: "admin.desc.exam" },
  // The cells' working start/end register — per-shift defaults a cell inherits,
  // its own pair overriding them. A register only: nothing scores off it yet.
  { id: "shifttimes",   group: "tools",  Icon: Clock,          labelKey: "admin.tabShiftTimes",   descKey: "admin.desc.shifttimes" },
  // Per-supervisor switch for WHERE a unit's ojidaniya minutes come from — the
  // «Смена отчёт» sheet row (everybody's default) or the headcount-weighted
  // per-cell interval model from a given date. The only place the rule shows.
  { id: "idlesource",   group: "tools",  Icon: GitBranch,      labelKey: "admin.tabIdleSource",   descKey: "admin.desc.idlesource" },
  // WHO answers for each ojidaniya category — the name printed beside a cause
  // on every by-category surface, and the SCOPE of the «Kutish mas'uli» role.
  // No capKey: the assignment decides what a whole role may read, so handing
  // it out is handing out the ability to widen somebody's scope (the
  // `permissions` / `logs` model — admin-only and never grantable).
  { id: "idleowners",   group: "tools",  Icon: ShieldQuestion, labelKey: "admin.tabIdleOwners",   descKey: "admin.desc.idleowners" },
  // READ-ONLY audit of workers an approved → supervisor exchange left on no
  // roster (an upload wiped the receiving unit's day and nothing put them back).
  // A report, not a repair: restoring a row moves that day's historical numbers.
  { id: "lostworkers",  group: "tools",  Icon: UserX,          labelKey: "admin.tabLostWorkers",  descKey: "admin.desc.lostworkers" },
  // Cross-document HR history: rejected-then-approved, posted long after the
  // document's own date, or repeatedly approved/cancelled. Read-only.
  { id: "docaudit",     group: "tools",  Icon: FileClock,      labelKey: "admin.tabDocAudit",     descKey: "admin.desc.docaudit" },
  // The Verifix API connection: a dedicated read-only login (password sealed
  // server-side, never shown back) and a connection test that counts what
  // each form returns. No capKey: this login reads every employee's
  // attendance, so it is admin-only and never grantable.
  { id: "verifix",      group: "tools",  Icon: Fingerprint,    labelKey: "admin.tabVerifix",      descKey: "admin.desc.verifix" },
  // «Verifix sinxron» — cells, leaders and brigadirs FOLLOW Verifix through a
  // stored Verifix id (docs/plan-verifix-live-sync.md): the sync's mode and
  // caps, the queue of what it will not write by itself, the hand ties and the
  // pass log. No capKey: it moves people, cells and access — admin-only and
  // never grantable (the `permissions` / `logs` model).
  { id: "verifixsync",  group: "tools",  Icon: RefreshCcwDot,  labelKey: "admin.tabVerifixSync",  descKey: "admin.desc.verifixsync" },
  // «AI kalitlari» — EVERY AI API key, and which key + model each feature
  // runs on (the proof checker, the assistant's chat and voice, both weekly
  // reports). No capKey: these are the platform's paid accounts — admin-only
  // and never grantable (the `verifix` model). Keys are set nowhere else.
  { id: "aikeys",       group: "tools",  Icon: Sparkles,       labelKey: "admin.tabAiKeys",       descKey: "admin.desc.aikeys" },
  // «Trello» — the API key and the (sealed) token /trello reads boards with,
  // the boards it reads and what «done» means on each. No capKey: the token
  // reads every board its Trello member can open — admin-only, never grantable.
  { id: "trello",       group: "tools",  Icon: SquareKanban,   labelKey: "admin.tabTrello",       descKey: "admin.desc.trello" },
  // «Pechlar» — which Revent ovens the factory-LAN collector reads, at which
  // address. No capKey: the list is where the collector is sent — admin-only.
  { id: "ovens",        group: "tools",  Icon: CookingPot,     labelKey: "admin.tabOvens",        descKey: "admin.desc.ovens" },
  // «Notion eslatmalari» — the Notion task list's daily Telegram reminders
  // (moved from the GitHub bot, 2026-11-02): schedule, groups, team and the
  // bot's sealed token. No capKey: admin-only, never grantable.
  { id: "notiontracker", group: "tools", Icon: BellRing,       labelKey: "admin.tabNotionTracker", descKey: "admin.desc.notiontracker" },
  { id: "translations", group: "tools",  Icon: Languages,      labelKey: "admin.tabTranslations", descKey: "admin.desc.translations" },
  // «Ko'rinish» — the chart-colour editors — is gone (2026-09-24): every table
  // on /zagruzka now carries its own colour bands and its own admin button.

  { id: "cleanup",      group: "danger", Icon: Trash2,         labelKey: "admin.tabCleanup",      descKey: "admin.desc.cleanup", danger: true },
  { id: "dbdump",       group: "danger", Icon: DatabaseBackup, labelKey: "admin.tabDbDump",       descKey: "admin.desc.dbdump",  danger: true },
];
