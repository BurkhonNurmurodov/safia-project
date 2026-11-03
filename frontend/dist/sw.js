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

const BUILD = "2026-11-03T05:44:52.938Z";
const PRECACHE = ["/","/assets/ActionHistory-qor0pMAU.js","/assets/AdminPage-DbwZ4M61.js","/assets/AiKeys-iDoVFrvj.js","/assets/AnalysisBoard-6f8tmheM.js","/assets/AppLauncher-DA_XlWp7.js","/assets/Arc-0QNc01sT.js","/assets/Assessment-Bkc1MWTx.js","/assets/AssessmentGrade-CRqWIclI.js","/assets/AssessmentList-B49GossU.js","/assets/Assistant-B4vZDLHc.js","/assets/AttendanceCleanup-DFqkBo5I.js","/assets/AttendanceUpload-C_fgJdDt.js","/assets/BrigadirProfile-DZRPcfpl.js","/assets/BrigadirsKpi-wHMTwwSU.js","/assets/Broadcast-ch2n4chR.js","/assets/BroadcastReceivers-Cnve5oty.js","/assets/BroadcastRecord-DnDQuRdz.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-BXba3e9W.js","/assets/CategoryLegendModal-CQKj16m7.js","/assets/CellConcerns-iMeilNNI.js","/assets/CellDetails-Dm3Oj5Dg.js","/assets/CellFormModal-DRVWHlLT.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-iTWtLlyg.js","/assets/Cells-DFP_ZjMa.js","/assets/ColumnFilter-DluvoeLD.js","/assets/ColumnsPicker-UioxNovM.js","/assets/CommentsModal-DN1_g0p9.js","/assets/ComparisonTable-BHqV7G4j.js","/assets/Concerns-DWK-v80N.js","/assets/ConcernsPieces-CsoJkQxa.js","/assets/CountStepper-D5lP8a_X.js","/assets/Daily-CYsJkVPD.js","/assets/DataSources-BHZJRGn1.js","/assets/DataTable-CP_wJ3O8.js","/assets/DateRangePicker-Bd7s9Y-a.js","/assets/DayReportView-CV6b48rM.js","/assets/DayStepper-i5wasut0.js","/assets/DayStrip-DIQLHK1o.js","/assets/DbBackup-DtHNYM_R.js","/assets/DifferenceBreakdown-Vo-P4N-S.js","/assets/DocAudit-Ce_doP7u.js","/assets/Downtime-Bi3p7W_z.js","/assets/Education-Dbr_tejO.js","/assets/EducationLesson-CduquXOX.js","/assets/EmptyState-CXEpN0kq.js","/assets/Exam-BgGg4c7D.js","/assets/ExamAdmin-BHJU565O.js","/assets/Factories-CN-JRApZ.js","/assets/FactorySelect-bwjw2SiL.js","/assets/Gamification-BNbtB5GD.js","/assets/GroupBadge-BsCDfHx4.js","/assets/HeatmapChart-8tjbQ0Ik.js","/assets/IdleCell-BPVZhk-k.js","/assets/IdleOwners-CSCwthvP.js","/assets/IdleSource-BqtXNzcQ.js","/assets/KPICard-b6OPzFSG.js","/assets/Kaizen-B5_oCOxk.js","/assets/Kelish-reMMhV3I.js","/assets/KpiBits-B3HDzOy0.js","/assets/KpiDeltaCard-BR6zhzB6.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-DW3gMz6Y.js","/assets/LeaderAppeal-Bjv23Qhz.js","/assets/LeaderCutoffs-DxpZf-6s.js","/assets/LeaderDailyTasks-C4-ENSVs.js","/assets/LeaderDayExclusions-CyJzP2bW.js","/assets/LeaderDayReport-Ct1HTh1w.js","/assets/LeaderTasksAdmin-inY1SPol.js","/assets/LeaderUnitReport-C6tXlwy-.js","/assets/Leaderboard-BUbQzlp1.js","/assets/Leaders-Bp9BBhEr.js","/assets/LeadersKpi-U0BRD9Y4.js","/assets/Lightbox-jttDMHhW.js","/assets/LiveOverview-OMof8WDg.js","/assets/Login-iMzamtsG.js","/assets/Logs-G1BE0Z4x.js","/assets/LostWorkers-DtVV1Ujv.js","/assets/NotFound-C0oUj31E.js","/assets/Notifications-CnKovqyh.js","/assets/NotionTasks-Dw4RMcka.js","/assets/NotionTrackerSettings-DhuVMyDN.js","/assets/Ontime-BMxHbf5M.js","/assets/Overview-3MUGeQWJ.js","/assets/PageAccess-C_Ge45zT.js","/assets/Pagination-qFtMpght.js","/assets/People-CMHTkT00.js","/assets/PerenaladkaFactTable-Cfqrj9hH.js","/assets/Permissions-bo6F-bpv.js","/assets/PersonCard-z6-G4G40.js","/assets/PlanFulfillment-ByXoVMC5.js","/assets/Production-CdNb22lk.js","/assets/ProductionUpload-iGWffIHK.js","/assets/Profile-DyTdZjTM.js","/assets/ProfileAvatar-eHy50g_M.js","/assets/ProfilesManagement-C7D-IhTM.js","/assets/ProofCamera-DtY9LXqG.js","/assets/ProofPhoto-CD89oGgo.js","/assets/Quality-DZVWZgEb.js","/assets/RawRows-CCl09Aa3.js","/assets/Reports-DxevXk_i.js","/assets/RequestStateChip-DPmAQwSg.js","/assets/RichTextEditor-DOJXNtgw.js","/assets/SaveState-B_LMn1Qx.js","/assets/SearchInput-CjcPbxy4.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-BFn2wqfY.js","/assets/ShiftDaily-c0G7Z0TD.js","/assets/ShiftTimes-UHohEpZX.js","/assets/Staff-BzEYOk5M.js","/assets/StaffListAtCheck-DaznmHjc.js","/assets/StatusBadge-BdV4ryA4.js","/assets/StatusBandsModal-IK9fqb5j.js","/assets/TargetGoal-sYlVChKg.js","/assets/Targets-BJTxVxAS.js","/assets/Tasks-4TcRmMW5.js","/assets/TimeWheelPicker-C0RZPDeQ.js","/assets/Tooltip-CHSXP2Yn.js","/assets/TranslationsEditor-BoAdK7nx.js","/assets/TrelloAnalytics-s6VxXvEa.js","/assets/TrelloSettings-BF_87MYV.js","/assets/TrendChart-ka8mn9Om.js","/assets/TripleSpeedometer-XXu2D9bz.js","/assets/Trudoyomkost-oX_t_27c.js","/assets/UploadDropzone-rMq5nEUJ.js","/assets/UsersActivity-o2QcLbH1.js","/assets/UsersManagement-pzHaI60j.js","/assets/VerdictBlock-DSMz67BS.js","/assets/VerifixParity-Cai42DlD.js","/assets/VerifixSettings-BaDQkZ5L.js","/assets/VerifixSync-DaKUsV2Y.js","/assets/VfxApiMap-D0yfqALI.js","/assets/VfxDictionaries-CzXFYupk.js","/assets/VfxEmployees-0w8gBIX-.js","/assets/VfxHrMoves-DnYASaVa.js","/assets/VfxJobs-DdsYXIMU.js","/assets/VfxPhoto-BjhS07OM.js","/assets/VfxShifts-CuP56SD0.js","/assets/VfxState-C0Z_-gPH.js","/assets/VfxTimebooks-CO8DSCpW.js","/assets/VfxTimesheet-BUrL1O8w.js","/assets/WatchProgress-CsqbXKzi.js","/assets/WebLogin-BOLd5itk.js","/assets/Workers-CpIlLlCH.js","/assets/Zagruzka-BUujvb67.js","/assets/ZagruzkaCell-ve_Qm8EH.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-VvbnspN_.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-D8bXymGa.js","/assets/broadcastTree-wo2eXQyp.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-BqE_d_cB.js","/assets/cellMoveRefusal-CPApnHeY.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-uhS6KJRy.js","/assets/corner-down-right-DSXOdXzC.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/download-BtnXpzPN.js","/assets/en-CQ3yFwvz.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DGqc3ahT.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CUMCvbHj.js","/assets/index-hfEhtP1n.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard--8Gzbuy6.js","/assets/lightbulb-a8Qz29R8.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-Ce7gGjtI.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BTDx-1vm.js","/assets/repeat-DIs-1u7-.js","/assets/ru-DrDKELn7.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-CWC79Zr5.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-Bd7tuYd7.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-DuV5Lj9B.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-D1cprrTh.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-CwjFu1on.js","/assets/useMutation-7Iv1UQ_j.js","/assets/useOpenParam-CsKcpJO6.js","/assets/useStatusBands-BB2uR8QH.js","/assets/useUrlScope-DJLzDiwt.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-Cy9_BvNV.js","/assets/uz_cyrl-F3L3XRUK.js","/assets/vfx-B_LRgOzO.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-CPFPF00U.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
