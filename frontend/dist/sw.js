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

const BUILD = "2026-11-23T09:48:37.487Z";
const PRECACHE = ["/","/assets/AdminPage-BK2Oxic4.js","/assets/AdminTabs-mEMLhaS2.js","/assets/AiKeys-Ci5gyB7u.js","/assets/AnalysisBoard-v33asCZ8.js","/assets/ApiAccess-DAvoPdjP.js","/assets/AppLauncher-DKJYUW16.js","/assets/Arc-SBgrlyaE.js","/assets/Assessment-CKD25r_z.js","/assets/AssessmentGrade-BcM15a9D.js","/assets/AssessmentList-T1Suwril.js","/assets/Assistant-DxPJJm0E.js","/assets/AttendanceCleanup-DWTGUPyA.js","/assets/AttendanceUpload-D0_ohrPi.js","/assets/AuditTable-HA4jCYTv.js","/assets/Audits-DW5aFFu-.js","/assets/BrigadirProfile-tTY_Mu5p.js","/assets/BrigadirsKpi-fCSIwiD1.js","/assets/Broadcast-XNNGjBIw.js","/assets/BroadcastReceivers-Byc0XcL8.js","/assets/BroadcastRecord-CWqjwmVs.js","/assets/CatLockNotice-dTNK8zpL.js","/assets/CategoryLegendModal-ChhzoQBt.js","/assets/CellConcerns-DCCVPQvZ.js","/assets/CellDetails-CJUZ1-IV.js","/assets/CellFormModal-Pn_4T6oL.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink--zfzgezx.js","/assets/Cells-P-cv6Nyh.js","/assets/ColumnFilter-uHrJWoew.js","/assets/ColumnsPicker-BG3U5fG9.js","/assets/CommentsModal-C7WwDhw1.js","/assets/ComparisonTable-Buyoa69f.js","/assets/Concerns-Bv33kNyG.js","/assets/ConcernsPieces-DIP2mxqc.js","/assets/ContainerFlow-DPLERUjg.js","/assets/ContainerTotalsCard-Ck5QKcxi.js","/assets/Containers-BUye4fYD.js","/assets/CountStepper-CzRAP1fO.js","/assets/Daily-CAbU-xh1.js","/assets/DataSources-Dan_OX30.js","/assets/DataTable-b5Vs-tK6.js","/assets/DateRangePicker-CrOiPqBE.js","/assets/DayReportView-C1zc0Tfv.js","/assets/DayStepper-BZsW1oxP.js","/assets/DayStrip-BJnrq9k2.js","/assets/DbBackup-ioADlq3F.js","/assets/DifferenceBreakdown-C997pWea.js","/assets/DocAudit-B3mu0oIH.js","/assets/Downtime-frN0SWZr.js","/assets/Education-BkG_JGti.js","/assets/EducationLesson-Cr__nBEo.js","/assets/EmptyState-9GNXN0rf.js","/assets/Equipment-De-JWJsx.js","/assets/Exam-nZBN_Vpi.js","/assets/ExamAdmin-CDKYYAtC.js","/assets/Factories-m8OBJ-tb.js","/assets/FactorySelect-CZoucpnX.js","/assets/Gamification-B0NquRWm.js","/assets/GroupBadge-ps-iB030.js","/assets/HeatmapChart-CE0q0QCp.js","/assets/HourlyContainers-BWypaTwB.js","/assets/IdleCell-CZdXh822.js","/assets/IdleOwners-ABW71y8D.js","/assets/IdleSolutions-CHNwrOs0.js","/assets/KPICard-BJKs1-wF.js","/assets/Kaizen-BkguSG0j.js","/assets/Kelish-BTVK3_GI.js","/assets/Kitchen-DHH80WC_.js","/assets/KpiBits-Dv1zfC_s.js","/assets/KpiDeltaCard-BjBXY_Wp.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-BbL7h_GJ.js","/assets/LeaderAppeal-CjaVr65H.js","/assets/LeaderDailyTasks-e3CS2ppQ.js","/assets/LeaderDayReport-BFeZ_fbd.js","/assets/LeaderNotCounting-B3oQCdYd.js","/assets/LeaderTasksAdmin-BBq_aOJe.js","/assets/LeaderUnitReport-eF6029qO.js","/assets/Leaderboard-DSACFLQ5.js","/assets/Leaders-nlttSVNq.js","/assets/LeadersKpi-cbzATgKd.js","/assets/Lightbox-BC0NZgEy.js","/assets/LiveOverview-B0OzK1Ie.js","/assets/Login-D6bMuX_J.js","/assets/Logs-8in8RAEB.js","/assets/LostWorkers-DHSfp8yI.js","/assets/NotFound-D6RLOybN.js","/assets/Notifications-Cs9AxIzK.js","/assets/NotionTasks-PUeDUtQe.js","/assets/NotionTrackerSettings-CrXuBhMv.js","/assets/Ontime-_-fC64bH.js","/assets/OrgChart-CtRRbvim.js","/assets/Ovens-BvZKIcsP.js","/assets/OvensSettings-DvDYHGjY.js","/assets/Overview-DOJGPTN1.js","/assets/OwnerChip-Twp8IuAn.js","/assets/Pagination-DpbJe3R_.js","/assets/People-D4zSz5qs.js","/assets/PerenaladkaFactTable-B-vyTuzF.js","/assets/Permissions-by4cNyvj.js","/assets/PersonCard-DXpROSzP.js","/assets/PlanFulfillment-tp8lcMyu.js","/assets/Production-CnuBhwu_.js","/assets/ProductionUpload-D1hvOAOJ.js","/assets/Profile-TnLUawNF.js","/assets/ProfileAvatar-mHnE1tEx.js","/assets/ProfilesManagement-fAX12XvF.js","/assets/ProofCamera-Cc2QoWsj.js","/assets/ProofPhoto-CiNFTReT.js","/assets/Quality-Bbn_UBUl.js","/assets/RawRows-DfOAZd2m.js","/assets/Reports-C-cPqNvk.js","/assets/RequestStateChip-D1fxPNdU.js","/assets/RichTextEditor-BgmuEC_x.js","/assets/SaveState-R7aAwD0q.js","/assets/SdPanelSettings-EvMgbYjW.js","/assets/SearchInput-DCnLWhpJ.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-DWv-0gVi.js","/assets/ShiftDaily-B_YCXtdD.js","/assets/ShiftTimes-CYd9l9rp.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-Cvj445-_.js","/assets/StaffListAtCheck-Cm2ZU4ut.js","/assets/StatusBadge-MwxusRgU.js","/assets/StatusBandsModal-t-BIM4KS.js","/assets/TargetGoal-CD934Goy.js","/assets/Targets-C3ScCqYH.js","/assets/TaskFormModal-DNYkPOHz.js","/assets/TaskerSettings-D6KA_v7Z.js","/assets/Tasks-DBiiqT2f.js","/assets/TgProfile-CMW7z84x.js","/assets/TimeWheelPicker-NweNIxAr.js","/assets/Tooltip-D3uc3X9B.js","/assets/TranslationsEditor-DQ4fJz6U.js","/assets/TrelloAnalytics-JkkaeB22.js","/assets/TrelloSettings-B22p6tfV.js","/assets/TrendChart-BQAFkbcA.js","/assets/TripleSpeedometer-BrO04O1z.js","/assets/Trudoyomkost-DJ05ZJjs.js","/assets/UploadDropzone-B-EX9pVg.js","/assets/UsersActivity-C6nsfzao.js","/assets/UsersManagement-tcNYpvuV.js","/assets/VerifixPage-CMPly13e.js","/assets/VerifixParity-DTzi-TeS.js","/assets/VfxApiMap-ZKcI62Zj.js","/assets/VfxDictionaries-BbiTOf-e.js","/assets/VfxEmployees-C4cTZS6N.js","/assets/VfxHrMoves-DBZu95oq.js","/assets/VfxJobs-BTTAA3k8.js","/assets/VfxPhoto-BqUGaqmq.js","/assets/VfxShifts-MJiqvwQW.js","/assets/VfxState-Vy01wDSu.js","/assets/VfxTimebooks-D7wrxH4y.js","/assets/VfxTimesheet-DqOcWXm4.js","/assets/WatchProgress-B91S7AAb.js","/assets/WebLogin-5KiMm_UN.js","/assets/WorkersAttendance-PGFS1RIF.js","/assets/WorkersComposition-BIaPFxq7.js","/assets/WorkersMovements-CTzC2W0C.js","/assets/WorkersPage-rW-PQanv.js","/assets/Zagruzka-BRD3t2Mf.js","/assets/ZagruzkaCell-D9EbxZtK.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-Bqe8Timk.js","/assets/api-D_IoyhCc.js","/assets/appealTask-Byskjuwl.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-ckBvPei2.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-D2UUrqj2.js","/assets/broadcastTree-BVTlFW2B.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-Cmlha5wB.js","/assets/categories-D4-8ktgM.js","/assets/cellMoveRefusal-CVZ22l_r.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-CLaFGi9P.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-Bjy-RR8K.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-BpvYWhJQ.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CvDrXAdl.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-Cuw2pT5_.js","/assets/index-DkyflHqG.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-C-_fO10r.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-BC_1iRcz.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-D_2NUyY6.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BI-sAeO9.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-BnNAAWv-.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-BzqN61bH.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-Dx9dNc7P.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-9PYtJQjx.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-BEdyz6hU.js","/assets/useMutation-B3AWvvbQ.js","/assets/useOpenParam-pyaqeLzK.js","/assets/useStatusBands-kC3LACGl.js","/assets/useUrlScope-BWk12Fsh.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-BgZj5Koo.js","/assets/uz_cyrl-V7lJgya0.js","/assets/vfx-CdDzjugj.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-B4Zybga_.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
