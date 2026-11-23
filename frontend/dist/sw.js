/*
 * Safia service worker — the SOURCE. The build writes dist/sw.js from it
 * (emitServiceWorker in vite.config.js) with the two placeholders below filled
 * in: the build stamp, and the same-origin paths to precache. It is registered
 * by utils/pwa.js in a BROWSER only — never inside Telegram (see bootPwa) —
 * and served no-store by serve_spa in backend/app/main.py.
 *
 * What it does, in the order the fetch handler decides:
 *   - non-GET and cross-origin requests are not touched at all (a font
 *     re-fetched from in here would be refused by the worker's own CSP
 *     connect-src, which is same-origin);
 *   - /api, /bot, /health, /docs, the backend's /admin routes, /build.json and
 *     /sw.js are never cached and never answered from cache;
 *   - a navigation to an SPA route is NETWORK FIRST with a timeout, then the
 *     cached shell — for offline, a slow origin AND an origin 5xx (nginx during
 *     the backend restart every deploy performs); a 4xx is never masked — then
 *     a plain offline page. So a reload still fetches the deployed index.html
 *     and UpdatePrompt's «reload» keeps its meaning;
 *   - a navigation whose path names a FILE (an export opened in a new tab) is
 *     left to the browser: the shell fallback must never answer a slow .xlsx;
 *   - /assets/* is CACHE FIRST — content-hashed and served immutable, so a
 *     cached copy can never be the wrong one;
 *   - everything else same-origin (icons, the manifest, the Telegram SDK copy)
 *     is network first with the cache as the fallback.
 *
 * ONE cache per build, named by the stamp: activating a new build's worker
 * drops every other build's cache, and skipWaiting + clients.claim make that
 * immediate. A tab still on the old build then 404s on its next lazy chunk
 * and lazyWithReload reloads it — exactly what happens today without a worker.
 */

