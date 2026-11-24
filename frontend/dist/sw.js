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

const BUILD = "2026-11-24T04:32:48.599Z";
const PRECACHE = ["/","/assets/AdminPage-Bdx0WL13.js","/assets/AdminTabs-Bcd5rg9s.js","/assets/AiKeys-hH6q-0VV.js","/assets/AnalysisBoard-DdLDi86M.js","/assets/ApiAccess-DTnJxdN1.js","/assets/AppLauncher-CbDp5INt.js","/assets/Arc-CUTIgAHD.js","/assets/Assessment--CMltyjK.js","/assets/AssessmentGrade-C5FPtm48.js","/assets/AssessmentList-HnrnBbMf.js","/assets/Assistant-DPj_UnuA.js","/assets/AttendanceCleanup-zSCGguPU.js","/assets/AttendanceUpload-Cmt-xGry.js","/assets/AuditTable-DbRI1kz3.js","/assets/Audits-u3lZgN4Y.js","/assets/BolimsModal-CStj7D02.js","/assets/BrigadirProfile-Bhey_tG6.js","/assets/BrigadirsKpi-daEkJzGi.js","/assets/Broadcast-BKQ7YgZ7.js","/assets/BroadcastReceivers-C7JJXaFc.js","/assets/BroadcastRecord-CiqWPile.js","/assets/CatLockNotice-D_RKmfQf.js","/assets/CategoryLegendModal-DdFhPLfs.js","/assets/CellConcerns-CfHgS77W.js","/assets/CellDetails-CpuKeSGE.js","/assets/CellFormModal-DFw3Uo0f.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-2C-kKZks.js","/assets/Cells-B3DDsa_o.js","/assets/ColumnFilter-DYPE6AwO.js","/assets/ColumnsPicker-CBtSIEwd.js","/assets/CommentsModal-BeTpzkOP.js","/assets/ComparisonTable-BDriPTqt.js","/assets/Concerns-C7fXc5T3.js","/assets/ConcernsPieces-kB9S-yN5.js","/assets/ContainerBolims-CTAA4ore.js","/assets/ContainerFlow-Dps3yLkS.js","/assets/ContainerTotalsCard-BfmzzR2r.js","/assets/Containers-DH5O2f0J.js","/assets/CountStepper-CrRWcH3P.js","/assets/Daily-BNkfTqZO.js","/assets/DataSources-DLTiuePz.js","/assets/DataTable-CmrAVPG_.js","/assets/DateRangePicker-Dj01hT-T.js","/assets/DayReportView-DNDusKT6.js","/assets/DayStepper-In2pTKdu.js","/assets/DayStrip-Ca6kSVIa.js","/assets/DbBackup-DWGTIVqa.js","/assets/DifferenceBreakdown-CIsau6t0.js","/assets/DocAudit-CjK-OkGo.js","/assets/Downtime-DYOc1IXV.js","/assets/Education-1pc_S73O.js","/assets/EducationLesson-CfnGBbql.js","/assets/EmptyState-2CTHyF0A.js","/assets/Equipment-Dl8-HQDy.js","/assets/Exam-BQXl2PF7.js","/assets/ExamAdmin-BwZR5a8J.js","/assets/Factories-udHvZBrB.js","/assets/FactorySelect-C9iU1n2V.js","/assets/Gamification-C7vBRCSG.js","/assets/GroupBadge-sSxJxpy4.js","/assets/HeatmapChart-BfAz2ARd.js","/assets/HourlyContainers-B-G9hP8_.js","/assets/IdleCell-BQkHwb8E.js","/assets/IdleOwners-CaaBFVVY.js","/assets/IdleSolutions-CqWoX5CO.js","/assets/KPICard-CWz5G8dt.js","/assets/Kaizen-Coznzscl.js","/assets/Kelish-Blx5NLoz.js","/assets/Kitchen-BkoFWjVe.js","/assets/KpiBits-DMxLdMeK.js","/assets/KpiDeltaCard-DT6CCeN0.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-DilRofON.js","/assets/LeaderAppeal-BD7_d-CD.js","/assets/LeaderDailyTasks-DxQCUQYG.js","/assets/LeaderDayReport-yv-Fxj2D.js","/assets/LeaderNotCounting-Ca_WllOH.js","/assets/LeaderTasksAdmin-R20FPlRL.js","/assets/LeaderUnitReport-CGRIATCG.js","/assets/Leaderboard-BbqBQ_x6.js","/assets/Leaders-Cf3AhYyy.js","/assets/LeadersKpi-CIKJ4OGF.js","/assets/Lightbox-DFPzZAQm.js","/assets/LiveOverview-Bvl_Z1QB.js","/assets/Login-CLgSZNjk.js","/assets/Logs-D4Yugyrm.js","/assets/LostWorkers-BlzLyGJz.js","/assets/NotFound-BayXN4Va.js","/assets/Notifications-C1Ta1gu6.js","/assets/NotionTasks-Lr9Fvmmt.js","/assets/NotionTrackerSettings-57OSobrR.js","/assets/Ontime-Cl0mbWbM.js","/assets/OrgChart-B6wC50yt.js","/assets/Ovens-DjRbpM8W.js","/assets/OvensSettings-C4DWr_z2.js","/assets/Overview-CZhwT1UJ.js","/assets/OwnerChip-mKNIPwa8.js","/assets/Pagination-CxKdawWK.js","/assets/People-BCOYad96.js","/assets/PerenaladkaFactTable-DCLu6M9H.js","/assets/Permissions-cNNcoDBw.js","/assets/PersonCard-cm6J3umn.js","/assets/PlanFulfillment-DaYrCPji.js","/assets/Production-BHG7TUh6.js","/assets/ProductionUpload-CXfCpV7H.js","/assets/Profile-D3xs7Z5w.js","/assets/ProfileAvatar-BDw0eO8P.js","/assets/ProfilesManagement-C-EDHjT4.js","/assets/ProofCamera-B2OHEEFz.js","/assets/ProofPhoto-BPna3dm2.js","/assets/Quality-DHqKSXIe.js","/assets/RawRows-rqgPLScW.js","/assets/Reports-CRw1WLDW.js","/assets/RequestStateChip-XsidPDax.js","/assets/RichTextEditor-CP_wiRXQ.js","/assets/SaveState-DjltPW-l.js","/assets/SdPanelSettings-CCsgRdCG.js","/assets/SearchInput-CdIX2yRS.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-5hk4qkzc.js","/assets/ShiftDaily-B1Wd8d8l.js","/assets/ShiftTimes-lRkDUlpB.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-DWYmCsvT.js","/assets/StaffListAtCheck-_TARmBgP.js","/assets/StatusBadge-BDm6FewT.js","/assets/StatusBandsModal-D_TLxNOe.js","/assets/TargetGoal-CkAG-lsF.js","/assets/Targets-Bjwdq0Kg.js","/assets/TaskFormModal-O6IpeSc0.js","/assets/TaskerSettings-Bf5RQgse.js","/assets/Tasks-b1lXC-2O.js","/assets/TgProfile-C0msI7Lo.js","/assets/TimeWheelPicker-C5gRzmtN.js","/assets/Tooltip-PbqlLqJm.js","/assets/TranslationsEditor-PgORcDz8.js","/assets/TrelloAnalytics-D8SoV8FL.js","/assets/TrelloSettings-B_JNGjAi.js","/assets/TrendChart-DkFwQ1nj.js","/assets/TripleSpeedometer-CTJG9wKT.js","/assets/Trudoyomkost-DUjWfvIg.js","/assets/UploadDropzone-BMncAbaI.js","/assets/UsersActivity--iVi-aCh.js","/assets/UsersManagement-CQxAYwfD.js","/assets/VerifixPage-DXrFDy8T.js","/assets/VerifixParity-8cQOOVOU.js","/assets/VfxApiMap-DTJYBZpx.js","/assets/VfxDictionaries-BFFk0CAH.js","/assets/VfxEmployees-Cd3Kfmv4.js","/assets/VfxHrMoves-BPi6rIpk.js","/assets/VfxJobs-VI2VCmNy.js","/assets/VfxPhoto-BJBBfk3g.js","/assets/VfxShifts-B6_I0G48.js","/assets/VfxState-rgMRBety.js","/assets/VfxTimebooks-BEjwsFlf.js","/assets/VfxTimesheet-CfP1msW1.js","/assets/WatchProgress-M9Qrg6QT.js","/assets/WebLogin-BlQJxm1z.js","/assets/WorkersAttendance-We6bTQqJ.js","/assets/WorkersComposition-B6_Bpn_2.js","/assets/WorkersMovements-BlU6oAUC.js","/assets/WorkersPage-PyG3kyKP.js","/assets/Zagruzka-C19nq6EE.js","/assets/ZagruzkaCell-Czn34ZVu.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BXBMBh6-.js","/assets/api-D_IoyhCc.js","/assets/appealTask-DWvfYWYu.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-FazwvXeM.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/bolim-TbqNYNfw.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-CFufmIbB.js","/assets/broadcastTree-VeT8_rd4.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-CTj_PDH1.js","/assets/categories-BxfCXXsl.js","/assets/cellMoveRefusal-_UziT1Bu.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-DVKMGIj1.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-Bj9z9-3D.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-DAPNcOYP.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BUaxDWM9.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CYPxvPU_.js","/assets/index-Dzcu_ZnS.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-C_9ZENOu.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/marks-CJrF89jf.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-CEMpYHrv.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-D-uJO4pk.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-Cdud1xcc.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-DOvl11EU.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-wnK1gD9I.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-CEZiCWpL.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-BBjEcdnB.js","/assets/useMutation-yHbkeJre.js","/assets/useOpenParam-AUeCmIHd.js","/assets/useStatusBands-Dn9TTN-D.js","/assets/useUrlScope-DVdFn7Pr.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-DGPPOOFP.js","/assets/uz_cyrl-t_Uhpuzd.js","/assets/vfx-CBwjht1k.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-DAYIcZC5.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
