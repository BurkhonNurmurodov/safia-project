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

const BUILD = "2026-10-05T11:29:49.030Z";
const PRECACHE = ["/","/assets/AdminPanel-Bnq2r5dG.js","/assets/AnalysisBoard-Be_QdhJU.js","/assets/Arc-UQp7glxX.js","/assets/BrigadirProfile-g7FDVSMA.js","/assets/BroadcastReceivers-CGJqhhTc.js","/assets/BroadcastRecord-h200ONaz.js","/assets/Button-CefGOeNp.js","/assets/CatLockNotice-BkO8r9M9.js","/assets/CategoryLegendModal-kp8t9Kka.js","/assets/CellConcerns-CbooMfF5.js","/assets/CellDetails-CVOO8u_L.js","/assets/CellFormModal-DVbfRJwu.js","/assets/CellIdent-G3rmloCI.js","/assets/CellLink-ew8OCk8w.js","/assets/Cells-BoefW1uZ.js","/assets/ColumnFilter-z2iN7NhU.js","/assets/ColumnsPicker-Cjb3jXkg.js","/assets/CommentsModal-DRUxPqhR.js","/assets/ComparisonTable-BMIBlEcn.js","/assets/Concerns-CkJwQvuU.js","/assets/Daily-CHlf2Oyy.js","/assets/DataTable-BvDnGR3Y.js","/assets/DateRangePicker-CSRT6sLO.js","/assets/DayReportView-UPxwZBGr.js","/assets/DayStepper-CQevTdef.js","/assets/DifferenceBreakdown-CZU4r9II.js","/assets/Downtime-CeGj-UFh.js","/assets/Education-unvV7FEO.js","/assets/EducationLesson-DTGhAKf4.js","/assets/EmptyState-BhXSInNV.js","/assets/Exam-BUhTdsiv.js","/assets/FactorySelect-Ce-nXffi.js","/assets/Gamification-qyCs-KnR.js","/assets/GroupBadge-CmIe0IS-.js","/assets/HeatmapChart-BKKMxCtb.js","/assets/IdleCell-Ce-8HMEK.js","/assets/KPICard-DjpvJHZH.js","/assets/Kaizen-g6xHuAZa.js","/assets/Kelish-BgHRKxT6.js","/assets/KpiDeltaCard-Dz8QoOoG.js","/assets/LangTextInput-DN0go38X.js","/assets/Layout-CRBq__du.js","/assets/LeaderAppeal-BBS9qHWt.js","/assets/LeaderDayReport-B6tyrUWs.js","/assets/LeaderUnitReport-CvHPpiqo.js","/assets/Leaderboard-BHIYLclQ.js","/assets/Leaders-CqtZwZ57.js","/assets/Lightbox-COv87qPN.js","/assets/LiveOverview-CiIkSJyQ.js","/assets/Login-CONNRVob.js","/assets/NotFound-DhEdOjbm.js","/assets/Notifications-C7OOJbSq.js","/assets/Overview-BGgnjRzi.js","/assets/Pagination-swSL510H.js","/assets/PerenaladkaFactTable-Zp7AUIQ_.js","/assets/PersonCard-BWPUpDRc.js","/assets/PlanFulfillment-BhV_jE9W.js","/assets/Production-3OEvf7p2.js","/assets/Profile-BQZTpgI4.js","/assets/ProofCamera-Dt-8hTW_.js","/assets/ProofPhoto-C_GJLxEq.js","/assets/Quality-Df5cGt0-.js","/assets/RawRows-Bv8Ts0ES.js","/assets/RequestStateChip-Dxalgx-L.js","/assets/RichTextEditor-DGAIedcs.js","/assets/SaveState-Brvcy5lS.js","/assets/SearchInput-OBZNcuGp.js","/assets/SeasonalityHeatmap-Deej5lMO.js","/assets/SegmentedToggle-PovToBll.js","/assets/SetupTimes-9M9kJ3x_.js","/assets/ShiftDaily-BfNAnNKe.js","/assets/Staff-Baj6V6n1.js","/assets/StaffLive-BRnRVafg.js","/assets/StatusBadge-C4aHT60H.js","/assets/TargetGoal-DT8f1wKY.js","/assets/Targets-BIxDr8gp.js","/assets/Tasks-B1Sqdyd3.js","/assets/TimeWheelPicker-CTu5oNkk.js","/assets/Toast-DYWpA7TS.js","/assets/Tooltip-D5ROVhsb.js","/assets/TrendChart-BQENsOgO.js","/assets/TripleSpeedometer-B7no7IoY.js","/assets/Trudoyomkost-CMfwoeJ6.js","/assets/Turnover-NanclzQf.js","/assets/UploadDropzone-B35VfEL3.js","/assets/UsersActivity-jbwS_6w9.js","/assets/VerdictBlock--CNFYvFE.js","/assets/VfxApiMap-Dnt_s0MN.js","/assets/VfxDictionaries-Bh7au2PT.js","/assets/VfxEmployees-el6TRonb.js","/assets/VfxHrMoves-Di41bz0Q.js","/assets/VfxJobs-D7UO530S.js","/assets/VfxPhoto-CDjkZNGD.js","/assets/VfxShifts-CF7GaOm7.js","/assets/VfxState-DKwq5NpI.js","/assets/VfxTimebooks-CERSMx2a.js","/assets/VfxTimesheet-BeI-OeV_.js","/assets/WatchProgress-CYCX_A1z.js","/assets/WebLogin-BmG9Pex_.js","/assets/WorkerConcerns-DBM2wbax.js","/assets/Workers-BWJtoZeX.js","/assets/Zagruzka-ChofjohM.js","/assets/ZagruzkaCell-r3SQOZyS.js","/assets/api-DijIaU8r.js","/assets/archive-CrOp_qCP.js","/assets/archive-restore-BiSB9nhp.js","/assets/arrow-down-BTK_o_xS.js","/assets/arrow-left-CcSiL2QP.js","/assets/arrow-up-DcK6gTIR.js","/assets/arrow-up-narrow-wide-PuiHNc-V.js","/assets/arrow-up-right-Cf2G2Z4q.js","/assets/award-D6Utw2w5.js","/assets/ban-B2Bm4btp.js","/assets/book-open-DEOz3wwB.js","/assets/boxes-CWjvXpqR.js","/assets/braces-BDHVQtI1.js","/assets/brigadirFilters-B7Op9dJF.js","/assets/broadcastTree-DCarRcU5.js","/assets/building-2-ZgZIixCd.js","/assets/calculator-B2xTRchC.js","/assets/calendar-C-qEl_lF.js","/assets/calendar-days-DKaw1Byi.js","/assets/camera-BA9yGqvJ.js","/assets/categories-74lxBpBp.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DG4ThuR_.js","/assets/chart-line-CHkRiwoz.js","/assets/chart-pie-DFoPDeyO.js","/assets/chartRange-BwfoVZMy.js","/assets/check-check-BrB0fnsT.js","/assets/chevron-left-C_kBNbVN.js","/assets/chevrons-up-down-BLskoKij.js","/assets/circle-BzvFGNDI.js","/assets/circle-alert-uEWgzT6I.js","/assets/circle-check-big-BcQfe_qo.js","/assets/circle-dashed-Bxe6YAAP.js","/assets/circle-minus-BPHtm7IE.js","/assets/circle-question-mark-fmz-KiS2.js","/assets/circle-slash-Dz7ylQH-.js","/assets/circle-user-round-YuO_hjAp.js","/assets/clock-3-DI7B0Z5G.js","/assets/cloud-off-HRHiToVp.js","/assets/cloud-upload-B5pflQF8.js","/assets/compass-CYLDrvlK.js","/assets/concernCategories-Cc5BpvLc.js","/assets/copy-BdPJcN1j.js","/assets/corner-down-right-DOGKv7yn.js","/assets/createLucideIcon-Dx1OteyZ.js","/assets/es-BWeANWZ8.js","/assets/exportXlsx-D4_6gtuB.js","/assets/external-link-DJMV_0oY.js","/assets/file-clock-jA_Tp1Ik.js","/assets/file-exclamation-point-CJHCG4v4.js","/assets/file-spreadsheet-C4HSfkmB.js","/assets/file-text-T8kSPlND.js","/assets/flag-CQhc86qa.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-L11L_BQU.js","/assets/hash-HSJtid5L.js","/assets/history-B20RkTys.js","/assets/hourglass-DMj6FSWk.js","/assets/image-Ch33D6bs.js","/assets/image-off-D5bjjR6I.js","/assets/inbox-B7KwLm7c.js","/assets/index-CCQoDNa6.css","/assets/index-DF7SdIo_.js","/assets/key-round-dKHpK2xI.js","/assets/keyboard-C_owh601.js","/assets/languages-li4xLgT1.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-B9dY_K_n.js","/assets/lightbulb-COXdZebW.js","/assets/link-2-knAElBMi.js","/assets/link-2-off-Cp88CyyY.js","/assets/list-ordered-BsrtZonI.js","/assets/list-tree-CnlHHQK9.js","/assets/lock-open-DXUNau3e.js","/assets/log-in-BL5NXVoc.js","/assets/maximize-2-B9_EPgTY.js","/assets/message-square-CeWxGaYG.js","/assets/minimize-2-Ctz_J2ls.js","/assets/package-check-BgBu3bWH.js","/assets/paperclip-Bo5HWgbt.js","/assets/pencil-TCgx8jul.js","/assets/percent-IPzTsIYw.js","/assets/pin-BNXK_K01.js","/assets/pin-off-VNWb8vkf.js","/assets/play-DlOj_s9l.js","/assets/plug-zap-DFySlt_h.js","/assets/presentation-D2qY6U6L.js","/assets/prop-types-DANOSlHc.js","/assets/radio-Bo_eYQo-.js","/assets/react-apexcharts.esm-DXwdbdRb.js","/assets/registers-ChLbPCKA.js","/assets/repeat-CHKEclsk.js","/assets/rotate-ccw-CeGx80RJ.js","/assets/rotate-cw-BRkSfX8h.js","/assets/save-DN0iDEEx.js","/assets/scopeLinks-D5Mi24c-.js","/assets/scroll-text-DJ-w_r4e.js","/assets/search-x-DbT7WE6d.js","/assets/segments-Czl8JUdr.js","/assets/send-CCPcCjgv.js","/assets/settings-2-B7AAAxA5.js","/assets/shield-alert-DEKCclLY.js","/assets/shield-check-C0Du4QM1.js","/assets/shield-question-mark-D9dIWh4z.js","/assets/shield-sfO4c7Cy.js","/assets/siren-NMmMifde.js","/assets/snowflake-Bd2qL2wy.js","/assets/split-B_zz06me.js","/assets/square-C9gsiSq8.js","/assets/square-check-big-g4DugGS3.js","/assets/star-upMxjZJB.js","/assets/statusBands-DGQWGALV.js","/assets/store-D2CxCN1w.js","/assets/table-2-jMch16AA.js","/assets/table-properties-DMm-ltuK.js","/assets/tag-CzMsn80_.js","/assets/timer-off-BxqqKxm8.js","/assets/trending-down-FK-OgNay.js","/assets/trending-up-CMuYMB0u.js","/assets/undo-2-BJGYjXKC.js","/assets/useChartTheme-Dza26xgd.js","/assets/useElementWidth-CLl7NFlT.js","/assets/useIsMobile-CgL-WUeA.js","/assets/useOpenParam-BaxaGH95.js","/assets/useStatusBands-BnpGfkIt.js","/assets/useUrlScope-CLKyKxmP.js","/assets/user-NWKaIoNT.js","/assets/user-cog-DTCc73uZ.js","/assets/users-r8gOSA7D.js","/assets/vfx-J-6O6s_B.js","/assets/video-CQ-WkCGR.js","/assets/wallet-bPpBoZhw.js","/assets/warehouse-DrtzXDnG.js","/assets/x-CBrzd40q.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
