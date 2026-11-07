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

const BUILD = "2026-11-07T09:09:45.466Z";
const PRECACHE = ["/","/assets/ActionHistory-DVG-3MPf.js","/assets/ActionMenu-C_S6qOba.js","/assets/AdminPage-DDpwTqGW.js","/assets/AiKeys-BjjBbGl-.js","/assets/AnalysisBoard-DaKQ7T2r.js","/assets/AppLauncher-Df8isVcR.js","/assets/Arc-Bo36ZdVg.js","/assets/Assessment-xzkZGqT5.js","/assets/AssessmentGrade-Wm1Y9m9C.js","/assets/AssessmentList-B6KSAu1T.js","/assets/Assistant-Dz4DTHpU.js","/assets/AttendanceCleanup-Cziimg7C.js","/assets/AttendanceUpload-DxGljzfJ.js","/assets/AuditTable-DWe9uh-q.js","/assets/BrigadirProfile-QGzVMqFn.js","/assets/BrigadirsKpi-ClZpTe4f.js","/assets/Broadcast-DWfDRqPn.js","/assets/BroadcastReceivers-lgqozZGu.js","/assets/BroadcastRecord-ShKdXefO.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-C3h9jhRS.js","/assets/CategoryLegendModal-kjAHEP9b.js","/assets/CellConcerns-ujDTYytJ.js","/assets/CellDetails-BCMAkZWf.js","/assets/CellFormModal-gFJQn3XU.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-DVmt_Ur1.js","/assets/Cells-unmggrZB.js","/assets/ColumnFilter-Mn0gXNZa.js","/assets/ColumnsPicker-CRT0JALG.js","/assets/CommentsModal-D0oA1Ys-.js","/assets/ComparisonTable-3eJne2Yv.js","/assets/Concerns-CbcUEtyN.js","/assets/ConcernsPieces-BDvU9qK3.js","/assets/CountStepper-C3NmkAEw.js","/assets/Daily-BCZqmA9I.js","/assets/DataSources-BGOUWjXx.js","/assets/DataTable-CQf8daeP.js","/assets/DateRangePicker-BmNoArUw.js","/assets/DayReportView-DpRKfoi_.js","/assets/DayStepper-DvbDF0H8.js","/assets/DayStrip-Bbz9PjYS.js","/assets/DbBackup-BRbVBmvd.js","/assets/DifferenceBreakdown-1rkRk-N9.js","/assets/DocAudit-SVJiJJ8d.js","/assets/Downtime-GxxPXD-n.js","/assets/Education-Dpt0niDZ.js","/assets/EducationLesson-DXuSumjT.js","/assets/EmptyState-DK7c1Wgv.js","/assets/Exam-t4uC6D-K.js","/assets/ExamAdmin-5EMkaQsN.js","/assets/Factories-CLxNeJPN.js","/assets/FactorySelect-NtYkqwPE.js","/assets/Gamification-DCAcF4dZ.js","/assets/GroupBadge-CD9y9R-e.js","/assets/HeatmapChart-DLYzFg9B.js","/assets/IdleCell-C30uYVUd.js","/assets/IdleOwners-BNrDYdQE.js","/assets/IdleSolutions-BkRV49R9.js","/assets/IdleSource-Boi46dHq.js","/assets/KPICard-DgduNWU-.js","/assets/Kaizen-D6FRbjpg.js","/assets/Kelish-BNdlG9Sz.js","/assets/KpiBits-DZt1dVIf.js","/assets/KpiDeltaCard-B0dmRh9m.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-DG8aWIe_.js","/assets/LeaderAppeal-Cm7Iosaf.js","/assets/LeaderCutoffs-Buflo--q.js","/assets/LeaderDailyTasks-DnSBsgaV.js","/assets/LeaderDayExclusions-Cf_2_fae.js","/assets/LeaderDayReport-DZqdkcbU.js","/assets/LeaderTasksAdmin-DBw_0li5.js","/assets/LeaderUnitReport-D8VayLy-.js","/assets/Leaderboard-BhP8Jpm_.js","/assets/Leaders-Bkh7mLRe.js","/assets/LeadersKpi-DkCpGHST.js","/assets/Lightbox-Bcu6NuH9.js","/assets/LiveOverview-BAjt89jU.js","/assets/Login-BY8TCGa2.js","/assets/Logs-D0Jj7XIL.js","/assets/LostWorkers-DdSquxCA.js","/assets/NotFound-DxRB8DHy.js","/assets/Notifications-Dr8Axt6d.js","/assets/NotionTasks-C8jGUlNw.js","/assets/NotionTrackerSettings-C0c2UY7O.js","/assets/Ontime-CntI3LvF.js","/assets/Ovens-CVGy7aj3.js","/assets/OvensSettings-CBC75S6S.js","/assets/Overview-DZ7uQDms.js","/assets/OwnerChip-DB8bKJh4.js","/assets/PageAccess-BymQR3qr.js","/assets/Pagination-D5penwFr.js","/assets/People-0SmPwc1Y.js","/assets/PerenaladkaFactTable-BqWRmg1k.js","/assets/Permissions-BJL1MZME.js","/assets/PersonCard-8AC_Z3eI.js","/assets/PlanFulfillment-AmLcWl-i.js","/assets/Production-DAVJ50UZ.js","/assets/ProductionUpload-DlAAMZKu.js","/assets/Profile-BDe46znm.js","/assets/ProfileAvatar-dtCzLtdI.js","/assets/ProfilesManagement-CUOR7Glx.js","/assets/ProofCamera-Bpykvnnk.js","/assets/ProofPhoto-Bra9Essd.js","/assets/Quality-AVc6h1Up.js","/assets/RawRows-DRD27lyO.js","/assets/Reports-BLF9o_lD.js","/assets/RequestStateChip-BJalw6jn.js","/assets/RichTextEditor-Dv-B4TWb.js","/assets/SaveState-DkKIGT9S.js","/assets/SearchInput-KFuCnNgm.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-BD2TjLbi.js","/assets/ShiftDaily-DkBX3Zt3.js","/assets/ShiftTimes-C2w-vXbY.js","/assets/Staff-DKUulovM.js","/assets/StaffListAtCheck-_m9_jhhn.js","/assets/StatusBadge-CAmt7nbv.js","/assets/StatusBandsModal-C9OWgSso.js","/assets/TargetGoal-BGRXgzNy.js","/assets/Targets-DPJK-9M6.js","/assets/Tasks-etOoeckO.js","/assets/TimeWheelPicker-BkKG6vbE.js","/assets/Tooltip-DDLJy6nZ.js","/assets/TranslationsEditor-Dcgj53I_.js","/assets/TrelloAnalytics-BX53Wjnk.js","/assets/TrelloSettings-Be8sepmj.js","/assets/TrendChart-VtoU8zfd.js","/assets/TripleSpeedometer-Bzn_i82P.js","/assets/Trudoyomkost-DPv4CCqE.js","/assets/UploadDropzone-BEeLvNvt.js","/assets/UsersActivity-CjgrDbL0.js","/assets/UsersManagement-BqGfg0mj.js","/assets/VerdictBlock-DTLDeNK3.js","/assets/VerifixParity-BxFsXR_k.js","/assets/VerifixSettings-D5e9UF0c.js","/assets/VerifixSync-B7hE1REG.js","/assets/VfxApiMap-DpU5iVf1.js","/assets/VfxDictionaries-0snEpsfm.js","/assets/VfxEmployees-B4zd11IK.js","/assets/VfxHrMoves-wfvAggx0.js","/assets/VfxJobs-BNyypA3x.js","/assets/VfxPhoto-CtGVtkr3.js","/assets/VfxShifts-BnJ0-MKd.js","/assets/VfxState-DhuKRwQ4.js","/assets/VfxTimebooks-DQisStbs.js","/assets/VfxTimesheet-0qws4iG1.js","/assets/WatchProgress-jUOIcosV.js","/assets/WebLogin-Q83U39E6.js","/assets/WorkersAttendance-BEpqjqmI.js","/assets/WorkersComposition-ChTSbI9J.js","/assets/WorkersMovements-BtRI4nt5.js","/assets/WorkersPage-aZ7dUgZl.js","/assets/Zagruzka-SVmAbPK7.js","/assets/ZagruzkaCell-CMEX2nya.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-z_4RutEV.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-F1yWR2kR.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-DAnuZm-i.js","/assets/broadcastTree-DWCrR9GE.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-DH6XS-n9.js","/assets/cellMoveRefusal-_cR08SHQ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-B6JAhD7c.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-Dv6-5avE.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Dbf97xXz.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CQ_bKaeC.css","/assets/index-ZUQdmRva.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-evQk7yRj.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-CNfiRD2C.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-BwaFgOV2.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CyPGJwbR.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CSyp0k3f.js","/assets/ru-BshZBZIo.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-CLQr-a3q.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-ClzI7uS0.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-DzrnDRsB.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-DwpJIxS6.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-D3jZXTuG.js","/assets/useMutation-CYyKEnV2.js","/assets/useOpenParam-BvH-1W9C.js","/assets/useStatusBands-Ciw6ABQN.js","/assets/useUrlScope-CDhQBex1.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-D2wHCeR1.js","/assets/uz_cyrl-D4n6o4Fl.js","/assets/vfx-DqKAkrEi.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-B7TTWDfv.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
