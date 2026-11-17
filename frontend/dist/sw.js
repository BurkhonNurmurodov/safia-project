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

const BUILD = "2026-11-17T05:26:01.501Z";
const PRECACHE = ["/","/assets/ActionMenu-DIjho2bj.js","/assets/AdminPage-BFniNoE1.js","/assets/AdminTabs-CRwZUU7S.js","/assets/AiKeys-Bu4L5fbv.js","/assets/AnalysisBoard-D1FofzYz.js","/assets/ApiAccess-CUDdQY9D.js","/assets/AppLauncher-1GXqHqYj.js","/assets/Arc-BRxB1cgU.js","/assets/Assessment-DDoUewz2.js","/assets/AssessmentGrade-Crmg8A1c.js","/assets/AssessmentList-Dz2chAne.js","/assets/Assistant-DSq8IaaF.js","/assets/AttendanceCleanup-DHUUsyNP.js","/assets/AttendanceUpload-DpAwpcGm.js","/assets/AuditTable-Cw4wGWKn.js","/assets/BrigadirProfile-mn4AxNGx.js","/assets/BrigadirsKpi-DZIf2CuJ.js","/assets/Broadcast-90q1BSum.js","/assets/BroadcastReceivers-DkhyJwoQ.js","/assets/BroadcastRecord-D5GCh-1c.js","/assets/Button-BByRB7Le.js","/assets/CatLockNotice-lfP_WxUL.js","/assets/CategoryLegendModal-BW5KgWsW.js","/assets/CellConcerns-CxAj4gSu.js","/assets/CellDetails-DPfDTAGZ.js","/assets/CellFormModal-56y0oTAP.js","/assets/CellIdent-DE6qkdqd.js","/assets/CellLink-DqvocklZ.js","/assets/Cells-5GVabUVh.js","/assets/ColumnFilter-CpL6tqFZ.js","/assets/ColumnsPicker-DZjvLFhf.js","/assets/CommentsModal-BVPSTp8k.js","/assets/ComparisonTable-D-noHuOK.js","/assets/Concerns-Bhbp9wpO.js","/assets/ConcernsPieces-DNU0JcdS.js","/assets/ContainerFlow-L6mHlTRx.js","/assets/ContainerTotalsCard-BtNOqicZ.js","/assets/Containers-uraI68UY.js","/assets/CountStepper-CRyL0fGA.js","/assets/Daily-CF3mM2UK.js","/assets/DataSources-CpiY_dCK.js","/assets/DataTable-G7fMeMRf.js","/assets/DateRangePicker-DNM15GMX.js","/assets/DayReportView-B5VM40HP.js","/assets/DayStepper-DlUvtFKL.js","/assets/DayStrip-qq2QhPfT.js","/assets/DbBackup-DlfQ4W5C.js","/assets/DifferenceBreakdown-qnvqBRY_.js","/assets/DocAudit-zFdIxQ1U.js","/assets/Downtime-CPnmxobN.js","/assets/Education-BrHqOnyq.js","/assets/EducationLesson-DTxrRrVU.js","/assets/EmptyState-BJRrVztB.js","/assets/Exam-aukcS9_P.js","/assets/ExamAdmin-UL4LGlUh.js","/assets/Factories-BRHCiSUz.js","/assets/FactorySelect-BOrgQU49.js","/assets/Gamification-C0JvIxDF.js","/assets/GroupBadge-Ci1kAU3S.js","/assets/HeatmapChart-C0DuOQgr.js","/assets/HourlyContainers-liHh5rRq.js","/assets/IdleCell-CH8Kex86.js","/assets/IdleOwners-C66-Tjaf.js","/assets/IdleSolutions-D6MlVOkp.js","/assets/KPICard-Cw5WW5n_.js","/assets/Kaizen-6EuR_kUk.js","/assets/Kelish-QnxOZyQ8.js","/assets/Kitchen-CMl3ETjh.js","/assets/KpiBits-BIY1FqXK.js","/assets/KpiDeltaCard-DLFOhlyp.js","/assets/LangContext-2A4sPKlL.js","/assets/LangTextInput-Kofaohjz.js","/assets/Layout-wtOz1GeG.js","/assets/LeaderAppeal-fBzv6bul.js","/assets/LeaderDailyTasks-DwR8MQBO.js","/assets/LeaderDayReport-614a7zv1.js","/assets/LeaderNotCounting-BsNJuivz.js","/assets/LeaderTasksAdmin-B_dZK5Ek.js","/assets/LeaderUnitReport-BmMr4XDS.js","/assets/Leaderboard-CFF27MDH.js","/assets/Leaders-Xxg-0QVu.js","/assets/LeadersKpi-BE0SYvha.js","/assets/Lightbox--W_XKy1M.js","/assets/LiveOverview-CDPwxrwR.js","/assets/Login-C7jBze2t.js","/assets/Logs-iOQ2qimH.js","/assets/LostWorkers-XhYhl5s0.js","/assets/Meter-CRRHrYuq.js","/assets/NotFound-U1YygDIT.js","/assets/Notifications-D2OK6Wix.js","/assets/NotionTasks-CvFLAR3P.js","/assets/NotionTrackerSettings-DmL8FMd8.js","/assets/Ontime-D-PSx_ui.js","/assets/OrgChart-BqUOzaqJ.js","/assets/Ovens-C7LHw4eF.js","/assets/OvensSettings-DlN8A4M8.js","/assets/Overview-B1DD6dn8.js","/assets/OwnerChip-BqitGwzm.js","/assets/Pagination-DfG5YUEf.js","/assets/People-BNO-oN8y.js","/assets/PerenaladkaFactTable-purLLBgo.js","/assets/Permissions-BZH8kG4L.js","/assets/PersonCard-Db6Z8B0X.js","/assets/PlanFulfillment-CK057kS8.js","/assets/Production-DuYLcG_U.js","/assets/ProductionUpload-a4ZMsbfT.js","/assets/Profile-BzvrPaq2.js","/assets/ProfileAvatar-DGxEiA7d.js","/assets/ProfilesManagement-KFyU9w_e.js","/assets/ProofCamera-AiqtiDRI.js","/assets/ProofPhoto-4go99sSj.js","/assets/Quality-Bs90AON8.js","/assets/RawRows-DR3PORhh.js","/assets/Reports-CHqo1HbY.js","/assets/RequestStateChip-DQcOVCTh.js","/assets/RichTextEditor-a0hu3GT3.js","/assets/SaveState-45vDgC7i.js","/assets/SearchInput-Bc2JpOZo.js","/assets/SeasonalityHeatmap-B65j5wfW.js","/assets/SegmentedToggle-CIxWlaZZ.js","/assets/SetupTimes-_u7FG4fB.js","/assets/ShiftDaily-B-BfPZTV.js","/assets/ShiftTimes-CkjH2L6N.js","/assets/SortableList-DgrUPWKx.js","/assets/Staff-_Lvhttr4.js","/assets/StaffListAtCheck-hRTM5xCc.js","/assets/StatusBadge-hc-6ZZAb.js","/assets/StatusBandsModal-BOcXkkx1.js","/assets/TargetGoal-D-EXdrdZ.js","/assets/Targets-BrXXWA_4.js","/assets/TaskFormModal-Cpre2_-8.js","/assets/TaskerSettings-CeYsDlT4.js","/assets/Tasks-EV_ijGEx.js","/assets/TgProfile-sANMFtqG.js","/assets/TimeWheelPicker-BDCTJxyO.js","/assets/Toast-DLkPq-u6.js","/assets/Tooltip-Cd0j8XOq.js","/assets/TranslationsEditor-CVzZdWAg.js","/assets/TrelloAnalytics-nOAgiXRl.js","/assets/TrelloSettings-BLBY2Ywa.js","/assets/TrendChart-AVOp5uHU.js","/assets/TripleSpeedometer-8QedSSF5.js","/assets/Trudoyomkost-Bwp2M8on.js","/assets/UploadDropzone-Ckl6lJR3.js","/assets/UsersActivity-B1LvIHLY.js","/assets/UsersManagement-B-lhQEAC.js","/assets/VerdictBlock-B4hp1qQz.js","/assets/VerifixPage-BeYx2cEX.js","/assets/VerifixParity-CsoiGkYO.js","/assets/VfxApiMap-Bzpy6JfO.js","/assets/VfxDictionaries-CBVNrlpf.js","/assets/VfxEmployees-DsJBnbx0.js","/assets/VfxHrMoves-DbmZ7Sh6.js","/assets/VfxJobs-CTGvUf6A.js","/assets/VfxPhoto-DkqNvq2F.js","/assets/VfxShifts-Cv4yTK3L.js","/assets/VfxState-D5-KUO9E.js","/assets/VfxTimebooks-CPJAYbix.js","/assets/VfxTimesheet-BH6BNi-x.js","/assets/WatchProgress-CO67qvwi.js","/assets/WebLogin-tJlUylXO.js","/assets/WorkersAttendance-Dr4yABy_.js","/assets/WorkersComposition-rFDedCUa.js","/assets/WorkersMovements-BEtHEMM9.js","/assets/WorkersPage-BnRNsQPI.js","/assets/Zagruzka-DOqD5K-s.js","/assets/ZagruzkaCell-Cnm4G1Kp.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-DxM2QNBZ.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-D0bl5g-0.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-TFIiMPAg.js","/assets/broadcastTree-BGWOhXrW.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-CdZvb5oX.js","/assets/cellMoveRefusal-BH2gfgOK.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-CQoL2JBH.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-wVjoloVf.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/flowUtil-G5A67iDC.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BH54YsjB.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BkoTGQX3.js","/assets/index-Rq15oGzo.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-BViZSFr8.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-B7_U1X6N.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CaZl1ktg.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-CUBVn8lY.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-Bamw-evW.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-Df3uDRHU.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DGskdIYF.js","/assets/ru-DDChigs-.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-BW4p4QQo.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CKd4SVY5.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-ChfDr16y.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-BXd4LYH7.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-3Gk6FKqW.js","/assets/useMutation-BFxt4HmX.js","/assets/useOpenParam-Ce4oNtCV.js","/assets/useStatusBands-VFL9sqkg.js","/assets/useUrlScope-C3FV1TEi.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-yYnVOAd9.js","/assets/uz_cyrl-CPouEpYI.js","/assets/vfx-ZppYL_0y.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-B9vm6HJp.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/x-CfYkDDdF.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
