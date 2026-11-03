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

const BUILD = "2026-11-03T05:41:47.402Z";
const PRECACHE = ["/","/assets/ActionHistory-DKQTK-Pm.js","/assets/AdminPage-eLHcxqDi.js","/assets/AiKeys-BqcRsUG_.js","/assets/AnalysisBoard-D_VFbdVC.js","/assets/AppLauncher-B4hgd-UT.js","/assets/Arc-BId6qks7.js","/assets/Assessment-CsENi0wY.js","/assets/AssessmentGrade-CXkDhWPQ.js","/assets/AssessmentList-CbYOmDfG.js","/assets/Assistant-BMXee4C1.js","/assets/AttendanceCleanup-DhNbL9ND.js","/assets/AttendanceUpload-CHiJaBv5.js","/assets/BrigadirProfile-DZYNGlSu.js","/assets/BrigadirsKpi-D41SBwiY.js","/assets/Broadcast-DEcVm9tg.js","/assets/BroadcastReceivers-Dw3CgmDN.js","/assets/BroadcastRecord-Dcv2AThF.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-DPv7v1yJ.js","/assets/CategoryLegendModal-BKuKc9Tg.js","/assets/CellConcerns-jvLEdDNM.js","/assets/CellDetails-CkSHnwQ2.js","/assets/CellFormModal-ChOMmziZ.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-BgGWFMdG.js","/assets/Cells-DdXxB60L.js","/assets/ColumnFilter-BsEIkaNv.js","/assets/ColumnsPicker-DATC3vbt.js","/assets/CommentsModal-Bxt60rCG.js","/assets/ComparisonTable-CbIfrpRA.js","/assets/Concerns-6S-l5C26.js","/assets/ConcernsPieces-CcjzxR_r.js","/assets/CountStepper-RoKBQ1as.js","/assets/Daily-Swef9zEI.js","/assets/DataSources-CwCDsvEe.js","/assets/DataTable-D0UBwyCP.js","/assets/DateRangePicker-_Is-4N4s.js","/assets/DayReportView-4KvkxQ0A.js","/assets/DayStepper-27vDkszE.js","/assets/DayStrip-M6FYBMj8.js","/assets/DbBackup--mwDSYDc.js","/assets/DifferenceBreakdown-BLnRuaFi.js","/assets/DocAudit-CZMBVQzV.js","/assets/Downtime-Bph-60nD.js","/assets/Education-e-dDppMo.js","/assets/EducationLesson-DXj_HujH.js","/assets/EmptyState-DH1n09_C.js","/assets/Exam-Dx13yykz.js","/assets/ExamAdmin-BPTazGip.js","/assets/Factories-D2nVcouf.js","/assets/FactorySelect-4H9vKyCC.js","/assets/Gamification-3rJhtArk.js","/assets/GroupBadge-CqC2AMl7.js","/assets/HeatmapChart-BhCWNmJU.js","/assets/IdleCell-DmeSIxe4.js","/assets/IdleOwners-Bc4jEL_m.js","/assets/IdleSource-D40CST0T.js","/assets/KPICard-C4SAW47o.js","/assets/Kaizen-BzKq4jRP.js","/assets/Kelish-DkohmSlb.js","/assets/KpiBits-xQqPMgJj.js","/assets/KpiDeltaCard-YhmDyZlQ.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-Bo5SV_6H.js","/assets/LeaderAppeal-CGLBwhmk.js","/assets/LeaderCutoffs-CqS9Ldbg.js","/assets/LeaderDailyTasks-Essi4gJ6.js","/assets/LeaderDayExclusions-BEh6zjJ7.js","/assets/LeaderDayReport-CnPZGv0C.js","/assets/LeaderTasksAdmin-Bj7vobpk.js","/assets/LeaderUnitReport-B1LC3A_W.js","/assets/Leaderboard-kF8S_c6F.js","/assets/Leaders-CGe9CzFe.js","/assets/LeadersKpi-DRWyhNkv.js","/assets/Lightbox-CDYRH0-6.js","/assets/LiveOverview-BHgFU01a.js","/assets/Login-C-RKCt0b.js","/assets/Logs-CAkJOW6B.js","/assets/LostWorkers-EH1rjeJW.js","/assets/NotFound-C9Tlkt8C.js","/assets/Notifications-CDrhzq-w.js","/assets/NotionTasks-B4k7CqY5.js","/assets/NotionTrackerSettings-Z5CjzZNw.js","/assets/Ontime-CeurGYUc.js","/assets/Overview-CUKHL09f.js","/assets/PageAccess-CoQjVgpR.js","/assets/Pagination-RPHT_xh0.js","/assets/People-iD2PMOOL.js","/assets/PerenaladkaFactTable-CFsJ_UOw.js","/assets/Permissions-CTp8h4fM.js","/assets/PersonCard-C8HDQPos.js","/assets/PlanFulfillment-BM4bUPfg.js","/assets/Production-CRtLZyOs.js","/assets/ProductionUpload-B4SqTBGi.js","/assets/Profile-CnXhz7bw.js","/assets/ProfileAvatar-EdzePCmK.js","/assets/ProfilesManagement-DAABERdh.js","/assets/ProofCamera-CIxlohrE.js","/assets/ProofPhoto-BODM-m4L.js","/assets/Quality-BXddNt5d.js","/assets/RawRows-CwdLRoMW.js","/assets/Reports-0IDf_e1R.js","/assets/RequestStateChip-YiHMh-mp.js","/assets/RichTextEditor-BCNomUch.js","/assets/SaveState-MHM6qZ9e.js","/assets/SearchInput-B0W4FHAP.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-BNzg97MI.js","/assets/ShiftDaily-B9J3YLbM.js","/assets/ShiftTimes-QrgIvqB9.js","/assets/Staff-Q2grixMX.js","/assets/StaffListAtCheck-DmCPgrsp.js","/assets/StatusBadge-ReHg-nY8.js","/assets/StatusBandsModal-D16PAlPg.js","/assets/TargetGoal-D8iZsFW0.js","/assets/Targets-C7EbRyzV.js","/assets/Tasks-Dr-_tjwQ.js","/assets/TimeWheelPicker-By2_-dl4.js","/assets/Tooltip-C3JyPC7F.js","/assets/TranslationsEditor-FjArX9Tr.js","/assets/TrelloAnalytics-Dqs5N7Se.js","/assets/TrelloSettings-ZXRSf3ZT.js","/assets/TrendChart-BnM-PnVU.js","/assets/TripleSpeedometer-CIR-qp2Z.js","/assets/Trudoyomkost-BH6PN2EN.js","/assets/UploadDropzone-D0XEdbif.js","/assets/UsersActivity-DIggsqHN.js","/assets/UsersManagement-Cf7oJh2H.js","/assets/VerdictBlock-Cm1qK2bk.js","/assets/VerifixParity-B-FleVRA.js","/assets/VerifixSettings-BTmdaNL0.js","/assets/VerifixSync-DXZEote8.js","/assets/VfxApiMap-kgTAUuD-.js","/assets/VfxDictionaries-KGdcW8sH.js","/assets/VfxEmployees-CBLZFezX.js","/assets/VfxHrMoves-V1nuF_j3.js","/assets/VfxJobs-Do6rgdbD.js","/assets/VfxPhoto-jpWJwFOi.js","/assets/VfxShifts-C1xI1cvf.js","/assets/VfxState--Rw4NKhN.js","/assets/VfxTimebooks-B3loWeNy.js","/assets/VfxTimesheet-BO5oXdRN.js","/assets/WatchProgress-BckyQTkk.js","/assets/WebLogin-Cz-mc4Zm.js","/assets/Workers-C0pIfrN1.js","/assets/Zagruzka-UfJ-kpfO.js","/assets/ZagruzkaCell-CkEBWpcl.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BvMm7oxI.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-CRo-Komr.js","/assets/broadcastTree-ZAK4T451.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-DD-CJleP.js","/assets/cellMoveRefusal-CfWfjfuH.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-CVJrUhbi.js","/assets/corner-down-right-DSXOdXzC.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/download-BtnXpzPN.js","/assets/en-CQ3yFwvz.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BTOInGv6.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BsXOSKne.css","/assets/index-kkjlm5GA.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-RVn9C_vi.js","/assets/lightbulb-a8Qz29R8.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-CaY5IpU4.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CqQYzGqL.js","/assets/repeat-DIs-1u7-.js","/assets/ru-DrDKELn7.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-BuF7HZTJ.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-Bd7tuYd7.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-DuV5Lj9B.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-Ssr3LEXa.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-BwDAX19g.js","/assets/useMutation-aH5-PQi8.js","/assets/useOpenParam-JB7Tf74X.js","/assets/useStatusBands-BiOlfIN3.js","/assets/useUrlScope-BPWaFeH1.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-Cy9_BvNV.js","/assets/uz_cyrl-F3L3XRUK.js","/assets/vfx-p3IaqoOx.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-BgEM0nDz.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