const BUILD = "2026-11-23T12:45:52.077Z";
const PRECACHE = ["/","/assets/AdminPage-BUyhLB_J.js","/assets/AdminTabs-6gwwBllK.js","/assets/AiKeys-CDFRS06Y.js","/assets/AnalysisBoard-BYhzHKvP.js","/assets/ApiAccess-BXL8-ezn.js","/assets/AppLauncher-CtR2PJ6R.js","/assets/Arc-DOVNI539.js","/assets/Assessment-DHanFajg.js","/assets/AssessmentGrade-HnvoUb-9.js","/assets/AssessmentList-DCJZh6e1.js","/assets/Assistant-vfABhfsm.js","/assets/AttendanceCleanup-bKNWmhFC.js","/assets/AttendanceUpload-BV6xZGcZ.js","/assets/AuditTable-utcNZ3U2.js","/assets/Audits-BN9n-oTf.js","/assets/BolimsModal-CP-adQxQ.js","/assets/BrigadirProfile-DtvRTFxm.js","/assets/BrigadirsKpi-C4LWf4bU.js","/assets/Broadcast-CV0n1h-n.js","/assets/BroadcastReceivers-DfugYesQ.js","/assets/BroadcastRecord-BfRTNXks.js","/assets/CatLockNotice-C5YOttxB.js","/assets/CategoryLegendModal-B9OTNC38.js","/assets/CellConcerns-CmGWsbT6.js","/assets/CellDetails-dKMt65v-.js","/assets/CellFormModal-DKfi4T3d.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-zEyb2fRz.js","/assets/Cells-DEoMenLf.js","/assets/ColumnFilter-UC8qJLjl.js","/assets/ColumnsPicker-D3Utd90Z.js","/assets/CommentsModal-CnNlcVy-.js","/assets/ComparisonTable-BBBVJ08i.js","/assets/Concerns-CJT4UWIa.js","/assets/ConcernsPieces-R_pY26vH.js","/assets/ContainerBolims-hBsenv_V.js","/assets/ContainerFlow-D7bmKYWv.js","/assets/ContainerTotalsCard-rqLi9uK-.js","/assets/Containers-IUlBBCrK.js","/assets/CountStepper-mnhzG7VH.js","/assets/Daily-VL5IrBfA.js","/assets/DataSources-CpevIpua.js","/assets/DataTable-CxL5ul8d.js","/assets/DateRangePicker-COfCqmWl.js","/assets/DayReportView-_NicSGeE.js","/assets/DayStepper-DmBdts6R.js","/assets/DayStrip-C9DXyTDm.js","/assets/DbBackup-hvfn4kXE.js","/assets/DifferenceBreakdown-BmPJDFzB.js","/assets/DocAudit-CLHg_VTb.js","/assets/Downtime-LnpeyBgd.js","/assets/Education-DLdgz0f5.js","/assets/EducationLesson-CtzAMGvM.js","/assets/EmptyState-C6jaDoqR.js","/assets/Equipment-BGjp2Jkx.js","/assets/Exam-oStEAF9X.js","/assets/ExamAdmin-wlMoHq0c.js","/assets/Factories-DSmIxb8R.js","/assets/FactorySelect-CobyhU7-.js","/assets/Gamification-D7EObeky.js","/assets/GroupBadge-Db6IdtwC.js","/assets/HeatmapChart-CSe5UMFT.js","/assets/HourlyContainers-eWRnuMOr.js","/assets/IdleCell-C0Fwvzpk.js","/assets/IdleOwners-0lOYgx6g.js","/assets/IdleSolutions-DivgBWj7.js","/assets/KPICard-Cx6WigR-.js","/assets/Kaizen-DWdq8BQ8.js","/assets/Kelish-Cf6UEOT7.js","/assets/Kitchen-DPXBz3RY.js","/assets/KpiBits-BOeIZyNw.js","/assets/KpiDeltaCard-QF1a6ysS.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-a3m_3e3_.js","/assets/LeaderAppeal-BWhlUtW2.js","/assets/LeaderDailyTasks-lHiBN4ak.js","/assets/LeaderDayReport-gkyMEaKl.js","/assets/LeaderNotCounting-DJYSK2K4.js","/assets/LeaderTasksAdmin-fztdoCvy.js","/assets/LeaderUnitReport-htsdhmSG.js","/assets/Leaderboard-BLagb0S_.js","/assets/Leaders-B7fHmTZ0.js","/assets/LeadersKpi-BIl-biQz.js","/assets/Lightbox-BGvsCias.js","/assets/LiveOverview-Dc0cjfxf.js","/assets/Login-C87D0rDq.js","/assets/Logs-CNAus_lU.js","/assets/LostWorkers-D51KdJ6P.js","/assets/NotFound-BpzCIOMc.js","/assets/Notifications-Cc4sgn25.js","/assets/NotionTasks-DH2xprDu.js","/assets/NotionTrackerSettings-BxLEQx-W.js","/assets/Ontime-CIKuC_98.js","/assets/OrgChart-BZ_g8Yjc.js","/assets/Ovens-riDB1Z3v.js","/assets/OvensSettings-Dp9k1psO.js","/assets/Overview-PyC8NGC1.js","/assets/OwnerChip-D12A5cYg.js","/assets/Pagination-BtMyvuX3.js","/assets/People-CkFAFhey.js","/assets/PerenaladkaFactTable-o25zQcF6.js","/assets/Permissions-CfVtT6K3.js","/assets/PersonCard-DhOGARqw.js","/assets/PlanFulfillment-16hSrH09.js","/assets/Production-BRuQjvsH.js","/assets/ProductionUpload-uTvN15fo.js","/assets/Profile-DCrQQvH-.js","/assets/ProfileAvatar-BheDTJJl.js","/assets/ProfilesManagement-BjZGvPVE.js","/assets/ProofCamera-CfCw8jf_.js","/assets/ProofPhoto-DKxL84BX.js","/assets/Quality-B3bZUhoq.js","/assets/RawRows-I2OM-HrI.js","/assets/Reports-DR4VclY2.js","/assets/RequestStateChip-ChUl-il0.js","/assets/RichTextEditor-DeMQRUSc.js","/assets/SaveState-DUjgbiuQ.js","/assets/SdPanelSettings-BosMNxcN.js","/assets/SearchInput-DoHtOy6a.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-EbIvqVq5.js","/assets/ShiftDaily-B3k5Tp5f.js","/assets/ShiftTimes-BydVEP9l.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-DRjbAAE_.js","/assets/StaffListAtCheck-C56NEfSk.js","/assets/StatusBadge-BqvzJIWw.js","/assets/StatusBandsModal-DoRge_oJ.js","/assets/TargetGoal-nCnTqKIi.js","/assets/Targets-C-9oWM2T.js","/assets/TaskFormModal-DpcNKQM_.js","/assets/TaskerSettings-D4bXg-f4.js","/assets/Tasks-DJ_dZsnO.js","/assets/TgProfile-KtjEpbC4.js","/assets/TimeWheelPicker-D3u3VQXY.js","/assets/Tooltip-KISbb9Xp.js","/assets/TranslationsEditor-BaVJbzQo.js","/assets/TrelloAnalytics-B8RHErK2.js","/assets/TrelloSettings-DQjrZqO4.js","/assets/TrendChart-jusUtWqI.js","/assets/TripleSpeedometer-DV6habCw.js","/assets/Trudoyomkost-D4IA3vfM.js","/assets/UploadDropzone-C6PgSVoE.js","/assets/UsersActivity-BLZ0haCu.js","/assets/UsersManagement-B9FsPGtu.js","/assets/VerifixPage-CU2tMwbG.js","/assets/VerifixParity-CovmNlDm.js","/assets/VfxApiMap-DvWITSKp.js","/assets/VfxDictionaries-BGYfTQGK.js","/assets/VfxEmployees-BOOrmMGo.js","/assets/VfxHrMoves-CSOZVbjh.js","/assets/VfxJobs-RZ_UeYLU.js","/assets/VfxPhoto-BtVttYeU.js","/assets/VfxShifts-_jIAOe4l.js","/assets/VfxState-BEc4ccRs.js","/assets/VfxTimebooks-BQczw0P4.js","/assets/VfxTimesheet-CyV7zyBN.js","/assets/WatchProgress-CGEK6MqN.js","/assets/WebLogin-D-OEiNW5.js","/assets/WorkersAttendance-MuELPviL.js","/assets/WorkersComposition-Dl1nSTi5.js","/assets/WorkersMovements-D_9iYm4W.js","/assets/WorkersPage-jzUAysCu.js","/assets/Zagruzka-C99BHMSK.js","/assets/ZagruzkaCell-Dr4SaJWU.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-Zf2YjgSD.js","/assets/api-D_IoyhCc.js","/assets/appealTask-BdEyg-JJ.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-DfkwETVu.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/bolim-TbqNYNfw.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-C_Q7OKK2.js","/assets/broadcastTree-CNlroraV.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-B_h4JIN1.js","/assets/categories-CMPuTiTO.js","/assets/cellMoveRefusal-ZeV4iqd9.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-CaZ1szVk.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-C92pwD3T.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-Df6y2dpn.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BmBhZSEH.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-DDQuYVu1.js","/assets/index-XPYHF8oi.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-B0q0sqJI.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/marks-D_Drmnkm.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-Cn7Mee0v.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CAZEK-jm.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-pJq1-Re5.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-BTZWMqxV.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-D84gNlE3.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-DeRtDjKl.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-CqZTNOOw.js","/assets/useMutation-DdJyJemH.js","/assets/useOpenParam-D_kdZlHi.js","/assets/useStatusBands-BvZl7l1T.js","/assets/useUrlScope-CZsQujQJ.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-C24S1xW2.js","/assets/uz_cyrl-CSDFsU7H.js","/assets/vfx-Ci2QiPMq.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-j_jdWOjJ.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
const CACHE = "safia-" + BUILD;
const SHELL = "/";
const NAV_TIMEOUT_MS = 5000;

// Backend prefixes: never cached, never served from cache, never given the shell.
const NEVER_CACHE = ["/api/", "/bot/", "/health", "/docs", "/redoc", "/openapi.json"];
// The SPA's own /admin paths. Every other /admin/* is a backend route.
const SPA_ADMIN = new Set(["/admin", "/admin/", "/admin/upload", "/admin/upload/"]);

function passThrough(path) {
  if (NEVER_CACHE.some((p) => path.startsWith(p))) return true;
  if (path.startsWith("/admin") && !SPA_ADMIN.has(path)) return true;
  return path === "/build.json" || path === "/sw.js";
}

function namesFile(path) {
  return path.slice(path.lastIndexOf("/") + 1).includes(".");
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Never atomic: a file that is missing must not keep the whole build out of
    // the cache. Eight at a time, not two hundred at once — a phone on a slow
    // link should not have every chunk of the app competing with the page it
    // is showing. An unchanged hashed asset comes out of the browser's own HTTP
    // cache (served immutable) — but chunk hashes cascade with the import
    // graph, so most deploys rename most chunks and re-download most of the
    // graph; CLAUDE.md records that cost as accepted and names the knob.
    const BATCH = 8;
    for (let i = 0; i < PRECACHE.length; i += BATCH) {
      await Promise.allSettled(PRECACHE.slice(i, i + BATCH).map((path) => cache.add(path)));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => n.startsWith("safia-") && n !== CACHE).map((n) => caches.delete(n)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  if (req.mode === "navigate") {
    if (!passThrough(path) && !namesFile(path) && !path.startsWith("/assets/")) {
      event.respondWith(shell(req));
    }
    return;
  }
  if (passThrough(path)) return;
  event.respondWith(path.startsWith("/assets/") ? cacheFirst(req) : networkFirst(req));
});

// Every cache lookup ignores Vary. The server's CORS layer stamps
// `Vary: Origin` on assets, and the Cache API honours it by default: a module
// script request carries an Origin header where a plain fetch() of the same URL
// does not, so the entry chunk fetch() found was a MISS for the module loader,
// and an offline start died on it (found in local testing, 2026-09-18). Assets
// are content-hashed — identical for every origin — so Vary says nothing here.
const MATCH = { ignoreVary: true };

// The Cache API can refuse — storage evicted or "in a broken state" mid-session,
// a quota error while the origin's data is being cleared, a private window that
// registered the worker earlier. A refusal inside respondWith() is a FAILED
// request for a server that is perfectly reachable, so every cache call on the
// fetch path goes through these three, and a failing cache degrades to plain
// network — never to an error page or a dead module.
async function safeOpen() {
  try {
    return await caches.open(CACHE);
  } catch {
    return null;
  }
}
async function safeMatch(key) {
  try {
    return (await caches.match(key, MATCH)) || null;
  } catch {
    return null;
  }
}
function safePut(cache, key, res) {
  if (!cache) return;
  try {
    cache.put(key, res.clone()).catch(() => {});
  } catch {
    /* body already used, or storage refused */
  }
}
// Only a body of the kind the URL names is stored: serve_spa answers ANY
// unknown same-origin path with index.html/200, so without this a renamed
// icon or a stale <img src> would park the shell under a static's URL. The
// shell itself is stored by shell(), under SHELL and nowhere else.
function storable(res) {
  return res.status === 200 && !(res.headers.get("content-type") || "").includes("text/html");
}

async function shell(req) {
  const cache = await safeOpen();
  const fresh = fetch(req).then((res) => {
    if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
      safePut(cache, SHELL, res);
    }
    return res;
  });
  fresh.catch(() => {}); // a failure after the cached shell already went out is not an error
  const late = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS, null));
  let res = null;
  try {
    res = await Promise.race([fresh, late]);
  } catch {
    // offline — fall through to the cached shell
  }
  // A 5xx is the origin saying it is not there right now — nginx during the
  // backend restart every deploy performs, a Cloudflare 52x — and that is the
  // one moment the cached shell exists for: the app then shows its own
  // offline/error state instead of the proxy's page. A 4xx is never masked.
  if (res && res.status < 500) return res;
  const cached = await safeMatch(SHELL);
  if (cached) return cached;
  if (res) return res;
  try {
    return await fresh;
  } catch {
    return offlinePage();
  }
}

