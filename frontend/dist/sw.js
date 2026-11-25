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

const BUILD = "2026-11-25T17:56:48.391Z";
const PRECACHE = ["/","/assets/AdminPage-D_10aEHB.js","/assets/AdminTabs-Cs0atWZt.js","/assets/AiKeys-Dfam4gM8.js","/assets/AnalysisBoard-Os_lcV8T.js","/assets/ApiAccess-BXYzanVh.js","/assets/AppLauncher-C9br_mg2.js","/assets/Arc-CHGqGKi0.js","/assets/Assessment-brYh4GKj.js","/assets/AssessmentGrade-z-Rj_yjN.js","/assets/AssessmentList-BXk0x4hD.js","/assets/Assistant-BeAImD2_.js","/assets/AttendanceCleanup-CMn_Zv8q.js","/assets/AttendanceUpload-DrY9VdRr.js","/assets/AuditTable-DAfNNpAu.js","/assets/Audits-CLG_krQW.js","/assets/BolimsModal-DOszPqYW.js","/assets/BrigadirProfile-TtFCSEQx.js","/assets/BrigadirsKpi-B6BfbCTw.js","/assets/Broadcast-CIRevCt3.js","/assets/BroadcastReceivers-NlT4a4em.js","/assets/BroadcastRecord-ZeQPqHz9.js","/assets/CatLockNotice-Cbj3eMN9.js","/assets/CategoryLegendModal-Cn3M2edI.js","/assets/CellConcerns-B61nklq7.js","/assets/CellDetails-DtBo_fXv.js","/assets/CellFormModal-Cms7yIph.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-Fnjhj7Q1.js","/assets/Cells-DcgC6P6t.js","/assets/ColumnFilter-BA1ekdoO.js","/assets/ColumnsPicker-BiS_3mAO.js","/assets/CommentsModal-B-wOTU_q.js","/assets/ComparisonTable--HJb88-0.js","/assets/Concerns-aiLSe1ra.js","/assets/ConcernsPieces-C1-jU3_c.js","/assets/ContainerBolims-BidzynNn.js","/assets/ContainerFlow-ClGKLOwz.js","/assets/ContainerTotalsCard-BCbS9KX6.js","/assets/Containers-DDrmgsUv.js","/assets/CountStepper-QiAQ_SrO.js","/assets/Daily-DWjfIv0X.js","/assets/DataSources-7obXZN1r.js","/assets/DataTable-Cnd3ReBW.js","/assets/DateRangePicker-CUARz9Xi.js","/assets/DayReportView-C6LVXdZY.js","/assets/DayStepper-DDeq3hFX.js","/assets/DayStrip-COX-hiLc.js","/assets/DbBackup-jmpqtno_.js","/assets/DifferenceBreakdown-uNWmRV6W.js","/assets/DocAudit-DGldgSZh.js","/assets/Downtime-CXLFI7zh.js","/assets/Education-CDCra2ww.js","/assets/EducationLesson-CRHvfjNW.js","/assets/EmptyState-CNYZDlp5.js","/assets/Equipment-DabBJ-Kq.js","/assets/Exam-8H8Kspuk.js","/assets/ExamAdmin-C38VPKsS.js","/assets/Factories-Co3Gux-c.js","/assets/FactorySelect-376DsKEu.js","/assets/Gamification-IgUbuXRQ.js","/assets/GroupBadge-af97wFVZ.js","/assets/HeatmapChart-C1Nl68XO.js","/assets/HourlyContainers-ClqpmMGK.js","/assets/IdleCell-DvPDAXXJ.js","/assets/IdleOwners-DI-Nt0hs.js","/assets/IdleSolutions-BTM1qEeW.js","/assets/KPICard-K0AupuJC.js","/assets/Kaizen-DMUCRA0o.js","/assets/Kelish-DO5WMVT5.js","/assets/Kitchen-C0pAILBE.js","/assets/KpiBits-D2zRxX8_.js","/assets/KpiDeltaCard-C46F7rV3.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-DCAukX2b.js","/assets/LeaderAppeal-DviVaNRX.js","/assets/LeaderDailyTasks-D8qSVkyX.js","/assets/LeaderDayReport-B9kdEeyx.js","/assets/LeaderNotCounting-CA82OZ_c.js","/assets/LeaderTasksAdmin-DJJ5zZxZ.js","/assets/LeaderUnitReport-xYZcAmUj.js","/assets/Leaderboard-CpYsL3QZ.js","/assets/Leaders-AaOeGL1q.js","/assets/LeadersKpi-BRsw_mQS.js","/assets/Lightbox-DCFn8e9V.js","/assets/LiveOverview-CLzFG-am.js","/assets/Login-BjZpWdea.js","/assets/Logs-DBUGTFk8.js","/assets/LostWorkers-BOvSlK7n.js","/assets/NotFound-Ca3WwcKH.js","/assets/Notifications-B-g9Cn59.js","/assets/NotionTasks-gPrDYwOJ.js","/assets/NotionTrackerSettings-CfTD7HFp.js","/assets/Ontime-BH0fujK3.js","/assets/OrgChart-CaeLCDib.js","/assets/Ovens-DqHAzLp3.js","/assets/OvensSettings-BLMA1aZh.js","/assets/Overview-wKcCoktO.js","/assets/OwnerChip-DklW4YlS.js","/assets/Pagination-CBvTpw-t.js","/assets/People-CgfeKg3z.js","/assets/PerenaladkaFactTable-mPZE9y3e.js","/assets/Permissions-BCmSHesL.js","/assets/PersonCard-DcNimIjd.js","/assets/PlanFulfillment-DKjFXBPZ.js","/assets/Production-CplpKl0D.js","/assets/ProductionUpload-D442t60P.js","/assets/Profile-Cb1T7yL4.js","/assets/ProfileAvatar-DLK-vsvb.js","/assets/ProfilesManagement-D4OG4SMd.js","/assets/ProofCamera-CsuKK1ic.js","/assets/ProofPhoto-D2qq0ISQ.js","/assets/Quality-Dx70Z-1q.js","/assets/RawRows-3LJXDlo4.js","/assets/Reports-BgXp9vKh.js","/assets/RequestStateChip-DRMAE2ot.js","/assets/RichTextEditor-BjFK5-c_.js","/assets/SaveState-wrK9F_Or.js","/assets/SdPanelSettings-B-CQdz0X.js","/assets/SearchInput-Ds8M-TID.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-1ZOZ9T3-.js","/assets/ShiftDaily-asIiTw8c.js","/assets/ShiftTimes-BYbbnGhR.js","/assets/SkuHistory-CZV9s780.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-CCetzemw.js","/assets/StaffListAtCheck-CoEyg2sz.js","/assets/StatusBadge-_dTV7YKa.js","/assets/StatusBandsModal-BbE_HObD.js","/assets/TargetGoal-DXtFDlsL.js","/assets/Targets-DlHHBSeb.js","/assets/TaskFormModal-ZXuYfRbI.js","/assets/TaskerSettings-DV5UxOlA.js","/assets/Tasks-BF9UYX0v.js","/assets/TgProfile-CDBid6Qq.js","/assets/TimeWheelPicker-CW4mACax.js","/assets/Tooltip-BVnWoLOn.js","/assets/TranslationsEditor-BVKsLEPF.js","/assets/TrelloAnalytics-BRna6t11.js","/assets/TrelloSettings-DC4-3gBj.js","/assets/TrendChart-CRAHde62.js","/assets/TripleSpeedometer-7iYUvHul.js","/assets/Trudoyomkost-LZOebOpV.js","/assets/UploadDropzone-ColXkfDy.js","/assets/UsersActivity-BmXaKnox.js","/assets/UsersManagement-CU3PaFy4.js","/assets/VerifixPage-TndHn6dK.js","/assets/VerifixParity-hlySzbKp.js","/assets/VfxApiMap-B3rOY1t1.js","/assets/VfxDictionaries-9Fcrw10T.js","/assets/VfxEmployees-8bmhI7ei.js","/assets/VfxHrMoves-KLYoe9Dj.js","/assets/VfxJobs-BhXLMNTN.js","/assets/VfxPhoto-eZo5vyh2.js","/assets/VfxShifts-Cn2CCE2Q.js","/assets/VfxState-BLMHHjlf.js","/assets/VfxTimebooks-DLQdzJbl.js","/assets/VfxTimesheet-69fLkbp-.js","/assets/WatchProgress-WUfqqmgM.js","/assets/WebLogin-DwneQkIL.js","/assets/WorkersAttendance-Q5HVB-LH.js","/assets/WorkersComposition-DVxOL1jd.js","/assets/WorkersMovements-C09LnwEl.js","/assets/WorkersPage-OVm_Zt4p.js","/assets/Zagruzka-BbaQZKnl.js","/assets/ZagruzkaCell-PJE1T2f2.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-C1Erfe8T.js","/assets/api-D_IoyhCc.js","/assets/appealTask-Bun3v9kT.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-BGexwqNt.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/bolim-TbqNYNfw.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-Nk6H5rbE.js","/assets/broadcastTree-D6YW3z-i.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-CXjDJwxv.js","/assets/categories-BVa9zcZa.js","/assets/cellMoveRefusal-BFkp_sGQ.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-Betl1qNK.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-CrQRnHYW.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-Xc_5r8iD.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-OikSKJQJ.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BP9YUJL4.js","/assets/index-DVB0Dg__.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-ChoANNC3.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/marks-BKu94BhC.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-BCH5vW2p.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-vYubnI68.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-DGhQ38bs.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-BaC48IR5.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-DBIJxhyx.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-1HtltKst.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-Bw6L_yxZ.js","/assets/useMutation-94hZNUla.js","/assets/useOpenParam-DqD5oqiq.js","/assets/useStatusBands-CMuNfdLK.js","/assets/useUrlScope-bnvHjcWu.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-rMPN9hqg.js","/assets/uz_cyrl-CYhVcHmH.js","/assets/vfx-BdpYMJE0.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-BMbfOtHG.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
