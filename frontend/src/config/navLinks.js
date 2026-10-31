// The sidebar's pages and sections — THE register and order (moved out of
// components/layout/Sidebar.jsx on 2026-10-31 so the header search,
// components/layout/GlobalSearch.jsx, can read it while the sidebar renders
// that search inside its phone drawer without an import loop). The comments on
// each section and link stay beside the sidebar code that reads them.
import {
  Activity, ArrowRightLeft, Award, BadgeCheck, BarChart2, BookMarked, BookOpenCheck, BotMessageSquare,
  Briefcase, CalendarCheck, CalendarClock, CalendarRange, ClipboardCheck, ClipboardList, Clock, Cog, Contact,
  Crown, Factory, FileBarChart, Fingerprint, FlaskConical, Gauge, Gavel, Goal,
  GraduationCap, Grid3x3, IdCard, LayoutDashboard, LayoutGrid, ListTodo, Medal, MessageSquarePlus,
  MessageSquareWarning, MonitorDot, Network, PlaySquare, ScanFace, ShieldAlert, Sparkles, Target,
  TestTubes, Timer, Trophy, Truck, UserCheck, Users, UsersRound, Wrench,
} from "lucide-react";

export const ALL_LINKS = [
  { to: "/",         page: "overview", key: "nav.overview",       icon: LayoutDashboard, group: "top" },
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
  { to: "/quality", page: "quality", key: "nav.quality", icon: MessageSquareWarning, group: "quality" },
  { to: "/concerns", page: "concerns", key: "nav.concerns", icon: ShieldAlert, group: "quality" },
  // ARC service-ticket register — synced from the ARC API, admin-only by default.
  { to: "/arc", page: "arc", key: "nav.arc", icon: ClipboardList, group: "quality" },
  // THE task board — both tiers (smena menejeri → brigadir, brigadir → lider)
  // on one page since 2026-09-04; the level is a column, not a second page.
  { to: "/tasks", page: "tasks", key: "nav.tasks", icon: ListTodo, group: "leaders" },
  { to: "/cell-concerns", page: "cell-concerns", key: "nav.cellConcerns", icon: MessageSquarePlus, group: "leaders" },
  { to: "/kelish", page: "kelish", key: "nav.kelish", icon: UserCheck, group: "leaders" },
  // «Liderlar KPI» — the leaders' five KPIs on ONE page, as a leaderboard
  // (2026-10-19; it merged /worker-concerns, /turnover and /foreign-objects).
  { to: "/leaders-kpi", page: "leaders-kpi", key: "nav.leadersKpi", icon: Award, group: "leaders" },
  { to: "/activity", page: "activity", key: "nav.activity", icon: Activity, group: "system" },
  { to: "/setup-times", page: "setup", key: "nav.setupTimes", icon: Wrench, group: "cells" },
  { to: "/zagruzka-cell", page: "zagruzka-cell", key: "nav.zagruzkaCell", icon: FlaskConical, group: "lab" },
  // Live shift monitor — the wall screen (idle time + plan pace, right now).
  // Laboratory, admin-only until the operator opens it to shift managers.
  { to: "/live", page: "live", key: "nav.live", icon: MonitorDot, group: "lab" },
  // «Hisobotlar» — the platform's period report, every section folded out of
  // the page that owns it and downloadable as a document. Laboratory,
  // admin-only until the operator opens it on the Access tab.
  { to: "/reports", page: "reports", key: "nav.reports", icon: FileBarChart, group: "lab" },
  // «Nomzodlarni baholash» — the five-department panel grading a Supervisor
  // candidate. Laboratory, admin-only until the operator opens it to judges.
  { to: "/assessment", page: "assessment", key: "nav.assessment", icon: Gavel, group: "lab" },
  // «Xodim kartasi» — everything the platform knows about ONE person of the
  // plant (/people/:employee_id). Laboratory, admin-only until opened.
  { to: "/people", page: "people", key: "nav.people", icon: Contact, group: "lab" },
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