async function cacheFirst(req) {
  const hit = await safeMatch(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (storable(res)) safePut(await safeOpen(), req, res);
  return res;
}

async function networkFirst(req) {
  let res;
  try {
    res = await fetch(req);
  } catch (err) {
    const hit = await safeMatch(req);
    if (hit) return hit;
    throw err;
  }
  if (storable(res)) safePut(await safeOpen(), req, res);
  return res;
}

// Shown only when the app has never been cached on this device and there is no
// network — a cold first open offline. Three languages on one line each; the
// full four-language boot copy lives in index.html, which is what this is
// standing in for.
function offlinePage() {
  const html =
    '<!doctype html><html lang="uz"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Safia</title>' +
    "<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;" +
    "background:#0f1117;color:#f3f4f6;font-family:system-ui,sans-serif;text-align:center;padding:24px}" +
    "h1{font-size:18px;margin:0 0 8px}p{margin:0;color:#9ca3af;font-size:14px;line-height:1.5}</style></head>" +
    "<body><div><h1>Internet aloqasi yo‘q</h1><p>Aloqa tiklangach sahifani yangilang.<br>" +
    "Нет подключения — обновите страницу, когда связь появится.<br>" +
    "No connection — reload once you are back online.</p></div></body></html>";
  return new Response(html, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
