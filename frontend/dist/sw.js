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

const BUILD = "2026-11-03T12:27:31.205Z";
const PRECACHE = ["/","/assets/ActionHistory-ODKOE3LG.js","/assets/AdminPage-DVrbIheP.js","/assets/AiKeys-Ca27xeu0.js","/assets/AnalysisBoard-BSkT_ZV2.js","/assets/AppLauncher-E9xBCv0o.js","/assets/Arc-DMX3-BZ3.js","/assets/Assessment-ylHM-knq.js","/assets/AssessmentGrade-Dpxh78Ng.js","/assets/AssessmentList-CghO1OgJ.js","/assets/Assistant-BfQwyHq3.js","/assets/AttendanceCleanup-CJ3nCUht.js","/assets/AttendanceUpload-hjWG0EC4.js","/assets/BrigadirProfile-C6Vpehmj.js","/assets/BrigadirsKpi-BbEETzeI.js","/assets/Broadcast-BJSgh41i.js","/assets/BroadcastReceivers-CquLsqMA.js","/assets/BroadcastRecord-Det15Gn7.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-DD0gFq8X.js","/assets/CategoryLegendModal-BAMZvCJZ.js","/assets/CellConcerns-DXU0aZ-b.js","/assets/CellDetails-Cc454YVV.js","/assets/CellFormModal-D8TuI6AQ.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-eFGcANiu.js","/assets/Cells-ZGEYloov.js","/assets/ColumnFilter-1AmUihdb.js","/assets/ColumnsPicker-Ci2HcI6B.js","/assets/CommentsModal-Cu6x_Tz8.js","/assets/ComparisonTable-BHQApmE8.js","/assets/Concerns-aScym84l.js","/assets/ConcernsPieces-D4-FJPb4.js","/assets/CountStepper-D2fdcrip.js","/assets/Daily-DazeVUg9.js","/assets/DataSources-VWxZ9nC8.js","/assets/DataTable-DpTxOFco.js","/assets/DateRangePicker-BNoF7wnc.js","/assets/DayReportView-DM3AskHL.js","/assets/DayStepper-CqS3W7CJ.js","/assets/DayStrip-VO4H5zlT.js","/assets/DbBackup-DGxta0u_.js","/assets/DifferenceBreakdown-BDR2Ub7l.js","/assets/DocAudit-CuhXQfhI.js","/assets/Downtime-CasZVpla.js","/assets/Education-sjphdTA-.js","/assets/EducationLesson-BpMRb2W8.js","/assets/EmptyState-B58nIMO5.js","/assets/Exam-CEb_r-I3.js","/assets/ExamAdmin-BrpV5W2f.js","/assets/Factories-Bk0Sj5uU.js","/assets/FactorySelect-Dg1NK3du.js","/assets/Gamification-0iH9TQ1W.js","/assets/GroupBadge-DWKlmf_X.js","/assets/HeatmapChart-CbhQw201.js","/assets/IdleCell-DfhDdGl1.js","/assets/IdleOwners-OAxm6WQQ.js","/assets/IdleSource-rkD2oVTN.js","/assets/KPICard-BlM3qDkl.js","/assets/Kaizen--pufmAC_.js","/assets/Kelish-Bsfhqbta.js","/assets/KpiBits-CXnWzCGL.js","/assets/KpiDeltaCard-DWJt5PBj.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-DdIC53uV.js","/assets/LeaderAppeal-Dg7GkSPN.js","/assets/LeaderCutoffs-BaTzAL-R.js","/assets/LeaderDailyTasks-DYQHW5PO.js","/assets/LeaderDayExclusions-BCd0xaUr.js","/assets/LeaderDayReport-BmVIPoPt.js","/assets/LeaderTasksAdmin-ASY7LRn0.js","/assets/LeaderUnitReport-DwdtDO_s.js","/assets/Leaderboard-B3xQVOVh.js","/assets/Leaders-DYp2NvsA.js","/assets/LeadersKpi-Dzn8utTq.js","/assets/Lightbox-CvIIr4Xr.js","/assets/LiveOverview-DeYsBNDv.js","/assets/Login-DpPmonCK.js","/assets/Logs-DP55zvc4.js","/assets/LostWorkers-D0l1VbOf.js","/assets/NotFound-QvehL2C-.js","/assets/Notifications-DEIuIdcq.js","/assets/NotionTasks-DRDsKsoe.js","/assets/NotionTrackerSettings-B40PGCta.js","/assets/Ontime-yhOcoi8d.js","/assets/Overview-CPUMqBhy.js","/assets/PageAccess-c_UcORnC.js","/assets/Pagination-K33E_FsS.js","/assets/People-ClQr_Vca.js","/assets/PerenaladkaFactTable-CRLwIzHG.js","/assets/Permissions-Bdqj6b6e.js","/assets/PersonCard-BmlPJVCb.js","/assets/PlanFulfillment-DWc8qijY.js","/assets/Production-NR5JiTcN.js","/assets/ProductionUpload-UIw1Z-gF.js","/assets/Profile-DcGiBJUS.js","/assets/ProfileAvatar-CR2IrA5A.js","/assets/ProfilesManagement-BQpG1fBm.js","/assets/ProofCamera-BZIO4tN_.js","/assets/ProofPhoto-hGph1351.js","/assets/Quality-DOo7E7LR.js","/assets/RawRows-24B2w7Vt.js","/assets/Reports-Cmn3x7Qn.js","/assets/RequestStateChip-pwSK-bUg.js","/assets/RichTextEditor-kw5rOcgJ.js","/assets/SaveState-BSBR1D3G.js","/assets/SearchInput-D-S0wtbj.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-CcP7UDZU.js","/assets/ShiftDaily-D8pKinA3.js","/assets/ShiftTimes-CnQkQVUv.js","/assets/Staff-BEC4lwtW.js","/assets/StaffListAtCheck-DdiFDp0N.js","/assets/StatusBadge-D0Azprmq.js","/assets/StatusBandsModal-BreGRSp-.js","/assets/TargetGoal-CmqdNceU.js","/assets/Targets-DrAv9VYv.js","/assets/Tasks-DS-NmHym.js","/assets/TimeWheelPicker-DqPY5oR6.js","/assets/Tooltip-BUtc7jDI.js","/assets/TranslationsEditor-CI1XN21y.js","/assets/TrelloAnalytics-BRABp1SX.js","/assets/TrelloSettings-Cs_Nxujl.js","/assets/TrendChart-CmuV0bhl.js","/assets/TripleSpeedometer-CRwoPP-h.js","/assets/Trudoyomkost-DuuccGis.js","/assets/UploadDropzone-DtzMec7Z.js","/assets/UsersActivity-D2_7B5hU.js","/assets/UsersManagement-4Wi1nm8d.js","/assets/VerdictBlock-CVJJyrEy.js","/assets/VerifixParity-DChTVwDN.js","/assets/VerifixSettings-Bzsn7aRr.js","/assets/VerifixSync-C3M3rlZI.js","/assets/VfxApiMap-ow6L5x_j.js","/assets/VfxDictionaries-K_iRndlw.js","/assets/VfxEmployees-CERonPVs.js","/assets/VfxHrMoves-DuxtkcsO.js","/assets/VfxJobs-DcfUtrWr.js","/assets/VfxPhoto-ks0dyeby.js","/assets/VfxShifts-Ccprv3kM.js","/assets/VfxState-WwUq2_0P.js","/assets/VfxTimebooks-i_Zv8ZcT.js","/assets/VfxTimesheet-DN4UWS_g.js","/assets/WatchProgress-BiXquJ9M.js","/assets/WebLogin-Bliccl6G.js","/assets/WorkersAttendance-BkrV13MU.js","/assets/WorkersComposition-BCLHru-0.js","/assets/WorkersMovements-Cz3o9hoT.js","/assets/WorkersPage-CqounEuk.js","/assets/Zagruzka-CFboobJd.js","/assets/ZagruzkaCell-CrbItAPT.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BXwW53UA.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-C27t-FSE.js","/assets/broadcastTree-DjdOXrqO.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-BG_uyeIm.js","/assets/cellMoveRefusal-C4VXXtEO.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-BJDmuAcU.js","/assets/corner-down-right-DSXOdXzC.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/download-BtnXpzPN.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-DqBwZQ0-.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CxO134Gs.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-Bbc1_gNi.js","/assets/index-CVMwwzgw.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-BuX7rwV0.js","/assets/lightbulb-a8Qz29R8.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-Cq4Q3Z9-.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-02lLGJ3w.js","/assets/repeat-DIs-1u7-.js","/assets/ru-DVzY3RNV.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-COiMWhoz.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-Bd7tuYd7.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-DZ1KXz4J.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-OD_QWBuF.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-CRjFpCAH.js","/assets/useMutation-qk5GlXix.js","/assets/useOpenParam-Cwyu0TRN.js","/assets/useStatusBands-CzDe1a_5.js","/assets/useUrlScope-CwVlpBX4.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-B6ntqEDY.js","/assets/uz_cyrl-D9Vo3gpB.js","/assets/vfx-BDX1Alaj.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-5awBg6LM.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
