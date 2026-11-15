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

const BUILD = "2026-11-15T07:25:00.206Z";
const PRECACHE = ["/","/assets/ActionHistory-BYk7OjqQ.js","/assets/ActionMenu-CIIRtxDA.js","/assets/AdminPage-Pab3GMP1.js","/assets/AiKeys-CBEOkTYM.js","/assets/AnalysisBoard-Dothb3BG.js","/assets/ApiAccess-B20z0Ady.js","/assets/AppLauncher-DdBh7ZBG.js","/assets/Arc-BNcwt1rf.js","/assets/Assessment-ZK7ZSJhQ.js","/assets/AssessmentGrade-CTRGJRWm.js","/assets/AssessmentList-xQpeZdFI.js","/assets/Assistant-D6rnexOw.js","/assets/AttendanceCleanup-ByVQcca-.js","/assets/AttendanceUpload-BXaKG2Pa.js","/assets/AuditTable-DKZq16Je.js","/assets/BrigadirProfile-C11mIjnS.js","/assets/BrigadirsKpi-DYQRYN48.js","/assets/Broadcast-Bk9_tNSR.js","/assets/BroadcastReceivers-DwVuWGZQ.js","/assets/BroadcastRecord-CmAnZPeR.js","/assets/Button-hcJ3U3kF.js","/assets/CatLockNotice-C9XjFZKL.js","/assets/CategoryLegendModal-BuS_fBUu.js","/assets/CellConcerns-hqxNUPIb.js","/assets/CellDetails-DqWxxh-6.js","/assets/CellFormModal-BEqrSOX5.js","/assets/CellIdent-DsZyACsz.js","/assets/CellLink-RKkAPUCf.js","/assets/Cells-BKGqQ05B.js","/assets/ColumnFilter-Dh8WsKW9.js","/assets/ColumnsPicker-TiCo8R-u.js","/assets/CommentsModal-CK5YvWGt.js","/assets/ComparisonTable-BYuMh2Hl.js","/assets/Concerns-DiPzhTMD.js","/assets/ConcernsPieces-BBlwt_37.js","/assets/ContainerFlow-DmbkcVRK.js","/assets/ContainerTotalsCard-Bin0nkRj.js","/assets/Containers-B6M7RaDZ.js","/assets/CountStepper-Ef4okr18.js","/assets/Daily-BKKea0sX.js","/assets/DataSources-Dtz4_EIK.js","/assets/DataTable-CzgnvKN1.js","/assets/DateRangePicker-C1ZR6mEm.js","/assets/DayReportView-CR24wZyS.js","/assets/DayStepper-D_1fbhGy.js","/assets/DayStrip-UCtoFVPj.js","/assets/DbBackup-C7G5wErG.js","/assets/DifferenceBreakdown-C1qY4j9g.js","/assets/DocAudit-DPV8K3Jd.js","/assets/Downtime-nM-qj1vb.js","/assets/Education-BtjYK16Q.js","/assets/EducationLesson-DmKTxeEW.js","/assets/EmptyState-CIgtZEBR.js","/assets/Exam-XLqukMlE.js","/assets/ExamAdmin-fq96EklR.js","/assets/Factories-BBRCEGok.js","/assets/FactorySelect-BQDJsIC_.js","/assets/Gamification-Dx12oa4A.js","/assets/GroupBadge-Clt8dWQc.js","/assets/HeatmapChart-C77a4Unm.js","/assets/HourlyContainers-UiVD7dac.js","/assets/IdleCell-DOkm8uw3.js","/assets/IdleOwners-Bs99xgqc.js","/assets/IdleSolutions-DrXiMddy.js","/assets/IdleSource-tdmOgRno.js","/assets/KPICard-Ddln6NIp.js","/assets/Kaizen-BHMYM6u0.js","/assets/Kelish-Dx7F8cbX.js","/assets/Kitchen-Bq8dZ-a1.js","/assets/KpiBits-b1YumTQ8.js","/assets/KpiDeltaCard-CmJq75vc.js","/assets/LangContext-RW_OWush.js","/assets/LangTextInput-DIg9LZxe.js","/assets/Layout-Bh7kE7GH.js","/assets/LeaderAppeal-C4a9PVf2.js","/assets/LeaderCutoffs-Dwig0U24.js","/assets/LeaderDailyTasks-CV5NIgOo.js","/assets/LeaderDayExclusions-CW5Q-4cU.js","/assets/LeaderDayReport-CTTiy1_3.js","/assets/LeaderTasksAdmin-G7WCKUXY.js","/assets/LeaderUnitReport-yY-OtKja.js","/assets/Leaderboard-CwTupaAS.js","/assets/Leaders-erKlXduO.js","/assets/LeadersKpi-DAUaMtM0.js","/assets/Lightbox-BM3d8avL.js","/assets/LiveOverview-D1JBLNs0.js","/assets/Login-NCWx4Rjh.js","/assets/Logs-CWD0Wywm.js","/assets/LostWorkers-0cGZLrKN.js","/assets/Meter-7PIG3YTA.js","/assets/NotFound-AZ5BzuNV.js","/assets/Notifications-BfMpteOo.js","/assets/NotionTasks-DynPTfeU.js","/assets/NotionTrackerSettings-B8IsDcJ8.js","/assets/Ontime-eXz02FL7.js","/assets/OrgChart-Bpp3Fnvi.js","/assets/Ovens-Ckc-BgUv.js","/assets/OvensSettings-BaRTFa9b.js","/assets/Overview-BccRo33t.js","/assets/OwnerChip-BtCdlEIJ.js","/assets/PageAccess-C5bBwZnE.js","/assets/Pagination-DEMmOkkw.js","/assets/People-DSXfXTuJ.js","/assets/PerenaladkaFactTable-HiHvddeC.js","/assets/Permissions-Dr7Gl0Cy.js","/assets/PersonCard-D67gj28r.js","/assets/PlanFulfillment-DYo6ViPL.js","/assets/Production-CvI3I0Kc.js","/assets/ProductionUpload-BOcSykCK.js","/assets/Profile-AyQSEYIJ.js","/assets/ProfileAvatar-CWhkJNLC.js","/assets/ProfilesManagement-D4Q51W-S.js","/assets/ProofCamera-BSSU3oiK.js","/assets/ProofPhoto-DRFl1CIy.js","/assets/Quality-BGeCWwan.js","/assets/RawRows-i7yIeMjm.js","/assets/Reports-CFfwN8Uo.js","/assets/RequestStateChip-C4mE_8gz.js","/assets/RichTextEditor-B7e881j5.js","/assets/SaveState-BM9-bpKR.js","/assets/SearchInput-pgvD6h8A.js","/assets/SeasonalityHeatmap-Bpsg37J4.js","/assets/SegmentedToggle-Be-XUt-X.js","/assets/SetupTimes-CVnNRo7G.js","/assets/ShiftDaily-VNYk1Xjm.js","/assets/ShiftTimes-D-HeBAPY.js","/assets/Staff-Bx491L0l.js","/assets/StaffListAtCheck-DN_K8Nyn.js","/assets/StatusBadge-CWh5baLQ.js","/assets/StatusBandsModal-SB7r1kQM.js","/assets/TargetGoal-BzzPA_IH.js","/assets/Targets-C5VfhgqN.js","/assets/TaskFormModal-DtgVTG4r.js","/assets/TaskerSettings-C2zsgs0-.js","/assets/Tasks-B83UCdMM.js","/assets/TgProfile-CfMlXBvM.js","/assets/TimeWheelPicker-DMot_1sr.js","/assets/Tooltip-BDlJRdyV.js","/assets/TranslationsEditor-Bx9mj9Nv.js","/assets/TrelloAnalytics-BcRYR7q4.js","/assets/TrelloSettings-Cd8qM_SG.js","/assets/TrendChart-Cl4Y3lyz.js","/assets/TripleSpeedometer-BF_DM4X_.js","/assets/Trudoyomkost-Eqd31PF0.js","/assets/UploadDropzone-w7LWkA05.js","/assets/UsersActivity-GLVbcF2h.js","/assets/UsersManagement-DPpWOt0t.js","/assets/VerdictBlock-C-Cx7A_b.js","/assets/VerifixParity-Dk2YMDym.js","/assets/VerifixSettings-Cq7N-QTT.js","/assets/VerifixSync-D2KKDFDW.js","/assets/VfxApiMap-BuI8Ep1y.js","/assets/VfxDictionaries-DwgU0cGX.js","/assets/VfxEmployees-DIjZDa0s.js","/assets/VfxHrMoves-BOzgQyn7.js","/assets/VfxJobs-HSMwiBOw.js","/assets/VfxPhoto-D0mkvE0Q.js","/assets/VfxShifts-BpjUuvA_.js","/assets/VfxState-BWoXEN50.js","/assets/VfxTimebooks-Jk3pSDrU.js","/assets/VfxTimesheet-Cr3Czfol.js","/assets/WatchProgress-BkN9OS-V.js","/assets/WebLogin-CE3vFVdH.js","/assets/WorkersAttendance-PJ1qtS9U.js","/assets/WorkersComposition-CLDsKlCY.js","/assets/WorkersMovements-BtSw9Hy0.js","/assets/WorkersPage-CQlIa3qK.js","/assets/Zagruzka-w0OnMq80.js","/assets/ZagruzkaCell-DMkkjA_f.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-DqyErAbE.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-CaogU8Eh.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-CSa1ezVj.js","/assets/broadcastTree-BaHV2Bgx.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-BGOH3KaC.js","/assets/cellMoveRefusal-B64-Saxc.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-B9j9irMP.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-Be9TjmL6.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DrvZvNWv.js","/assets/funnel-DYimzUBX.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-WRzcZ46H.css","/assets/index-bSnD-fhJ.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-DLCc5jAA.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-BnursICb.js","/assets/map-pin-BNmosVmR.js","/assets/marks-5Wm0qrtw.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CDNuyTW2.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-C02VPu0x.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-WwyHd7Dn.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CctoN62u.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DgKa559y.js","/assets/ru-DGoy8LUu.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-rofRahpn.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-CxPVdLx1.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CL5iadyX.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-DSGX_GBe.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-CV9Vl8RX.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-BYsQZ1i9.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-DH568FPy.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-C2IPPH1S.js","/assets/useOpenParam-DHcch67C.js","/assets/useStatusBands-B3_IVtkf.js","/assets/useUrlScope-OOSiKMjE.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-BDu-J82_.js","/assets/uz_cyrl-C5T8lB0t.js","/assets/vfx-DNFDF4iq.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-o_Z11TUN.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
