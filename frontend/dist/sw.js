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

const BUILD = "2026-11-03T07:07:57.569Z";
const PRECACHE = ["/","/assets/ActionHistory-YYVYjg6D.js","/assets/AdminPage-C3k_tGR5.js","/assets/AiKeys-JZxheMy8.js","/assets/AnalysisBoard-q-tWR1hS.js","/assets/AppLauncher-BFFwB4QX.js","/assets/Arc-ubJB6mtR.js","/assets/Assessment-CktlNKcV.js","/assets/AssessmentGrade-CkMg3GXC.js","/assets/AssessmentList-D3HU2unA.js","/assets/Assistant-E3zhd99F.js","/assets/AttendanceCleanup-A0eE1GQf.js","/assets/AttendanceUpload-MEBhcQL3.js","/assets/BrigadirProfile-B2pTrp86.js","/assets/BrigadirsKpi-DWljE69r.js","/assets/Broadcast-DEShPm2K.js","/assets/BroadcastReceivers-BUgFR148.js","/assets/BroadcastRecord-C_FHQyyJ.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-BlSgvsaI.js","/assets/CategoryLegendModal-DHdLgtay.js","/assets/CellConcerns-Cu5UG7DE.js","/assets/CellDetails-SgKUYrP1.js","/assets/CellFormModal-PiH_g2qA.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-4UaxxJ19.js","/assets/Cells-DDZgTf3x.js","/assets/ColumnFilter-0Iuf6S2a.js","/assets/ColumnsPicker-CnZxEtzh.js","/assets/CommentsModal-Soalyxvu.js","/assets/ComparisonTable-CuCe6ZG3.js","/assets/Concerns-CImRuRaE.js","/assets/ConcernsPieces-C6UWuicf.js","/assets/CountStepper-C-YYAd6d.js","/assets/Daily-lEFeS18A.js","/assets/DataSources-CrDj8ZXv.js","/assets/DataTable-DHACAnM2.js","/assets/DateRangePicker-6QPPta5N.js","/assets/DayReportView-Cv3yHuYd.js","/assets/DayStepper-CzIEM15S.js","/assets/DayStrip-BUr-YizU.js","/assets/DbBackup-GZrGtjrC.js","/assets/DifferenceBreakdown-B-mCrG07.js","/assets/DocAudit-DnLLoGMU.js","/assets/Downtime-C6YqE1ja.js","/assets/Education-DNkmWOf-.js","/assets/EducationLesson-BrnHERQb.js","/assets/EmptyState-BJITOggR.js","/assets/Exam-BArj6fm1.js","/assets/ExamAdmin-C53ExDES.js","/assets/Factories-DvQ0TdrB.js","/assets/FactorySelect-CJ65rAcW.js","/assets/Gamification-B1aVI2BG.js","/assets/GroupBadge-9ikI0Lk9.js","/assets/HeatmapChart-C4TFpN5t.js","/assets/IdleCell-CnPfo4-L.js","/assets/IdleOwners-mC1X3TZQ.js","/assets/IdleSource-tMjiYto_.js","/assets/KPICard-UbU4tNVF.js","/assets/Kaizen-CwHqbSFV.js","/assets/Kelish-jVCnS0BJ.js","/assets/KpiBits-CwyN8yxt.js","/assets/KpiDeltaCard-BxMWNR4n.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-Ce39dYH9.js","/assets/LeaderAppeal-CWsVr3AU.js","/assets/LeaderCutoffs-D2S_WQon.js","/assets/LeaderDailyTasks-C0YJ4M72.js","/assets/LeaderDayExclusions-6rVvyTr9.js","/assets/LeaderDayReport-DLg-flqX.js","/assets/LeaderTasksAdmin-B_qCKpqz.js","/assets/LeaderUnitReport-B-pQ15CX.js","/assets/Leaderboard-DuP8TRNk.js","/assets/Leaders-CXhu5r-2.js","/assets/LeadersKpi-BqMn_bPR.js","/assets/Lightbox-BLNBOBYU.js","/assets/LiveOverview-BAleHIgj.js","/assets/Login-cozm75nh.js","/assets/Logs-Dwy91KJX.js","/assets/LostWorkers-BKdtV8wj.js","/assets/NotFound-DAAzCLLC.js","/assets/Notifications-CdvXvgIl.js","/assets/NotionTasks-DY6yJBxY.js","/assets/NotionTrackerSettings-CXDEHys8.js","/assets/Ontime-CgAslDwa.js","/assets/Overview-C-_NkqeY.js","/assets/PageAccess-DxPPABfj.js","/assets/Pagination-ARidTekd.js","/assets/People-DAG12Lcm.js","/assets/PerenaladkaFactTable-DC1kbJVy.js","/assets/Permissions-VKLMgmsy.js","/assets/PersonCard-C3R2aso3.js","/assets/PlanFulfillment-DcL8v3_0.js","/assets/Production-__NUVOKU.js","/assets/ProductionUpload-DnMrVYpg.js","/assets/Profile-Doji6cg4.js","/assets/ProfileAvatar-73X3GYV0.js","/assets/ProfilesManagement-B7oZHiou.js","/assets/ProofCamera-gq36isX_.js","/assets/ProofPhoto-DZfKE5Xr.js","/assets/Quality-BACmrJp3.js","/assets/RawRows-RF7nv2oy.js","/assets/Reports-DVNRVOZw.js","/assets/RequestStateChip-BRuVAZ8F.js","/assets/RichTextEditor-C3USkoyL.js","/assets/SaveState-jBTJeFSw.js","/assets/SearchInput-Cp1MnHgM.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-DdC3A9-8.js","/assets/ShiftDaily-Bh1gdL3S.js","/assets/ShiftTimes-CEVuHKn3.js","/assets/Staff-Cs9o2ka6.js","/assets/StaffListAtCheck-DXqaAmgf.js","/assets/StatusBadge-LJO-ibCo.js","/assets/StatusBandsModal-UQt-bTZB.js","/assets/TargetGoal-Cbj7uzoo.js","/assets/Targets-Afmvqb4H.js","/assets/Tasks-C1P6PWUM.js","/assets/TimeWheelPicker-Bg7XHR8x.js","/assets/Tooltip-D5YPRzD7.js","/assets/TranslationsEditor-DJhGzPka.js","/assets/TrelloAnalytics-DADWegj-.js","/assets/TrelloSettings-DGjEBUcl.js","/assets/TrendChart-COB-EOxD.js","/assets/TripleSpeedometer-D9ebCzQg.js","/assets/Trudoyomkost-BvuJ1X1a.js","/assets/UploadDropzone-MZhvmitR.js","/assets/UsersActivity-CDTA1Y2c.js","/assets/UsersManagement-5ZnK_JOL.js","/assets/VerdictBlock-CmxT9CiI.js","/assets/VerifixParity-CXftpddy.js","/assets/VerifixSettings-DIf9_9AK.js","/assets/VerifixSync-Te7LmNwE.js","/assets/VfxApiMap-5Z4bRnFx.js","/assets/VfxDictionaries-sCd7A49V.js","/assets/VfxEmployees-DoI8wi4K.js","/assets/VfxHrMoves-CS0950NZ.js","/assets/VfxJobs-DlX67Tz5.js","/assets/VfxPhoto-CYQxaDrx.js","/assets/VfxShifts-BPdU3tm3.js","/assets/VfxState-DGqUNizA.js","/assets/VfxTimebooks-CfK9tlOh.js","/assets/VfxTimesheet-QO0fsW9P.js","/assets/WatchProgress-BFHU9Jh7.js","/assets/WebLogin-BbKszP19.js","/assets/WorkersAttendance-vj3nKmT5.js","/assets/WorkersComposition-D-y1RUVT.js","/assets/WorkersMovements-BfvhjDBc.js","/assets/WorkersPage-BvQA6Ndk.js","/assets/Zagruzka-BKMZCbpz.js","/assets/ZagruzkaCell-XYsA6IJV.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-Cz-mtQXb.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-BKmAM_jG.js","/assets/broadcastTree-DutP7V_G.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-CbOxRzxo.js","/assets/cellMoveRefusal-DRBRzFYO.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-DH-nWbQz.js","/assets/corner-down-right-DSXOdXzC.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/download-BtnXpzPN.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-BhJiakX_.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-yvgXvksT.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CawfMJxf.js","/assets/index-j4gywqUI.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-DFk9gvc1.js","/assets/lightbulb-a8Qz29R8.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-B8hMUuon.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-DlfSlTZM.js","/assets/repeat-DIs-1u7-.js","/assets/ru-CE7hBT1x.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-C2a_03cc.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-Bd7tuYd7.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-IfmYgq8F.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-CuwtPzK7.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-DqCL2Flt.js","/assets/useMutation-CrKxqvJT.js","/assets/useOpenParam-BZc19WT2.js","/assets/useStatusBands-BxnnjuMO.js","/assets/useUrlScope-BINZ7Svm.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-CFf7eEFy.js","/assets/uz_cyrl-CZLqHXkh.js","/assets/vfx-VvVKtLUj.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-ru0M0AY6.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
