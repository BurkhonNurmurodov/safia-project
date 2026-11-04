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

const BUILD = "2026-11-04T08:53:57.768Z";
const PRECACHE = ["/","/assets/ActionHistory-wbsUHtYA.js","/assets/AdminPage-Bkx7rdDA.js","/assets/AiKeys-RpsR39Zh.js","/assets/AnalysisBoard-COg8cZqB.js","/assets/AppLauncher-B2RPaklf.js","/assets/Arc-Cywv9jWd.js","/assets/Assessment-D--T5Nbs.js","/assets/AssessmentGrade-CmmYarqE.js","/assets/AssessmentList-uXX11U6f.js","/assets/Assistant-DH54MOA9.js","/assets/AttendanceCleanup-B_q1Qb9w.js","/assets/AttendanceUpload-DfPvbTDJ.js","/assets/BrigadirProfile-BD4QG4-8.js","/assets/BrigadirsKpi-CdKqSHkJ.js","/assets/Broadcast-Bta4fKDq.js","/assets/BroadcastReceivers-BbDJ-7oW.js","/assets/BroadcastRecord-Cr0PCNEB.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-ovIf5vc8.js","/assets/CategoryLegendModal-D0uPZORy.js","/assets/CellConcerns-BVwp-3iM.js","/assets/CellDetails-BM7UyOtj.js","/assets/CellFormModal-DjzFe3sh.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-CiwAmiQl.js","/assets/Cells-BX-QGz83.js","/assets/ColumnFilter-DI3dvon_.js","/assets/ColumnsPicker-DO6PQByB.js","/assets/CommentsModal-JVO2sHGn.js","/assets/ComparisonTable-D29la5wM.js","/assets/Concerns-J0ubjq5R.js","/assets/ConcernsPieces-BkXG0Slg.js","/assets/CountStepper-CBYERtcB.js","/assets/Daily-DDvUPyBj.js","/assets/DataSources-DbIDCRAF.js","/assets/DataTable-ByOCGLTi.js","/assets/DateRangePicker-CHrQ3ar5.js","/assets/DayReportView-Cgvv_dst.js","/assets/DayStepper-DKm2ZI2-.js","/assets/DayStrip-BMtXgrbc.js","/assets/DbBackup-j-_T12z6.js","/assets/DifferenceBreakdown-CwBzfkIU.js","/assets/DocAudit-KAgCjwKt.js","/assets/Downtime-ufOcoZAC.js","/assets/Education-CtKqaP7z.js","/assets/EducationLesson-D4dR5Q-j.js","/assets/EmptyState-Ck3-lzPP.js","/assets/Exam-CqXAtJ77.js","/assets/ExamAdmin-CNsE4c-k.js","/assets/Factories-DS_ICD-n.js","/assets/FactorySelect-BRKHoxzH.js","/assets/Gamification-DulkC07y.js","/assets/GroupBadge-1lcW_cGH.js","/assets/HeatmapChart-BTqTug3W.js","/assets/IdleCell-CpkVQrHh.js","/assets/IdleOwners-CCyY2w6K.js","/assets/IdleSolutions-5SWLDORA.js","/assets/IdleSource-SNmYVeVK.js","/assets/KPICard-csy1v-0Z.js","/assets/Kaizen-BUvpc9X5.js","/assets/Kelish-BouWato7.js","/assets/KpiBits-vgZR7Z9N.js","/assets/KpiDeltaCard-BgK5SiUD.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-hqbick7T.js","/assets/LeaderAppeal-BR0Fh2Nc.js","/assets/LeaderCutoffs-ByrBMxHO.js","/assets/LeaderDailyTasks-K9I0QyN2.js","/assets/LeaderDayExclusions-BqGaLgXV.js","/assets/LeaderDayReport-DG3UXo-P.js","/assets/LeaderTasksAdmin-BC2uo7N8.js","/assets/LeaderUnitReport-iEW1uL8Q.js","/assets/Leaderboard-ihkTG048.js","/assets/Leaders-DAA5ohqN.js","/assets/LeadersKpi-DPtOh_BF.js","/assets/Lightbox-CpYGo9Vv.js","/assets/LiveOverview-CaELPS9Z.js","/assets/Login-CohDXIAC.js","/assets/Logs-1_JiSX9w.js","/assets/LostWorkers-CWVjvDQk.js","/assets/NotFound-BpKUzmX1.js","/assets/Notifications-CmwawDxr.js","/assets/NotionTasks-DmCMbWka.js","/assets/NotionTrackerSettings-DGY82uWo.js","/assets/Ontime-BDfiLPMA.js","/assets/Overview-DRy-eChH.js","/assets/OwnerChip-hWtZtJVl.js","/assets/PageAccess-BXr8g5VZ.js","/assets/Pagination-ZGs3vnOv.js","/assets/People-CEkSjKlV.js","/assets/PerenaladkaFactTable-Bqblv1iV.js","/assets/Permissions-ChCbz5xU.js","/assets/PersonCard-BHoruruf.js","/assets/PlanFulfillment-BvkM97Lb.js","/assets/Production-Bc0iugm6.js","/assets/ProductionUpload-CNdd22Ds.js","/assets/Profile-C7EHPZC1.js","/assets/ProfileAvatar-DGJFFvpC.js","/assets/ProfilesManagement-MRJO825Y.js","/assets/ProofCamera-DA6uTyXX.js","/assets/ProofPhoto-DfqxKtqP.js","/assets/Quality-D0j0Y826.js","/assets/RawRows-BYSmI9hq.js","/assets/Reports-C7uGI3QK.js","/assets/RequestStateChip-CGfW3Evk.js","/assets/RichTextEditor-D6Kw6f4x.js","/assets/SaveState-Dd1crMjI.js","/assets/SearchInput-B3PdFsGL.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-DM_vzxkL.js","/assets/ShiftDaily-CEz_XJte.js","/assets/ShiftTimes-DTboDeZL.js","/assets/Staff-_TpRgLRu.js","/assets/StaffListAtCheck-CkJGixO8.js","/assets/StatusBadge-Ci4gyjtF.js","/assets/StatusBandsModal-C-zXW-Wo.js","/assets/TargetGoal-BqgmZcur.js","/assets/Targets-3cm8W7wh.js","/assets/Tasks-BMzEzdGt.js","/assets/TimeWheelPicker-D_8wWuHY.js","/assets/Tooltip-7gxJPWl_.js","/assets/TranslationsEditor-D384QU96.js","/assets/TrelloAnalytics-CTjUL340.js","/assets/TrelloSettings-CmpbwZ5j.js","/assets/TrendChart-DE9k3rnD.js","/assets/TripleSpeedometer-BdlkxIJ_.js","/assets/Trudoyomkost-DB3dnqD4.js","/assets/UploadDropzone-BTf3Ynjl.js","/assets/UsersActivity-CUszDQNu.js","/assets/UsersManagement-sOVBhkWC.js","/assets/VerdictBlock-C1d_0CGz.js","/assets/VerifixParity-C16VVsX2.js","/assets/VerifixSettings-C0z8kiGD.js","/assets/VerifixSync-DU01-EUQ.js","/assets/VfxApiMap-of6iY1QD.js","/assets/VfxDictionaries-CDlBWkiQ.js","/assets/VfxEmployees-r34MoNuf.js","/assets/VfxHrMoves-C-Zap6oI.js","/assets/VfxJobs-DWJmy8Ah.js","/assets/VfxPhoto-D9AU2re2.js","/assets/VfxShifts-uJqsfvZG.js","/assets/VfxState-LGmXC2B2.js","/assets/VfxTimebooks-BoMeuGvK.js","/assets/VfxTimesheet-BmUAg2VF.js","/assets/WatchProgress-Zw4gpH4M.js","/assets/WebLogin-Dng4cxdG.js","/assets/WorkersAttendance-DpIyS9u_.js","/assets/WorkersComposition-DcmomGYZ.js","/assets/WorkersMovements-2GIA6zJm.js","/assets/WorkersPage-B7FbhFCF.js","/assets/Zagruzka-CjrI74gC.js","/assets/ZagruzkaCell-qf-NVQzp.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-Bpyd2E4n.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-lzva0sK3.js","/assets/broadcastTree-DxtUlgDL.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-CSQgwPvl.js","/assets/cellMoveRefusal-CKL5yYSB.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-DemFLd8B.js","/assets/corner-down-right-DSXOdXzC.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/download-BtnXpzPN.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-7vBoqDmp.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BL6ArEaJ.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CjKi0QD9.js","/assets/index-n0OI4X9x.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-_zSHUEkP.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-Dn8XPodu.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-n_7TV8_C.js","/assets/repeat-DIs-1u7-.js","/assets/ru-C4gl4P1E.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-BEhIuq7x.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-Bd7tuYd7.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-DgR2Yvp7.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-DSm7eM4i.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-C3qvxUsi.js","/assets/useMutation-DRLZf0yM.js","/assets/useOpenParam-B3wGscgx.js","/assets/useStatusBands-CAyzP_M6.js","/assets/useUrlScope-dolbIx9E.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-Duigfq7b.js","/assets/uz_cyrl-a625Ri-t.js","/assets/vfx-BQDuIXQ4.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-Dwdl1iI_.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
