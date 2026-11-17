import { lazyWithReload } from "../../utils/lazyPage";

// Every admin page's component, keyed by its id in config/adminNav.js — and
// nothing else: order, icon, label and access live in ADMIN_NAV. Each page is
// a chunk of its own, so opening «Foydalanuvchilar» downloads that page alone.
// A page added to ADMIN_NAV needs its line here; AdminPage.jsx sends a missing
// one to /panel rather than rendering nothing.
export const ADMIN_PAGES = {
  attendance:    lazyWithReload(() => import("./AttendanceUpload")),
  data:          lazyWithReload(() => import("./DataSources")),
  production:    lazyWithReload(() => import("./ProductionUpload")),
  orgchart:      lazyWithReload(() => import("./OrgChart")),
  users:         lazyWithReload(() => import("./UsersManagement")),
  profiles:      lazyWithReload(() => import("./ProfilesManagement")),
  factories:     lazyWithReload(() => import("./Factories")),
  permissions:   lazyWithReload(() => import("./Permissions")),
  logs:          lazyWithReload(() => import("./Logs")),
  broadcast:     lazyWithReload(() => import("./Broadcast")),
  ltasks:        lazyWithReload(() => import("./LeaderTasksAdmin")),
  ltdaily:       lazyWithReload(() => import("./LeaderDailyTasks")),
  ltexclude:     lazyWithReload(() => import("./LeaderNotCounting")),
  exam:          lazyWithReload(() => import("./ExamAdmin")),
  shifttimes:    lazyWithReload(() => import("./ShiftTimes")),
  idleowners:    lazyWithReload(() => import("./IdleOwners")),
  lostworkers:   lazyWithReload(() => import("./LostWorkers")),
  verifixsync:   lazyWithReload(() => import("./VerifixPage")),
  tasker:        lazyWithReload(() => import("./TaskerSettings")),
  sdpanel:       lazyWithReload(() => import("./SdPanelSettings")),
  aikeys:        lazyWithReload(() => import("./AiKeys")),
  trello:        lazyWithReload(() => import("./TrelloSettings")),
  ovens:         lazyWithReload(() => import("./OvensSettings")),
  notiontracker: lazyWithReload(() => import("./NotionTrackerSettings")),
  translations:  lazyWithReload(() => import("./TranslationsEditor")),
  cleanup:       lazyWithReload(() => import("./AttendanceCleanup")),
  dbdump:        lazyWithReload(() => import("./DbBackup")),
};
