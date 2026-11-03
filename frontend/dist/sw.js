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

const BUILD = "2026-11-03T10:29:11.729Z";
const PRECACHE = ["/","/assets/ActionHistory-WlwEX9NX.js","/assets/AdminPage-DI2h6xcz.js","/assets/AiKeys-CMSxui-e.js","/assets/AnalysisBoard-Bog3S097.js","/assets/AppLauncher-CsIY7IYE.js","/assets/Arc-w6MmWM0s.js","/assets/Assessment-wxwEEWCd.js","/assets/AssessmentGrade-DYqqU3Nn.js","/assets/AssessmentList-BengQyDo.js","/assets/Assistant-BpfZK9Gt.js","/assets/AttendanceCleanup-BIGZsXsN.js","/assets/AttendanceUpload-BlJuD5ia.js","/assets/BrigadirProfile-BqkRRqZ3.js","/assets/BrigadirsKpi-DO4Z39gt.js","/assets/Broadcast-DV-HEGci.js","/assets/BroadcastReceivers-CTDmRIww.js","/assets/BroadcastRecord-DGYIzNWg.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-DWaBphI0.js","/assets/CategoryLegendModal-CpQbp87C.js","/assets/CellConcerns-D07S4p-k.js","/assets/CellDetails-DzVKQCW-.js","/assets/CellFormModal-DIMD7BXX.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-C4iF5H-N.js","/assets/Cells-5B7Qs_Er.js","/assets/ColumnFilter-CJEAKbQx.js","/assets/ColumnsPicker-5gg3Mpq2.js","/assets/CommentsModal-BhDZ-Hpy.js","/assets/ComparisonTable--cCvetPl.js","/assets/Concerns-Cy2GWHID.js","/assets/ConcernsPieces-B0rUEcGl.js","/assets/CountStepper-NjYaQOmc.js","/assets/Daily-BxYnydQE.js","/assets/DataSources-BtA1056q.js","/assets/DataTable-BQiXTyKq.js","/assets/DateRangePicker-BEtsYGz2.js","/assets/DayReportView-C4uS_L_5.js","/assets/DayStepper-pumzXBBI.js","/assets/DayStrip-D5sd-AfG.js","/assets/DbBackup-Ctb4U9VC.js","/assets/DifferenceBreakdown-jHCYMzkz.js","/assets/DocAudit-DW4hX1gf.js","/assets/Downtime-DL18PZdU.js","/assets/Education-BkMjuyLq.js","/assets/EducationLesson-bQqbhzre.js","/assets/EmptyState-BHzXZJIl.js","/assets/Exam-Db12QxYG.js","/assets/ExamAdmin-DZm8Esnv.js","/assets/Factories-D8ALNdVM.js","/assets/FactorySelect-B9pvuFOd.js","/assets/Gamification-Bz0jIrf3.js","/assets/GroupBadge-Cadzbd96.js","/assets/HeatmapChart-DyRvWPSE.js","/assets/IdleCell-MvMYvpaX.js","/assets/IdleOwners-B5FxRM41.js","/assets/IdleSource-DQ2rgPBD.js","/assets/KPICard-CDDPU2oV.js","/assets/Kaizen-XeQbWD_g.js","/assets/Kelish-CLu5YDpI.js","/assets/KpiBits-B5IP-6MI.js","/assets/KpiDeltaCard-BRe_BDQ0.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-O0RZCqM4.js","/assets/LeaderAppeal-GnsgiaDq.js","/assets/LeaderCutoffs-C-8dUNwe.js","/assets/LeaderDailyTasks-CQblcK6L.js","/assets/LeaderDayExclusions-DxMSrRtT.js","/assets/LeaderDayReport-C-VSr8-8.js","/assets/LeaderTasksAdmin-BCoFVVjG.js","/assets/LeaderUnitReport-B1-WVvZh.js","/assets/Leaderboard-CkotB2nk.js","/assets/Leaders-CZLM48P4.js","/assets/LeadersKpi-BVqOcXAW.js","/assets/Lightbox-btvVHZPn.js","/assets/LiveOverview-CMegtcsM.js","/assets/Login-bKZgPyKm.js","/assets/Logs-Dq1nOhS2.js","/assets/LostWorkers-CDbcjjy6.js","/assets/NotFound-Bgt-3mFR.js","/assets/Notifications-CtvPAYkv.js","/assets/NotionTasks-CdOr-77b.js","/assets/NotionTrackerSettings-DTpHvE0E.js","/assets/Ontime-BGRl2axW.js","/assets/Overview-DBxM4G5k.js","/assets/PageAccess-BPCgeGhq.js","/assets/Pagination-Bf8azJTw.js","/assets/People-D-GToke6.js","/assets/PerenaladkaFactTable-CSVGpYfF.js","/assets/Permissions-BQBxyyJ7.js","/assets/PersonCard-r8rDNUuH.js","/assets/PlanFulfillment-Dv0eP6BZ.js","/assets/Production-DZockPzT.js","/assets/ProductionUpload-0wIAqEfW.js","/assets/Profile-CGNKuzn6.js","/assets/ProfileAvatar-B0o4IDtY.js","/assets/ProfilesManagement-CXK5YmWr.js","/assets/ProofCamera-CwabSR9N.js","/assets/ProofPhoto-JdzrVBb4.js","/assets/Quality-BrqS9Dv0.js","/assets/RawRows-Dnra63sf.js","/assets/Reports-B0Oa0TMl.js","/assets/RequestStateChip-sdizWqyk.js","/assets/RichTextEditor-D50q3Wb4.js","/assets/SaveState-DY6X6VyO.js","/assets/SearchInput-DL_UFA8a.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-DKx6nyPx.js","/assets/ShiftDaily-CoxpLSfW.js","/assets/ShiftTimes-CMzqi4Sv.js","/assets/Staff-Dvdi4dIP.js","/assets/StaffListAtCheck-C4cuRFx0.js","/assets/StatusBadge-ERrWQJFB.js","/assets/StatusBandsModal-BtIU86ZB.js","/assets/TargetGoal-C0__EjK5.js","/assets/Targets-CnOPfoZ_.js","/assets/Tasks-DNMqzp15.js","/assets/TimeWheelPicker-DWiLAqLQ.js","/assets/Tooltip-BQ7CnF7L.js","/assets/TranslationsEditor-BVs76fob.js","/assets/TrelloAnalytics-B8XId_C8.js","/assets/TrelloSettings-DpRgXoNC.js","/assets/TrendChart-lrdbJ9IK.js","/assets/TripleSpeedometer-CuEPy7YT.js","/assets/Trudoyomkost--_xpw_s-.js","/assets/UploadDropzone-BWgfXUnd.js","/assets/UsersActivity-BU9rPEJ6.js","/assets/UsersManagement-DkQyqn4i.js","/assets/VerdictBlock-CdYokyH7.js","/assets/VerifixParity-BpricT-C.js","/assets/VerifixSettings-CQ4JwuTg.js","/assets/VerifixSync-C1ewALpu.js","/assets/VfxApiMap-ClCcjup3.js","/assets/VfxDictionaries-Cg6c71gl.js","/assets/VfxEmployees-DtDnfGhz.js","/assets/VfxHrMoves-DINPHF9V.js","/assets/VfxJobs-BU_LEl1_.js","/assets/VfxPhoto-DY09x0X5.js","/assets/VfxShifts-GEROEjYQ.js","/assets/VfxState-Do_nuEzD.js","/assets/VfxTimebooks-CwJKuH8a.js","/assets/VfxTimesheet-DYNjrNbV.js","/assets/WatchProgress-BqcupLaQ.js","/assets/WebLogin-kRM_gWg0.js","/assets/WorkersAttendance-DHQh9UC5.js","/assets/WorkersComposition-B7rnpOtd.js","/assets/WorkersMovements-CkGN-D6a.js","/assets/WorkersPage-BEG_muaM.js","/assets/Zagruzka-DEegFE9n.js","/assets/ZagruzkaCell-9Ih7YnBO.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-DPqnKsUo.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-BfVXHstj.js","/assets/broadcastTree-8CFVdrvS.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-DYxkIs8M.js","/assets/cellMoveRefusal-C--3OqYq.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-CQYjSrGQ.js","/assets/corner-down-right-DSXOdXzC.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/download-BtnXpzPN.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-DyYsswdB.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CnRaTP8k.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BEyB_8yg.js","/assets/index-DMuJpnCb.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-BCLSR3W4.js","/assets/lightbulb-a8Qz29R8.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-CALRTA4o.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-k3j-G16w.js","/assets/repeat-DIs-1u7-.js","/assets/ru-Bj7jp3zk.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-zgdoMsEC.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-Bd7tuYd7.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-wn6-t8L3.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-NfPqvchP.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-Sn_1HpPo.js","/assets/useMutation-CkHWXFe8.js","/assets/useOpenParam-C_LXfy4U.js","/assets/useStatusBands-R7TXha_q.js","/assets/useUrlScope-DFnpUJS3.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-dMhIeXhw.js","/assets/uz_cyrl-Beex0g8A.js","/assets/vfx-BL41g9Sp.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-ClUJATYY.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
