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

const BUILD = "2026-10-02T10:45:39.529Z";
const PRECACHE = ["/","/assets/AdminPanel-DoLOrCVm.js","/assets/AnalysisBoard-BuBTuZDN.js","/assets/Arc-CEy0S_gk.js","/assets/ArcLegacy-_XK5ljVB.js","/assets/BrigadirProfile-DVHwxW40.js","/assets/BroadcastReceivers-Ch5Cx643.js","/assets/BroadcastRecord-Ci1U4zbg.js","/assets/CatLockNotice-DShHqhXY.js","/assets/CategoryLegendModal-BIE1Qw6t.js","/assets/CellConcerns-CwCRtCYl.js","/assets/CellDetails-CA6d_cTd.js","/assets/CellFormModal-L40lKV4t.js","/assets/CellIdent-BOoRluuW.js","/assets/CellLink-CsvsJ6LD.js","/assets/Cells-Bt0VtRrr.js","/assets/ColumnFilter-B8XDTnoE.js","/assets/ColumnsPicker-CXhu9QiE.js","/assets/CommentsModal-DGS0sfnd.js","/assets/ComparisonTable-BiH_wpyO.js","/assets/Concerns-wIXV6JLM.js","/assets/ConfirmDialog-DBQ-TDxv.js","/assets/Daily-CPN6Ukxb.js","/assets/DataTable-Dd7qzpLO.js","/assets/DateRangePicker-ByBmM8Ls.js","/assets/DayReportView-B1vIbt7S.js","/assets/DayStepper-B5dVfO3I.js","/assets/DifferenceBreakdown-CVz-GkxK.js","/assets/Downtime-ue7hq48K.js","/assets/Education-CvUK683K.js","/assets/EducationLesson-Bj0Tj51w.js","/assets/EmptyState-CIpMsRfB.js","/assets/Exam-DbsBQi0F.js","/assets/FactorySelect-CpQwqqBs.js","/assets/Gamification-TKKUU-2g.js","/assets/GroupBadge-CGAT5593.js","/assets/HeatmapChart-C-v2rpgO.js","/assets/IdleCell-958-n65k.js","/assets/KPICard-CTUEup4x.js","/assets/Kaizen-C9_SxZqa.js","/assets/Kelish-CczHt1HS.js","/assets/KpiDeltaCard-DyIZYY_X.js","/assets/LangTextInput-DxQs7Rmq.js","/assets/Layout-D7zUmGoZ.js","/assets/LeaderAppeal-CKR9a-tX.js","/assets/LeaderDayReport-C0iSUNQj.js","/assets/LeaderUnitReport-DSlXrt9E.js","/assets/Leaderboard-BdFYKfxU.js","/assets/Leaders-C82j-gAs.js","/assets/Lightbox-DKbFLYmX.js","/assets/LiveOverview-B-B8tS3e.js","/assets/Login-DZkTR0m1.js","/assets/NotFound-C5p1U_Nm.js","/assets/Notifications-OZsyX4WO.js","/assets/Overview-Dgg9Pm3H.js","/assets/Pagination-BkLKe2MY.js","/assets/PerenaladkaFactTable-dMGx6e4c.js","/assets/PlanFulfillment-zMs1JXau.js","/assets/Production-BpvRMjog.js","/assets/Profile-CQ5izGKc.js","/assets/ProofCamera-CH_2jHWp.js","/assets/ProofPhoto-D7Ka0faP.js","/assets/Quality-CwvfXhec.js","/assets/RequestStateChip-B0atwTRk.js","/assets/RichTextEditor-BRqFsjXt.js","/assets/SaveState-CWoyEmzQ.js","/assets/SearchInput-BJz_tCju.js","/assets/SeasonalityHeatmap-BzaLkVm3.js","/assets/SegmentedToggle-DZzcnXi2.js","/assets/SetupTimes-BH3QkP88.js","/assets/ShiftDaily-4awR_U_X.js","/assets/Staff-CPOwyym2.js","/assets/StaffLive-Cwc21_wg.js","/assets/StatusBadge-B2s9JNXS.js","/assets/TargetGoal-C0xJ9Gij.js","/assets/Targets-Dz-7mz5W.js","/assets/Tasks-DTjhVbnx.js","/assets/TimeWheelPicker-CjQazbKI.js","/assets/Toast-D8TG30dd.js","/assets/Tooltip-3mWSKkf6.js","/assets/TrendChart-BnsNk43h.js","/assets/TripleSpeedometer-BJ3Sw04i.js","/assets/Trudoyomkost-B6EifvQ0.js","/assets/UploadDropzone-CpG8bPSK.js","/assets/UsersActivity-BL0TbUyf.js","/assets/VerdictBlock-CDZiQ1se.js","/assets/WatchProgress-oQYGnXSS.js","/assets/WebLogin-Vtf1USv0.js","/assets/WorkerConcerns-h0OUyrJg.js","/assets/Workers-nu8lA_-_.js","/assets/Zagruzka-Cib6mgZj.js","/assets/ZagruzkaCell-B85wUm4x.js","/assets/api-BiUMqWHb.js","/assets/archive-8J8epY3V.js","/assets/archive-restore-8F0b0lFF.js","/assets/arrow-down-9NS0UA4j.js","/assets/arrow-left-ClMfznOg.js","/assets/arrow-right-left-C2aWf8FK.js","/assets/arrow-up-ChNDQxjm.js","/assets/arrow-up-narrow-wide-Cpc8Sws5.js","/assets/arrow-up-right-Auyawkue.js","/assets/award-DSUUQ5er.js","/assets/ban-BW92J-pw.js","/assets/bot-DNEj01h6.js","/assets/boxes-BjSn1--E.js","/assets/brigadirFilters-Dz8SVwXI.js","/assets/broadcastTree-BeM5gJPm.js","/assets/building-2-iNlcg0Eb.js","/assets/calendar-DNLH8zyu.js","/assets/calendar-days-BaFbnNnN.js","/assets/calendar-range-Dixe4Sr8.js","/assets/camera-D7ex2aGF.js","/assets/categories-CM9-f2LJ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BOfp7ekb.js","/assets/chart-line-D81M0ECP.js","/assets/chart-pie-UiNKU838.js","/assets/chartRange-CNh1bEvl.js","/assets/chevron-left-D5HLSRFN.js","/assets/chevrons-up-down-BjpL1vt8.js","/assets/circle-RcqR218O.js","/assets/circle-alert-Dkp2vls2.js","/assets/circle-check-big-BIKNbviB.js","/assets/circle-minus-BppffsiL.js","/assets/circle-slash-Cd-Ok7C3.js","/assets/circle-user-round-D9BtbC2F.js","/assets/cloud-off-BgY7Ixqw.js","/assets/cloud-upload-DlxZ8R2g.js","/assets/compass-CfFcKh_-.js","/assets/concernCategories-a51ciCPg.js","/assets/copy-C_3KhOsd.js","/assets/corner-down-right-CjhgkjFJ.js","/assets/createLucideIcon-BzSTCjmi.js","/assets/es-Db9mL21t.js","/assets/exportXlsx-Dd6Z6AOu.js","/assets/external-link-CCbavtUY.js","/assets/file-clock-DJeRIvYm.js","/assets/file-exclamation-point-CHUmJh42.js","/assets/file-spreadsheet-CIVIsHOR.js","/assets/file-text-Lf_3j0dK.js","/assets/flag-B0PPPc8-.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BpEGU5Qh.js","/assets/hash-BJRYCbRY.js","/assets/history-gZMQz8oU.js","/assets/hourglass-Ba-r88ko.js","/assets/id-card-Dmh0hPB2.js","/assets/image-DCKyVedF.js","/assets/image-off-5NcmEUvs.js","/assets/inbox-YxTdLBgj.js","/assets/index-Brs3vHLh.js","/assets/index-CBQ-7RpV.css","/assets/key-round-e1cHEJNB.js","/assets/keyboard-CNh39mDh.js","/assets/languages-DKk3O65Y.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BWnBzKVI.js","/assets/lightbulb-BH6Tsx6O.js","/assets/link-2-fBN-322U.js","/assets/link-2-off-DxP1ESfj.js","/assets/list-ordered-BI0YRq2v.js","/assets/list-tree-CwOaZRq6.js","/assets/lock-open-LF4brHDo.js","/assets/log-in-NQgIBp7q.js","/assets/maximize-2-3IDzckJc.js","/assets/message-square-cMbkhD7T.js","/assets/minimize-2-DOHU7JBX.js","/assets/package-check-DHG3T_li.js","/assets/paperclip-BWXkVNEd.js","/assets/pencil-6iGzF-L8.js","/assets/percent-BIWSuAmd.js","/assets/pin-LAUkV5YE.js","/assets/pin-off-DNHnPBI6.js","/assets/play-Ds7yFjuC.js","/assets/plug-zap-DRDdAC-5.js","/assets/presentation-kOT6gGMk.js","/assets/prop-types-DxHDCTOJ.js","/assets/radio-CoGJs1bR.js","/assets/react-apexcharts.esm-B6FqvcMD.js","/assets/repeat-D6O1QilR.js","/assets/rotate-ccw-DN7X-DzJ.js","/assets/rotate-cw-BFv8n7iV.js","/assets/save-Bp1Tv_6B.js","/assets/scopeLinks-Bo_6EIkx.js","/assets/scroll-text-Cn9HXmDe.js","/assets/search-x-D86VUqB_.js","/assets/segments-BwlhGqBa.js","/assets/send-Ckbu8p-f.js","/assets/settings-2-DOiNFybX.js","/assets/shield-alert-CFfuN2uZ.js","/assets/shield-check-CRr0M_dj.js","/assets/shield-question-mark-5alHb3n6.js","/assets/shield-w1WZArS9.js","/assets/siren-CFxwtDoT.js","/assets/snowflake-B2A0cgQ3.js","/assets/split-Be_o_pbz.js","/assets/square-check-big-BCrLemQt.js","/assets/square-tLCXOGze.js","/assets/star-C_DKjaGW.js","/assets/statusBands-MpSsbDfC.js","/assets/store-C15qSFFc.js","/assets/table-2-DF19X34-.js","/assets/table-properties-CITSVpRh.js","/assets/tag-DlvlA6Bj.js","/assets/timer-off-XSLj0Tnq.js","/assets/trending-down-d35hea85.js","/assets/trending-up-BPkH7VOp.js","/assets/undo-2-Dsez6e5D.js","/assets/useChartTheme-Ds5_BYWW.js","/assets/useElementWidth-CrIUxyHe.js","/assets/useIsMobile-MhzEYG55.js","/assets/useOpenParam-Dw8ag9Bx.js","/assets/useStatusBands-DVyY8Xcz.js","/assets/useUrlScope-D2izJDBa.js","/assets/user-L6QSxB7l.js","/assets/user-cog-CfN2uvzZ.js","/assets/user-minus-B5pPjv65.js","/assets/users-sRHalYTU.js","/assets/video-DBR-2dfI.js","/assets/wallet-BXGNc88f.js","/assets/warehouse-DYuO0jm7.js","/assets/x-PiIZjZos.js","/assets/zap-LN_gzTi-.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
