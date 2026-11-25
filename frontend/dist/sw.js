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

const BUILD = "2026-11-25T05:34:32.827Z";
const PRECACHE = ["/","/assets/AdminPage-BLN2D7Xm.js","/assets/AdminTabs-BvOPCKX_.js","/assets/AiKeys-kfaeT__5.js","/assets/AnalysisBoard-2m4CStGa.js","/assets/ApiAccess-Bc8qecM_.js","/assets/AppLauncher-DAx4sx6j.js","/assets/Arc-Bde-B8lU.js","/assets/Assessment--5IlNFrA.js","/assets/AssessmentGrade-BcvGeI2U.js","/assets/AssessmentList-DSfOwc3g.js","/assets/Assistant-C1-SoXIH.js","/assets/AttendanceCleanup-BdT_B7Gp.js","/assets/AttendanceUpload-D-IurXL3.js","/assets/AuditTable-BJL-jhLJ.js","/assets/Audits-xZ0eOd_b.js","/assets/BolimsModal-DD2Mn8he.js","/assets/BrigadirProfile-CbwbrQb4.js","/assets/BrigadirsKpi-DyYjvynj.js","/assets/Broadcast-CnLXgRLj.js","/assets/BroadcastReceivers-CG_BonhN.js","/assets/BroadcastRecord-DQEotUpo.js","/assets/CatLockNotice-DoBPZ3Wb.js","/assets/CategoryLegendModal-qcZywPh_.js","/assets/CellConcerns-BOEkCwGc.js","/assets/CellDetails-DLU9gOq9.js","/assets/CellFormModal-BPeG8KcE.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-BoKJJCbu.js","/assets/Cells-QqlD-BhL.js","/assets/ColumnFilter-DbLsf2SA.js","/assets/ColumnsPicker-DK4Pdxq0.js","/assets/CommentsModal-CjCm0zxd.js","/assets/ComparisonTable-B4aXcYiY.js","/assets/Concerns-DjBPbHoX.js","/assets/ConcernsPieces-BrYm0Wk4.js","/assets/ContainerBolims-CO3qTneM.js","/assets/ContainerFlow-CtsKp_VC.js","/assets/ContainerTotalsCard-C9Qon8Nk.js","/assets/Containers-T2OlqPb0.js","/assets/CountStepper-Ciit-CXT.js","/assets/Daily-B30Zc25v.js","/assets/DataSources-BGwM_C2C.js","/assets/DataTable-BQUDoC0w.js","/assets/DateRangePicker-LqwA6LPU.js","/assets/DayReportView-asfl6Rjc.js","/assets/DayStepper-Brf2sUAU.js","/assets/DayStrip-BJRe3-s8.js","/assets/DbBackup-BVDDBobC.js","/assets/DifferenceBreakdown-BydoxqM4.js","/assets/DocAudit-B20sCVb4.js","/assets/Downtime-BszDqWBa.js","/assets/Education-DFRrRbS6.js","/assets/EducationLesson-B5UCI_aL.js","/assets/EmptyState-BBflNmt7.js","/assets/Equipment-CQpYuBe3.js","/assets/Exam-fd9zsD8U.js","/assets/ExamAdmin-CmpBEHm_.js","/assets/Factories-CaFUxMZz.js","/assets/FactorySelect-AimN50CF.js","/assets/Gamification-IcA0HeWT.js","/assets/GroupBadge-BZQ4SBy4.js","/assets/HeatmapChart-D1E_JMYC.js","/assets/HourlyContainers-B13_tw4n.js","/assets/IdleCell-MXoVV8mf.js","/assets/IdleOwners-ZbfNTbsL.js","/assets/IdleSolutions-BhglmAMp.js","/assets/KPICard-f2VtSs_U.js","/assets/Kaizen-pJ9-WbRA.js","/assets/Kelish-DoplC4bt.js","/assets/Kitchen-CRWvTvJ3.js","/assets/KpiBits-C9bKcHqF.js","/assets/KpiDeltaCard-TDqOugXG.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-B_l-tgte.js","/assets/LeaderAppeal-CgTS_Omi.js","/assets/LeaderDailyTasks-DypoyRwI.js","/assets/LeaderDayReport-CnRfCFiy.js","/assets/LeaderNotCounting-CCpBQlyn.js","/assets/LeaderTasksAdmin-BQtLZH-D.js","/assets/LeaderUnitReport-_qIOaZvj.js","/assets/Leaderboard-J0loL8zb.js","/assets/Leaders-DGEQQ0gA.js","/assets/LeadersKpi-DAcZVk50.js","/assets/Lightbox-DSfoF-NF.js","/assets/LiveOverview-CsaIYPh6.js","/assets/Login-BPxf7vZO.js","/assets/Logs-B9nG5rW5.js","/assets/LostWorkers-DUuZGoWy.js","/assets/NotFound-B7xTRc2h.js","/assets/Notifications-BSXEV0PD.js","/assets/NotionTasks-MT1vfkgu.js","/assets/NotionTrackerSettings-BgnesEC2.js","/assets/Ontime-CXAyfXRa.js","/assets/OrgChart-Bey3Cnq1.js","/assets/Ovens-HI7pzJjk.js","/assets/OvensSettings-CVHIAd3b.js","/assets/Overview-B7SaX03j.js","/assets/OwnerChip-_KOnuFJD.js","/assets/Pagination-BaVFHIEc.js","/assets/People-CEJkSZFq.js","/assets/PerenaladkaFactTable-CSjqLwyp.js","/assets/Permissions-CQUJf8ml.js","/assets/PersonCard-CHArVY60.js","/assets/PlanFulfillment-G2AHs6fT.js","/assets/Production-egg8ElTJ.js","/assets/ProductionUpload-C9jmaUZx.js","/assets/Profile-BFRFqWuK.js","/assets/ProfileAvatar-Dg1AoyUi.js","/assets/ProfilesManagement-COOihiiZ.js","/assets/ProofCamera-BZSFKhRy.js","/assets/ProofPhoto-D8cUpRKz.js","/assets/Quality-CC-LeFGM.js","/assets/RawRows-BPWqsELe.js","/assets/Reports-DhVSOYny.js","/assets/RequestStateChip-CcMhZKE4.js","/assets/RichTextEditor-BqVUETQn.js","/assets/SaveState-C8J_mIaY.js","/assets/SdPanelSettings-Ctc1RLme.js","/assets/SearchInput-4a2sglfT.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-BMb_tdu4.js","/assets/ShiftDaily-VtiXxU6J.js","/assets/ShiftTimes-auJ1gQVB.js","/assets/SkuHistory-Db0Pq5Rc.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-CpFNya0N.js","/assets/StaffListAtCheck-DVhZmAfa.js","/assets/StatusBadge-CzHBPr83.js","/assets/StatusBandsModal-IEYzUunr.js","/assets/TargetGoal-BDuA8zDu.js","/assets/Targets-CyTTg9cj.js","/assets/TaskFormModal-CPlQxPfT.js","/assets/TaskerSettings-DDczX4ut.js","/assets/Tasks-D-wHfD31.js","/assets/TgProfile-CIDAE4K1.js","/assets/TimeWheelPicker-Cohse4Bm.js","/assets/Tooltip-BV1v5RAQ.js","/assets/TranslationsEditor-yeV53Ncx.js","/assets/TrelloAnalytics-Y3VT3qdW.js","/assets/TrelloSettings-gXqJEbaR.js","/assets/TrendChart-69xY8FKl.js","/assets/TripleSpeedometer-DwtqLDuc.js","/assets/Trudoyomkost-CfOZvYrr.js","/assets/UploadDropzone-Boj_gfKS.js","/assets/UsersActivity-CiXc_DA8.js","/assets/UsersManagement-BD3FrSyU.js","/assets/VerifixPage-XF0yjllE.js","/assets/VerifixParity-C_A20lAK.js","/assets/VfxApiMap-u3XIe73F.js","/assets/VfxDictionaries-Cv04AVIq.js","/assets/VfxEmployees-P3W0p_9K.js","/assets/VfxHrMoves-Cp0Cenri.js","/assets/VfxJobs-CkP98y8m.js","/assets/VfxPhoto-BTyzlCX1.js","/assets/VfxShifts-BXQq9zhD.js","/assets/VfxState-BwnhP1AQ.js","/assets/VfxTimebooks-CLM8SFho.js","/assets/VfxTimesheet-DtHOo6ij.js","/assets/WatchProgress-CTDkiY4T.js","/assets/WebLogin-Cbn0RUqF.js","/assets/WorkersAttendance-h02ky0-v.js","/assets/WorkersComposition-C35yIwCM.js","/assets/WorkersMovements-CfJLEn66.js","/assets/WorkersPage-BnPYdKW6.js","/assets/Zagruzka-DAFISIWV.js","/assets/ZagruzkaCell-CbGLuL-u.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BppLNOqU.js","/assets/api-D_IoyhCc.js","/assets/appealTask-Du6FO-1p.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-DR3PcdVd.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/bolim-TbqNYNfw.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-CE0Y8V1l.js","/assets/broadcastTree-BWZ8l2xG.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-xTaZsVWy.js","/assets/categories-BS7AfeKq.js","/assets/cellMoveRefusal-BoL1Uz65.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-CfwZBIkA.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-CrQRnHYW.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-CQyTcM5A.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DhvWpRl3.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CWd8ofOo.js","/assets/index-DVB0Dg__.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-D-jYivgD.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/marks-NY85vwXh.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil--c7_qHZJ.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CPWcmfn_.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-DGhQ38bs.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-CGKmgtAQ.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-DBIJxhyx.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-DvMxJtNh.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-Be5BpqeU.js","/assets/useMutation-C_6cclOr.js","/assets/useOpenParam-olXV8cr8.js","/assets/useStatusBands-8w-K0y5n.js","/assets/useUrlScope-DE2QgQ4w.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-rMPN9hqg.js","/assets/uz_cyrl-CYhVcHmH.js","/assets/vfx-t354Jgz0.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-DMJmU8Ki.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
