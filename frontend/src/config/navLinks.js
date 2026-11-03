// The sidebar's pages and sections — THE register and order (moved out of
// components/layout/Sidebar.jsx on 2026-10-31 so the header search,
// components/layout/GlobalSearch.jsx, can read it while the sidebar renders
// that search inside its phone drawer without an import loop). The comments on
// each section and link stay beside the sidebar code that reads them.
import {
  Activity, ArrowRightLeft, Award, BadgeCheck, BarChart2, BookMarked, BookOpenCheck, BotMessageSquare,
  Briefcase, CalendarCheck, CalendarClock, CalendarRange, ClipboardCheck, ClipboardList, Clock, Cog, Contact,
  Crown, Factory, FileBarChart, Fingerprint, FlaskConical, Gauge, Gavel, Goal,
  GraduationCap, Grid3x3, IdCard, LayoutDashboard, LayoutGrid, ListChecks, ListTodo, Medal, MessageSquarePlus,
  MessageSquareWarning, MonitorDot, Network, PlaySquare, ScanFace, Settings, ShieldAlert, Sparkles, Target,
  SquareKanban, TestTubes, Timer, Trophy, Truck, UserCheck, Users, UsersRound, Wrench, createLucideIcon,
} from "lucide-react";

// ARC is the repair department: a wrench crossed with a screwdriver, drawn on
// lucide's grid and stroke (lucide has no screwdriver) so it sits with the
// other icons. The wrench is lucide's own; plain Wrench already marks
// «Perenaladka», so ARC gets the pair rather than a second lone wrench.
const Repair = createLucideIcon("repair", [
  ["path", { d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z", key: "wrench" }],
  ["path", { d: "M2.6 5.4a2 2 0 0 1 2.8-2.8l5 5-2.8 2.8z", key: "handle" }],
  ["path", { d: "m9 9 9.5 9.5", key: "shaft" }],
  ["path", { d: "m17.5 19.5 2-2", key: "tip" }],
]);

// `app` moves a link out of its group's app on the admin launcher («Ilovalar»,
// see APPS below); a link without one belongs to the app of its `group`.
export const ALL_LINKS = [
  { to: "/",         page: "overview", key: "nav.overview",       icon: LayoutDashboard, group: "top", app: "overview" },
  // «Yordamchi» — the AI assistant's full page (the panel opens from the header).
  { to: "/assistant", page: "assistant", key: "nav.assistant", icon: BotMessageSquare, group: "top" },
  { to: "/zagruzka", page: "zagruzka", key: "nav.zagruzka",        icon: BarChart2, group: "prod" },
  { to: "/leaderboard", page: "leaderboard", key: "nav.leaderboard", icon: Trophy, group: "lab" },
  // Admin-only gamification & rewards design preview («Safia Honors») — demo
  // data only, no page-access key (the adminOnly pilot pattern).
  { to: "/gamification", adminOnly: true, key: "nav.gamification", icon: Medal, group: "lab" },
  // «Maqsadlar» — goal board test screen: per-profile demo data, no page-access
  // key (the same adminOnly pilot pattern as /gamification).
  { to: "/targets", adminOnly: true, key: "nav.targets", icon: Goal, group: "lab" },
  { to: "/workers",  page: "workers",  key: "nav.workers",         icon: Users, group: "people" },
  { to: "/downtime", page: "downtime", key: "nav.idleTime",        icon: Clock, group: "prod" },
  // «Ojidaniya kiritish» — the leaders' entry form for the same minutes the
  // /downtime page reads, so it sits beside it in Production, not in the lab.
  { to: "/idle-cell", page: "idle-cell", key: "nav.idleCell",   icon: Timer, group: "prod" },
  { to: "/staff",    page: "staff",    key: "nav.staff",           icon: Fingerprint, group: "people" },
  { to: "/daily",    page: "daily",    key: "nav.daily",           icon: CalendarCheck, group: "prod" },
  { to: "/shift-daily", page: "shift-daily", key: "nav.shiftDaily", icon: ClipboardList, group: "prod" },
  { to: "/production", page: "production", key: "nav.production",    icon: Factory, group: "prod" },
  // «Plan Bajarish» — out of the lab, beside the page whose ПЛАН/ФАКТ it reads.
  { to: "/plan",     page: "plan",     key: "nav.planFulfillment", icon: Target, group: "prod" },
  { to: "/trudoyomkost", page: "trudoyomkost", key: "nav.trudoyomkost", icon: Gauge, group: "prod" },
  // «O'z vaqtida yetkazish» — the on-time delivery report (the logistics
  // team's «on time report» sheet, read by the server). Admin-only by default.
  { to: "/ontime", page: "ontime", key: "nav.ontime", icon: Truck, group: "prod" },
  // Leader monitoring — ONE page for every role (the per-shift admin copies
  // are retired): the Smena filter inside it narrows to a shift, «All» shows
  // both. Shift 2's days come from the bot once the leader closed one there.
  { to: "/leaders", page: "leaders", key: "nav.leaders", icon: ClipboardCheck, group: "leaders" },
  { to: "/cells", page: "cells", key: "nav.cells", icon: LayoutGrid, group: "cells" },
  { to: "/kaizen", page: "kaizen", key: "nav.kaizen", icon: Sparkles, group: "quality" },
  // «Notion vazifalari» — the Notion "Production" task list, read-only
  // (services/notion_tracker.py); its reminders' settings are the admin tab.
  { to: "/notion-tasks", page: "notion-tasks", key: "nav.notionTasks", icon: ListChecks, group: "quality" },
  { to: "/quality", page: "quality", key: "nav.quality", icon: MessageSquareWarning, group: "quality" },
  { to: "/concerns", page: "concerns", key: "nav.concerns", icon: ShieldAlert, group: "quality" },
  // ARC service-ticket register — synced from the ARC API, admin-only by default.
  { to: "/arc", page: "arc", key: "nav.arc", icon: Repair, group: "quality", app: "arc" },
  // THE task board — both tiers (smena menejeri → brigadir, brigadir → lider)
  // on one page since 2026-09-04; the level is a column, not a second page.
  { to: "/tasks", page: "tasks", key: "nav.tasks", icon: ListTodo, group: "leaders" },
  { to: "/cell-concerns", page: "cell-concerns", key: "nav.cellConcerns", icon: MessageSquarePlus, group: "leaders" },
  { to: "/kelish", page: "kelish", key: "nav.kelish", icon: UserCheck, group: "leaders" },
  // «Liderlar KPI» — the leaders' five KPIs on ONE page, as a leaderboard
  // (2026-10-19; it merged /worker-concerns, /turnover and /foreign-objects).
  { to: "/leaders-kpi", page: "leaders-kpi", key: "nav.leadersKpi", icon: Award, group: "leaders" },
  // «Brigadirlar KPI» — HR's monthly brigadir KPI: turnover and the quality
  // register's corrective measures computed, mentoring / KRU / payout to come.
  { to: "/brigadirs-kpi", page: "brigadirs-kpi", key: "nav.brigadirsKpi", icon: BadgeCheck, group: "leaders" },
  { to: "/activity", page: "activity", key: "nav.activity", icon: Activity, group: "system", app: "activity" },
  { to: "/setup-times", page: "setup", key: "nav.setupTimes", icon: Wrench, group: "cells" },
  { to: "/zagruzka-cell", page: "zagruzka-cell", key: "nav.zagruzkaCell", icon: FlaskConical, group: "lab" },
  // Live shift monitor — the wall screen (idle time + plan pace, right now).
  // Laboratory, admin-only until the operator opens it to shift managers.
  { to: "/live", page: "live", key: "nav.live", icon: MonitorDot, group: "lab" },
  // «Hisobotlar» — the platform's period report, every section folded out of
  // the page that owns it and downloadable as a document. Laboratory,
  // admin-only until the operator opens it on the Access tab. On the admin
  // launcher it is an app of its own (2026-11-03, the operator), not a
  // Laboratory page; for anybody else it stays in the Laboratory group.
  { to: "/reports", page: "reports", key: "nav.reports", icon: FileBarChart, group: "lab", app: "reports" },
  // «Nomzodlarni baholash» — the five-department panel grading a Supervisor
  // candidate. Laboratory, admin-only until the operator opens it to judges.
  { to: "/assessment", page: "assessment", key: "nav.assessment", icon: Gavel, group: "lab" },
  // «Xodim kartasi» — everything the platform knows about ONE person of the
  // plant (/people/:employee_id). Laboratory, admin-only until opened.
  { to: "/people", page: "people", key: "nav.people", icon: Contact, group: "lab" },
  // «Trello tahlili» — a Trello board's analytics, read through Trello's API
  // (services/trello.py). ADMINS ONLY, and not grantable: no page key.
  { to: "/trello", adminOnly: true, key: "nav.trello", icon: SquareKanban, group: "lab" },
  // «Verifix (test)» — what Verifix's API returns, one page per kind of data
  // (2026-10-03). Admin-only, no page keys: every page reads every employee
  // Verifix holds.
  { to: "/verifix/api", adminOnly: true, key: "nav.vfx.api", icon: Network, group: "verifix" },
  { to: "/verifix/employees", adminOnly: true, key: "nav.vfx.employees", icon: IdCard, group: "verifix" },
  { to: "/verifix/jobs", adminOnly: true, key: "nav.vfx.jobs", icon: Briefcase, group: "verifix" },
  { to: "/verifix/timesheet", adminOnly: true, key: "nav.vfx.timesheet", icon: CalendarRange, group: "verifix" },
  { to: "/verifix/hr", adminOnly: true, key: "nav.vfx.hr", icon: ArrowRightLeft, group: "verifix" },
  { to: "/verifix/timebooks", adminOnly: true, key: "nav.vfx.timebooks", icon: BookOpenCheck, group: "verifix" },
  { to: "/verifix/shifts", adminOnly: true, key: "nav.vfx.shifts", icon: CalendarClock, group: "verifix" },
  { to: "/verifix/dictionaries", adminOnly: true, key: "nav.vfx.dictionaries", icon: BookMarked, group: "verifix" },
  // «Ta'lim» — video lessons published to profiles. First entry in its own
  // group: training is neither production data nor a register, and the group is
  // where the rest of it (courses, tests) will land.
  { to: "/education", page: "education", key: "nav.education", icon: PlaySquare, group: "education" },
  // «Imtihon» — the dashboard exam. Leaders sit it, supervisors read their unit.
  { to: "/exam", page: "exam", key: "nav.exam", icon: GraduationCap, group: "education" },
];

export const NAV_GROUPS = [
  { id: "top" },                                   // Обзор — headerless
  { id: "prod",    labelKey: "navgrp.production", icon: Cog },
  { id: "people",  labelKey: "navgrp.people",     icon: UsersRound },
  { id: "leaders", labelKey: "navgrp.leaders",    icon: Crown },
  { id: "quality", labelKey: "navgrp.quality",    icon: BadgeCheck },
  { id: "cells",   labelKey: "navgrp.cells",      icon: Grid3x3 },
  // «Ta'lim» — training. Its own section rather than a row in the Laboratory:
  // the lab is where pilots live, and lessons are not a pilot. First member of
  // a group built to take the rest of the training surfaces.
  { id: "education", labelKey: "navgrp.education", icon: GraduationCap },
  // «Verifix (test)» — the attendance system's API, page by page (admin-only).
  { id: "verifix", labelKey: "navgrp.verifix",    icon: ScanFace },
  { id: "lab",     labelKey: "navgrp.lab",        icon: TestTubes },
  { id: "system" },                                // Активность + catch-all — headerless
];

// «Ilovalar» — the admin's app launcher (2026-11-02, admins only for now).
// For an admin «/» is a grid of these tiles, and while one is open the sidebar
// lists only its pages. An app is a nav group by default; ARC, the overview,
// the reports and the activity page are apps of their own (a link's `app`).
// `hue` picks the tile's colour pair in index.css (`[data-app-hue]`).
// The assistant has no tile: the header's button already opens it everywhere.
export const APPS = [
  { id: "overview",  labelKey: "nav.overview",      icon: LayoutDashboard, hue: "gold" },
  { id: "reports",   labelKey: "nav.reports",       icon: FileBarChart,    hue: "blue" },
  { id: "prod",      labelKey: "navgrp.production", icon: Factory,         hue: "orange" },
  { id: "people",    labelKey: "navgrp.people",     icon: UsersRound,      hue: "sky" },
  { id: "leaders",   labelKey: "navgrp.leaders",    icon: Crown,           hue: "violet" },
  { id: "quality",   labelKey: "navgrp.quality",    icon: BadgeCheck,      hue: "emerald" },
  { id: "arc",       labelKey: "nav.arc",           icon: Repair,          hue: "rose" },
  { id: "cells",     labelKey: "navgrp.cells",      icon: Grid3x3,         hue: "teal" },
  { id: "education", labelKey: "navgrp.education",  icon: GraduationCap,   hue: "indigo" },
  { id: "verifix",   labelKey: "navgrp.verifix",    icon: ScanFace,        hue: "cyan" },
  { id: "lab",       labelKey: "navgrp.lab",        icon: TestTubes,       hue: "pink" },
  // The page's own name («Foydalanuvchilar faolligi») breaks mid-word on a
  // phone's tile; the tile says it in one word.
  { id: "activity",  labelKey: "apps.activity",     icon: Activity,        hue: "lime" },
  { id: "admin",     labelKey: "nav.admin",         icon: Settings,        hue: "slate" },
];

// The admin panel is not a sidebar page (it sits in the sidebar's footer), so
// the «admin» app names its one page here.
export const ADMIN_PANEL_LINK = { to: "/admin/upload", key: "nav.admin", icon: Settings, app: "admin" };

export const appOf = (link) => link.app ?? link.group;

// For an admin «/» is the launcher, so the overview answers at /overview.
export const adminPath = (to) => (to === "/" ? "/overview" : to);
