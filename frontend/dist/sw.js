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

const BUILD = "2026-11-03T12:20:57.160Z";
const PRECACHE = ["/","/assets/ActionHistory-B00mwBjx.js","/assets/AdminPage-ZSThW85w.js","/assets/AiKeys-CJY0l9vt.js","/assets/AnalysisBoard-DXKoTJj8.js","/assets/AppLauncher-CNTvVKBg.js","/assets/Arc-If3YPzz3.js","/assets/Assessment-CFd6uCP-.js","/assets/AssessmentGrade-Dgdcs0Nj.js","/assets/AssessmentList-ekRj-QIs.js","/assets/Assistant-DoNa0Rmo.js","/assets/AttendanceCleanup-CU4Yxfgr.js","/assets/AttendanceUpload-CDV5A-oQ.js","/assets/BrigadirProfile-AK4a8u8-.js","/assets/BrigadirsKpi-BsmVq9rs.js","/assets/Broadcast-D9SVMwyX.js","/assets/BroadcastReceivers-96rOMNjh.js","/assets/BroadcastRecord-BlF3oA50.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-B4WC7HnW.js","/assets/CategoryLegendModal-BKRDp27Z.js","/assets/CellConcerns-DA76DiGN.js","/assets/CellDetails-CiispQhJ.js","/assets/CellFormModal-DbdcbW7b.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-3wJ1tmqC.js","/assets/Cells-BEFTdqIb.js","/assets/ColumnFilter-o1LMxXtw.js","/assets/ColumnsPicker-B7eWDbI-.js","/assets/CommentsModal-ByAVL_v6.js","/assets/ComparisonTable-9__xl4Rp.js","/assets/Concerns-DU4-MHLI.js","/assets/ConcernsPieces-BZvP0kNL.js","/assets/CountStepper-CPA8c_JO.js","/assets/Daily-dXwJVRdo.js","/assets/DataSources-D5n6-GxF.js","/assets/DataTable-DLt2CtyU.js","/assets/DateRangePicker-D-0lkgYV.js","/assets/DayReportView-CAuCor0Z.js","/assets/DayStepper-CY4pcKST.js","/assets/DayStrip-Chayhb-j.js","/assets/DbBackup-BlWUWi9d.js","/assets/DifferenceBreakdown-BwcURHCq.js","/assets/DocAudit-BzXw2Tk_.js","/assets/Downtime-D-Zt5WZS.js","/assets/Education-DBukvZt_.js","/assets/EducationLesson-nTnN6VE5.js","/assets/EmptyState-C6_lr1D3.js","/assets/Exam-BLe0YQ-H.js","/assets/ExamAdmin-B_i7zl_J.js","/assets/Factories-1Ym4t5RF.js","/assets/FactorySelect-BUbYwhmI.js","/assets/Gamification-c9zq9IvO.js","/assets/GroupBadge-Da2DgTXJ.js","/assets/HeatmapChart-B36A0Mrk.js","/assets/IdleCell-D9fuTDS5.js","/assets/IdleOwners--pb-Hnie.js","/assets/IdleSource-DrwvVvP9.js","/assets/KPICard-CtfFv2o4.js","/assets/Kaizen-BH-vRNe1.js","/assets/Kelish-x2jt2St0.js","/assets/KpiBits-BDK14k5w.js","/assets/KpiDeltaCard-CA-UKnq-.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-DJLnNYnZ.js","/assets/LeaderAppeal-Bri52lTT.js","/assets/LeaderCutoffs-DsQ9vOfO.js","/assets/LeaderDailyTasks-Bkn1arrk.js","/assets/LeaderDayExclusions-CU-Cwt4T.js","/assets/LeaderDayReport-CdrfwbCV.js","/assets/LeaderTasksAdmin-CF2vBbYm.js","/assets/LeaderUnitReport-CKm7f1WH.js","/assets/Leaderboard-prz2X42f.js","/assets/Leaders-C-UXBHzm.js","/assets/LeadersKpi-BPdZCSvj.js","/assets/Lightbox-1q1r0vdz.js","/assets/LiveOverview-0ozP7Z39.js","/assets/Login-DhGCd8Ul.js","/assets/Logs-i_8stT71.js","/assets/LostWorkers-CeGirJtm.js","/assets/NotFound-BNpSlt1j.js","/assets/Notifications-DIOaENNX.js","/assets/NotionTasks-CgIt545x.js","/assets/NotionTrackerSettings--C_W3-Zi.js","/assets/Ontime-Bk015acA.js","/assets/Overview-7UHz0kRt.js","/assets/PageAccess-AR_o1748.js","/assets/Pagination-DbSk3uKq.js","/assets/People-DpTWds75.js","/assets/PerenaladkaFactTable-C0D2pdqe.js","/assets/Permissions-B-nj-QRu.js","/assets/PersonCard-C6fb5UNh.js","/assets/PlanFulfillment-Dc-h6moO.js","/assets/Production-BQy02pOQ.js","/assets/ProductionUpload-B9qTHpUB.js","/assets/Profile-BmOCw04x.js","/assets/ProfileAvatar-B0ko1Wfi.js","/assets/ProfilesManagement-DHAzU3L7.js","/assets/ProofCamera-7d7EFSWv.js","/assets/ProofPhoto-BW6EmOtW.js","/assets/Quality-BNnfKmEl.js","/assets/RawRows-DoeNWsxq.js","/assets/Reports-eo-evNAy.js","/assets/RequestStateChip-MdpXmFr1.js","/assets/RichTextEditor-gw-19YCt.js","/assets/SaveState-B4W7o5b7.js","/assets/SearchInput-BrFQ9AnR.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-BAxrc7ca.js","/assets/ShiftDaily-CNOfLOBa.js","/assets/ShiftTimes-B8gn6I2N.js","/assets/Staff-B37KKbvI.js","/assets/StaffListAtCheck-CI93TEnL.js","/assets/StatusBadge-DOeQcPZE.js","/assets/StatusBandsModal-BlyV9oY3.js","/assets/TargetGoal-rHpw5qZ3.js","/assets/Targets-C_z4ja_i.js","/assets/Tasks-D6yLjYyp.js","/assets/TimeWheelPicker-i4kVdqFj.js","/assets/Tooltip-Dzudu94X.js","/assets/TranslationsEditor-CYK5LcaB.js","/assets/TrelloAnalytics-ZlPYwSvZ.js","/assets/TrelloSettings-8j3DcH_O.js","/assets/TrendChart-CbLPc7U5.js","/assets/TripleSpeedometer-C61jUzkB.js","/assets/Trudoyomkost-Cfb8P0VC.js","/assets/UploadDropzone-Cq0c5dw4.js","/assets/UsersActivity-aGg16o_k.js","/assets/UsersManagement-zlbTobyn.js","/assets/VerdictBlock-B3iWvOsH.js","/assets/VerifixParity-D64-T38q.js","/assets/VerifixSettings-iKNMD1vJ.js","/assets/VerifixSync-DLOuHND2.js","/assets/VfxApiMap-sN9lSqUu.js","/assets/VfxDictionaries-D3hHyJWI.js","/assets/VfxEmployees-CTo7IZyK.js","/assets/VfxHrMoves-CJM1QLmx.js","/assets/VfxJobs-BhZ1nVB_.js","/assets/VfxPhoto-DnV77ym5.js","/assets/VfxShifts-Orz4CBu7.js","/assets/VfxState-BGik4n4A.js","/assets/VfxTimebooks-DlaAOznA.js","/assets/VfxTimesheet-CGbPHw2x.js","/assets/WatchProgress-DdYHvant.js","/assets/WebLogin-sORUr8Ih.js","/assets/WorkersAttendance-yWM3q6hM.js","/assets/WorkersComposition-C79ycABv.js","/assets/WorkersMovements-S24QNF7h.js","/assets/WorkersPage-D4QpS8T6.js","/assets/Zagruzka-BkRLQb8K.js","/assets/ZagruzkaCell-Bw0RNd9U.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-GE3WPMLQ.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-BAV3D80Z.js","/assets/broadcastTree-Dj77aWly.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-ZXoEswoW.js","/assets/cellMoveRefusal-CpETa0l8.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-Baf6W8u-.js","/assets/corner-down-right-DSXOdXzC.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/download-BtnXpzPN.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-DyYsswdB.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CLPTQFkH.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-8FKzN8iU.js","/assets/index-CVMwwzgw.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-C2cQjqwA.js","/assets/lightbulb-a8Qz29R8.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-42bfJfZL.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-HjCwc8Bv.js","/assets/repeat-DIs-1u7-.js","/assets/ru-Bj7jp3zk.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-B0fkL31k.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-Bd7tuYd7.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-wn6-t8L3.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-D09XNEpq.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-HDzYn8z5.js","/assets/useMutation-CFmqvLY8.js","/assets/useOpenParam-CP3TFLfx.js","/assets/useStatusBands-capYUpbk.js","/assets/useUrlScope-BecxJFfe.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-dMhIeXhw.js","/assets/uz_cyrl-Beex0g8A.js","/assets/vfx-D_qMDN9Q.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-Rql3rKqt.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
