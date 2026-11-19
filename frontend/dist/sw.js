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

const BUILD = "2026-11-19T08:07:34.172Z";
const PRECACHE = ["/","/assets/ActionMenu-DIjho2bj.js","/assets/AdminPage-BRirDmNJ.js","/assets/AdminTabs-BiwdYE4y.js","/assets/AiKeys-D5uHi_qA.js","/assets/AnalysisBoard-0AvMyott.js","/assets/ApiAccess-CTVl3xkT.js","/assets/AppLauncher-Dr0Ueiaj.js","/assets/Arc-HShfoAXj.js","/assets/Assessment-DlMbynMs.js","/assets/AssessmentGrade-BAerT3XZ.js","/assets/AssessmentList-DUQClgWf.js","/assets/Assistant-cw6XJqB_.js","/assets/AttendanceCleanup-BJIo2NFT.js","/assets/AttendanceUpload-PrY6ZDdH.js","/assets/AuditTable-DJVLBzER.js","/assets/BrigadirProfile-D5PFR8l3.js","/assets/BrigadirsKpi-BxloeRj5.js","/assets/Broadcast-2lgwjkef.js","/assets/BroadcastReceivers-FNeKZrCQ.js","/assets/BroadcastRecord-DRDoR9qW.js","/assets/Button-BByRB7Le.js","/assets/CatLockNotice-Bq_aWGzQ.js","/assets/CategoryLegendModal-COjpfsws.js","/assets/CellConcerns-CFASkW8j.js","/assets/CellDetails-BaMxvUX-.js","/assets/CellFormModal-DLsBm33A.js","/assets/CellIdent-DE6qkdqd.js","/assets/CellLink-D2O05E-S.js","/assets/Cells-CzxKA1ng.js","/assets/ColumnFilter-KI_UgSbk.js","/assets/ColumnsPicker-CujCBiFc.js","/assets/CommentsModal-_JSjUQue.js","/assets/ComparisonTable-BZgqajTc.js","/assets/Concerns-OER3NN2c.js","/assets/ConcernsPieces-fSbcClqR.js","/assets/ContainerFlow-BAomW8-9.js","/assets/ContainerTotalsCard-Rc9QLAx4.js","/assets/Containers-wHcdTL8n.js","/assets/CountStepper-BgYNgoLl.js","/assets/Daily-DleVCwEQ.js","/assets/DataSources-Durm_F7w.js","/assets/DataTable-DSc3U6Lg.js","/assets/DateRangePicker-DQtBYzLy.js","/assets/DayReportView-B2nRLQAi.js","/assets/DayStepper-DOTm0XiD.js","/assets/DayStrip-CuoGegJa.js","/assets/DbBackup-CoXl94iT.js","/assets/DifferenceBreakdown-D4SieuNU.js","/assets/DocAudit-BWPyaX-0.js","/assets/Downtime-DHRR_tAj.js","/assets/Education-CQH6wbbA.js","/assets/EducationLesson-CkEekLhO.js","/assets/EmptyState-B1kIta99.js","/assets/Equipment-DZg1r0hm.js","/assets/Exam-pG49NpwA.js","/assets/ExamAdmin-BVxBFTeN.js","/assets/Factories-RpfmQE0t.js","/assets/FactorySelect-CV65nEED.js","/assets/Gamification-bVoT4JYl.js","/assets/GroupBadge-CufRe4Qx.js","/assets/HeatmapChart-DVrc3NAN.js","/assets/HourlyContainers-CIRkUfEY.js","/assets/IdleCell-B51KJxrU.js","/assets/IdleOwners-DePTfnLL.js","/assets/IdleSolutions-YSXhJD9P.js","/assets/KPICard-Cw5WW5n_.js","/assets/Kaizen-D_XYE5KG.js","/assets/Kelish-Dai-gNDa.js","/assets/Kitchen-DfmGMCVE.js","/assets/KpiBits-B-uVsfrV.js","/assets/KpiDeltaCard-IzW7NaH3.js","/assets/LangContext-2A4sPKlL.js","/assets/LangTextInput-Kofaohjz.js","/assets/Layout-IuRst2y4.js","/assets/LeaderAppeal-DiVhzoBZ.js","/assets/LeaderDailyTasks-E1dQPzRq.js","/assets/LeaderDayReport-CxuYLeHu.js","/assets/LeaderNotCounting-DIfwJmUX.js","/assets/LeaderTasksAdmin-BFteXkmA.js","/assets/LeaderUnitReport-DPIM7Ks7.js","/assets/Leaderboard-TLTtMHL8.js","/assets/Leaders-C2Wrz4xU.js","/assets/LeadersKpi-DWJaVwM2.js","/assets/Lightbox--W_XKy1M.js","/assets/LiveOverview-n4P9xpSC.js","/assets/Login-CwPv_krM.js","/assets/Logs-Dea8J11G.js","/assets/LostWorkers-BvOk2tEj.js","/assets/Meter-CRRHrYuq.js","/assets/NotFound-BnzbosfL.js","/assets/Notifications-DOdjvQmI.js","/assets/NotionTasks-Dmh-PwjU.js","/assets/NotionTrackerSettings-DnobzSuH.js","/assets/Ontime-DThp1ur-.js","/assets/OrgChart-MNKGif6l.js","/assets/Ovens-6ZkppIAv.js","/assets/OvensSettings-CwShFByQ.js","/assets/Overview-BYgDyube.js","/assets/OwnerChip-CQb4v259.js","/assets/Pagination-Bm2t9Iq_.js","/assets/People-Dy4t39-X.js","/assets/PerenaladkaFactTable-DanZHQa1.js","/assets/Permissions-DKfJH-Gy.js","/assets/PersonCard-CjsKfEoy.js","/assets/PlanFulfillment-DQYyPL_C.js","/assets/Production-BaYrpqYD.js","/assets/ProductionUpload-CfIoiiEM.js","/assets/Profile-C7eOhLJu.js","/assets/ProfileAvatar-Cufm8dKM.js","/assets/ProfilesManagement-D6AG1981.js","/assets/ProofCamera-DFRr8Xc_.js","/assets/ProofPhoto-DHC9M8GY.js","/assets/Quality-BRFo-aKA.js","/assets/RawRows-DDiapynU.js","/assets/Reports-gXeIxI6y.js","/assets/RequestStateChip-PjLmWvwl.js","/assets/RichTextEditor-L2HBJ6fv.js","/assets/SaveState-BMwt2suA.js","/assets/SdPanelSettings-D3wTjx0A.js","/assets/SearchInput-BXgzMNHw.js","/assets/SeasonalityHeatmap-B65j5wfW.js","/assets/SegmentedToggle-CIxWlaZZ.js","/assets/SetupTimes-D8Pgx6pT.js","/assets/ShiftDaily-CngsQ1w7.js","/assets/ShiftTimes-DBv-wsgl.js","/assets/SortableList-DgrUPWKx.js","/assets/Staff-Hdne_MaL.js","/assets/StaffListAtCheck-BPMoE6ui.js","/assets/StatusBadge-UWKHw3Au.js","/assets/StatusBandsModal-69kwEIrs.js","/assets/TargetGoal-DvcrkRZD.js","/assets/Targets-lMIEIY-Q.js","/assets/TaskFormModal-CEJ891Bo.js","/assets/TaskerSettings-Dx8zD3YS.js","/assets/Tasks-CLULDBfP.js","/assets/TgProfile-CyX5ynju.js","/assets/TimeWheelPicker-D9c9xG7U.js","/assets/Toast-DLkPq-u6.js","/assets/Tooltip-Cd0j8XOq.js","/assets/TranslationsEditor-DpLiuiLd.js","/assets/TrelloAnalytics-Cvc5UrRa.js","/assets/TrelloSettings-D0pfit4u.js","/assets/TrendChart-IpecDfKZ.js","/assets/TripleSpeedometer-8cla-TnB.js","/assets/Trudoyomkost-DDwDgdEt.js","/assets/UploadDropzone-Ckl6lJR3.js","/assets/UsersActivity-DRPiQPI6.js","/assets/UsersManagement-DQ0MEgO3.js","/assets/VerdictBlock-CcZTsjz1.js","/assets/VerifixPage-DrEqL20K.js","/assets/VerifixParity-B0iY941V.js","/assets/VfxApiMap-CsouHukE.js","/assets/VfxDictionaries-K4bK-UCj.js","/assets/VfxEmployees-B8RLBQc6.js","/assets/VfxHrMoves-C1zTR_RR.js","/assets/VfxJobs-Be6bXRZu.js","/assets/VfxPhoto-BP1f83xU.js","/assets/VfxShifts-D8ajMUiR.js","/assets/VfxState-sQIudA5t.js","/assets/VfxTimebooks-DdG5fDnC.js","/assets/VfxTimesheet-9YIhmEFt.js","/assets/WatchProgress-BWCiiiDV.js","/assets/WebLogin-DkfrtSUr.js","/assets/WorkersAttendance-POdePB1r.js","/assets/WorkersComposition-4H84FK8u.js","/assets/WorkersMovements-DN4ZGZqJ.js","/assets/WorkersPage-DQvjoEUO.js","/assets/Zagruzka-C8DL3SZP.js","/assets/ZagruzkaCell-DlHrgsBs.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-ByG7aCoE.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-DhuoW_bm.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-CLVXVOrj.js","/assets/broadcastTree-CjL6VyTw.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-BFRWyzrp.js","/assets/cellMoveRefusal-ccRjvddo.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/clipboard-x-LyftKmGj.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-ElVfhAej.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-Ck_6KD5A.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/flowUtil-De5HxuAC.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BH54YsjB.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-3C9H29AT.css","/assets/index-BCN-F3X0.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-DOObsLhY.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-y1lxGdMt.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CaZl1ktg.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-CUBVn8lY.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-DvYatnXI.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-Dnhkyw0f.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DGskdIYF.js","/assets/ru-C9EepN2q.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-w1y9KKz1.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-B3ECK2dX.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-ChfDr16y.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-BZW7jlxU.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-DPHHzvgC.js","/assets/useMutation-gXHrcP4G.js","/assets/useOpenParam-LXm99Drh.js","/assets/useStatusBands-3v0Cl0Hi.js","/assets/useUrlScope-Dji6UUDS.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-B-AJbYck.js","/assets/uz_cyrl-C8vSICMj.js","/assets/vfx-DnmOa87k.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-C8RcT6bJ.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/x-CfYkDDdF.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
