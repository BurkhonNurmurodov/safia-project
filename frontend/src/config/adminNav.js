// The admin app's pages — THE list (order, grouping, icons, labels and
// capability filtering). Every admin page is a route of its own, /panel/<id>
// (pages/admin/AdminPage.jsx is the frame, pages/admin/adminPages.js the lazy
// page map); the sidebar, the header search, the launcher tile and the browser
// tab title all derive from this list. Never keep a second copy.
import {
  BellRing, Building2, CalendarDays, CircleSlash, ClipboardCheck, ClipboardList, Clock, Database, DatabaseBackup, Factory, FileClock, Fingerprint, GraduationCap, IdCard, KeyRound, Languages, ListChecks, Megaphone, Network, RefreshCcwDot, ScanSearch, ScrollText, ShieldQuestion, Sparkles, SquareKanban, CookingPot, Crown, Plug, SlidersHorizontal, Trash2, UserMinus, UserX, Users, UsersRound, Wrench,
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

// The six folders of the admin app's sidebar (2026-11-16; four until then —
// «Vositalar» held 19 of the 32 pages). `icon` heads each folder and is
// deliberately none of the page icons inside it. The ids are NEW on purpose:
// a layout saved on the org chart still names the old four, and
// utils/navLayout.js drops those (`RETIRED_TABS`), so their pages land here.
export const ADMIN_GROUPS = [
  { id: "adm-daily",   labelKey: "admin.group.daily",        icon: CalendarDays },
  { id: "adm-people",  labelKey: "admin.group.people",       icon: UsersRound },
  { id: "adm-leaders", labelKey: "admin.group.leaders",      icon: Crown },
  { id: "adm-plant",   labelKey: "admin.group.plant",        icon: SlidersHorizontal },
  { id: "adm-links",   labelKey: "admin.group.integrations", icon: Plug },
  { id: "adm-system",  labelKey: "admin.group.system",       icon: Wrench },
];

// Pages retired into another one (2026-11-16): the old address — a bookmark,
// a link in a Telegram message, a tab left open — lands on the page that does
// the job now. AdminPage.jsx reads this before ADMIN_NAV.
export const RETIRED_ADMIN = {
  access: "/panel/orgchart?v=apps",   // «Sahifalar (rol bo'yicha)» → the org chart's «Ilovalar» role ticks
  actions: "/panel/logs?via=grant",   // «Harakatlar tarixi» → «Jurnal», only what was done through a grant
  idlesource: "/panel/idleowners",    // «Kutish manbasi» — every unit reads its cells from 27 Aug 2026
};

export const ADMIN_NAV = [
  // Daily — what an admin opens every day, in the order the day runs.
  { id: "attendance",   group: "adm-daily",   Icon: ClipboardCheck, labelKey: "admin.tabAttendance",   descKey: "admin.desc.attendance" },
  { id: "production",   group: "adm-daily",   Icon: Factory,        labelKey: "admin.tabProduction",   descKey: "admin.desc.production" },
  { id: "broadcast",    group: "adm-daily",   Icon: Megaphone,      labelKey: "admin.tabBroadcast",    descKey: "admin.desc.broadcast" },

  // People & access — who is on the platform and what each may open.
  // «Tashkiliy tuzilma» — everybody on the platform as one chart: where they
  // stand, which pages they open, what was granted to them personally, and
  // the way to their «Xodim kartasi». Read-only, and first in its section: it
  // is the map of the registers under it. No capKey — it shows the whole
  // permission system (the `permissions` model: admin-only, never grantable).
  // `wide`: a canvas, so AdminPage gives it the full content width.
  { id: "orgchart",     group: "adm-people",  Icon: Network,        labelKey: "admin.tabOrgChart",     descKey: "admin.desc.orgchart", wide: true },
  { id: "users",        group: "adm-people",  Icon: Users,          labelKey: "admin.tabUsers",        descKey: "admin.desc.users" },
  { id: "profiles",     group: "adm-people",  Icon: IdCard,         labelKey: "admin.tabProfiles",     descKey: "admin.desc.profiles" },
  { id: "permissions",  group: "adm-people",  Icon: KeyRound,       labelKey: "admin.tabPermissions",  descKey: "admin.desc.permissions" },

  // Leader control — the checklist: configure it, read what came back, say
  // what does not count, and the exam.
  { id: "ltasks",       group: "adm-leaders", Icon: ListChecks,     labelKey: "admin.tabLtasks",       descKey: "admin.desc.ltasks" },
  // What the leaders actually FILED, in both collection layers — the Google
  // Form rows and the bot days — with the proofs behind them, the per-task
  // reopen, and the choice of which submission counts on a day that holds
  // both. Sits directly under the matrix that CONFIGURES those tasks: one
  // configures the checklist, the other reads what came back. It can delete a
  // scored day and move a leader's score, so the one grant that admits it is
  // «Lider nazorati — admin» (`leaders.admin`, whose tab list names all four
  // leader destinations — the tab id IS the key, so no `capKey`).
  { id: "ltdaily",      group: "adm-leaders", Icon: ClipboardList,  labelKey: "admin.tabLtDaily",      descKey: "admin.desc.ltdaily" },
  // Leader-days taken OUT of the results — the one control that makes a day
  // count NEITHER way, for the leader and their brigadir at once. Sits with the
  // other two leader surfaces: one configures the checklist, one reads what came
  // back, this one says which of it counts. Admitted only by «Lider nazorati —
  // admin», like "ltdaily" — it moves a leader's score and a brigadir's.
  { id: "ltexclude",    group: "adm-leaders", Icon: CircleSlash,    labelKey: "admin.tabLtExclude",    descKey: "admin.desc.ltexclude" },
  // The same "does not count" about a PERSON instead of a night: a leader whose
  // results stop from a date on, open-ended. Sits immediately after the day
  // exclusions because the two are read together and are constantly mistaken
  // for one another. Admitted only by «Lider nazorati — admin», like its
  // neighbour.
  { id: "ltcutoff",     group: "adm-leaders", Icon: UserMinus,      labelKey: "admin.tabLtCutoff",     descKey: "admin.desc.ltcutoff" },
  // «Imtihon» — the dashboard exam: assign it, read the results, edit the
  // bank. Grantable through `admin.exam.manage` (tab id = capability tab).
  { id: "exam",         group: "adm-leaders", Icon: GraduationCap,  labelKey: "admin.tabExam",         descKey: "admin.desc.exam" },

  // Plant setup — set once about the factory, then rarely touched.
  { id: "factories",    group: "adm-plant",   Icon: Building2,      labelKey: "admin.tabFactories",    descKey: "admin.desc.factories" },
  // The cells' working start/end register — per-shift defaults a cell inherits,
  // its own pair overriding them. A register only: nothing scores off it yet.
  { id: "shifttimes",   group: "adm-plant",   Icon: Clock,          labelKey: "admin.tabShiftTimes",   descKey: "admin.desc.shifttimes" },
  // WHO answers for each ojidaniya category — the name printed beside a cause
  // on every by-category surface, and the SCOPE of the «Kutish mas'uli» role.
  // No capKey: the assignment decides what a whole role may read, so handing
  // it out is handing out the ability to widen somebody's scope (the
  // `permissions` / `logs` model — admin-only and never grantable).
  { id: "idleowners",   group: "adm-plant",   Icon: ShieldQuestion, labelKey: "admin.tabIdleOwners",   descKey: "admin.desc.idleowners" },

  // Integrations — every outside system the platform talks to.
  // «Verifix sinxron» — cells, leaders and brigadirs FOLLOW Verifix through a
  // stored Verifix id (docs/plan-verifix-live-sync.md): the sync's mode and
  // caps, the queue of what it will not write by itself, the hand ties and the
  // pass log. No capKey: it moves people, cells and access — admin-only and
  // never grantable (the `permissions` / `logs` model).
  { id: "verifixsync",  group: "adm-links",   Icon: RefreshCcwDot,  labelKey: "admin.tabVerifixSync",  descKey: "admin.desc.verifixsync" },
  // The Verifix API connection: a dedicated read-only login (password sealed
  // server-side, never shown back) and a connection test that counts what
  // each form returns. No capKey: this login reads every employee's
  // attendance, so it is admin-only and never grantable.
  { id: "verifix",      group: "adm-links",   Icon: Fingerprint,    labelKey: "admin.tabVerifix",      descKey: "admin.desc.verifix" },
  { id: "data",         group: "adm-links",   Icon: Database,       labelKey: "admin.tabData",         descKey: "admin.desc.data" },
  // «AI kalitlari» — EVERY AI API key, and which key + model each feature
  // runs on (the proof checker, the assistant's chat and voice, both weekly
  // reports). No capKey: these are the platform's paid accounts — admin-only
  // and never grantable (the `verifix` model). Keys are set nowhere else.
  { id: "aikeys",       group: "adm-links",   Icon: Sparkles,       labelKey: "admin.tabAiKeys",       descKey: "admin.desc.aikeys" },
  // The Tasker («Задачник (фабрика)») API: a sealed integration token and a
  // connection test (docs/tasker.md). No capKey — the token reads every
  // factory department's inspections, so admin-only like Verifix.
  { id: "tasker",       group: "adm-links",   Icon: ScanSearch,     labelKey: "admin.tabTasker",       descKey: "admin.desc.tasker" },
  // «Trello» — the API key and the (sealed) token /trello reads boards with,
  // the boards it reads and what «done» means on each. No capKey: the token
  // reads every board its Trello member can open — admin-only, never grantable.
  { id: "trello",       group: "adm-links",   Icon: SquareKanban,   labelKey: "admin.tabTrello",       descKey: "admin.desc.trello" },
  // «Notion eslatmalari» — the Notion task list's daily Telegram reminders
  // (moved from the GitHub bot, 2026-11-02): schedule, groups, team and the
  // bot's sealed token. No capKey: admin-only, never grantable.
  { id: "notiontracker", group: "adm-links",   Icon: BellRing,       labelKey: "admin.tabNotionTracker", descKey: "admin.desc.notiontracker" },
  // «Pechlar» — which Revent ovens the factory-LAN collector reads, at which
  // address. No capKey: the list is where the collector is sent — admin-only.
  { id: "ovens",        group: "adm-links",   Icon: CookingPot,     labelKey: "admin.tabOvens",        descKey: "admin.desc.ovens" },

  // System — the registers and audits, the interface texts, and LAST the two
  // tools that destroy data (red; never beside a daily one).
  // Every change on the platform, by category — one register nothing writes to
  // twice: read-only and append-only. Sits with the other accountability
  // surfaces, and carries no `capKey`, so like "permissions" it is admin-only.
  { id: "logs",         group: "adm-system",  Icon: ScrollText,     labelKey: "admin.tabLogs",         descKey: "admin.desc.logs" },
  // Cross-document HR history: rejected-then-approved, posted long after the
  // document's own date, or repeatedly approved/cancelled. Read-only.
  { id: "docaudit",     group: "adm-system",  Icon: FileClock,      labelKey: "admin.tabDocAudit",     descKey: "admin.desc.docaudit" },
  // READ-ONLY audit of workers an approved → supervisor exchange left on no
  // roster (an upload wiped the receiving unit's day and nothing put them back).
  // A report, not a repair: restoring a row moves that day's historical numbers.
  { id: "lostworkers",  group: "adm-system",  Icon: UserX,          labelKey: "admin.tabLostWorkers",  descKey: "admin.desc.lostworkers" },
  { id: "translations", group: "adm-system",  Icon: Languages,      labelKey: "admin.tabTranslations", descKey: "admin.desc.translations" },
  { id: "cleanup",      group: "adm-system",  Icon: Trash2,         labelKey: "admin.tabCleanup",      descKey: "admin.desc.cleanup", danger: true },
  { id: "dbdump",       group: "adm-system",  Icon: DatabaseBackup, labelKey: "admin.tabDbDump",       descKey: "admin.desc.dbdump",  danger: true },
];
