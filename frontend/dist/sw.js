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

const BUILD = "2026-10-04T09:51:07.662Z";
const PRECACHE = ["/","/assets/AdminPanel-DIOlYiOx.js","/assets/AnalysisBoard-BS-onUbA.js","/assets/Arc-BoB_o54L.js","/assets/ArcLegacy-CI62Kfv_.js","/assets/BrigadirProfile-CQGHgi2u.js","/assets/BroadcastReceivers-mcSFL0Ai.js","/assets/BroadcastRecord-CGexofz2.js","/assets/CatLockNotice-Cx_CBuyn.js","/assets/CategoryLegendModal-57RAf0bP.js","/assets/CellConcerns-C6e-DXg4.js","/assets/CellDetails-DQVzUcOI.js","/assets/CellFormModal-DQM4RRDg.js","/assets/CellIdent-BTQ_u3DI.js","/assets/CellLink-DKbj1UlV.js","/assets/Cells-CzHbP9fE.js","/assets/ColumnFilter-BeBAygH6.js","/assets/ColumnsPicker-Bx5NCTDv.js","/assets/CommentsModal-DoHI0luH.js","/assets/ComparisonTable-Db1VYzsy.js","/assets/Concerns-CF9kLyAk.js","/assets/ConfirmDialog-DPOv3qzK.js","/assets/Daily-D9HrZOY1.js","/assets/DataTable-PN7m8Iia.js","/assets/DateRangePicker-BQWxsaSQ.js","/assets/DayReportView-SvcIrU3Y.js","/assets/DayStepper-DLXTEp2B.js","/assets/DifferenceBreakdown-BypxbbFK.js","/assets/Downtime-DZ0KUuIo.js","/assets/Education-CuGzH_8y.js","/assets/EducationLesson-CGtvq8E2.js","/assets/EmptyState-ABP8tq9F.js","/assets/Exam-DZDjFnA0.js","/assets/FactorySelect-BzNSB1KY.js","/assets/Gamification-B_FQp_Yp.js","/assets/GroupBadge-BF-wDEKG.js","/assets/HeatmapChart-hQ8IohJX.js","/assets/IdleCell-CHQWP8h7.js","/assets/KPICard-DhHBdI1h.js","/assets/Kaizen-NDLQt6Mx.js","/assets/Kelish-BmoK5o_s.js","/assets/KpiDeltaCard-CT03dDxO.js","/assets/LangTextInput-Be_AgqX3.js","/assets/Layout-M2G0UD4a.js","/assets/LeaderAppeal-6cidTrZO.js","/assets/LeaderDayReport-ClvWfSfw.js","/assets/LeaderUnitReport-CJ97JjNu.js","/assets/Leaderboard-BFu6WbMa.js","/assets/Leaders-CgXtkxdF.js","/assets/Lightbox-Cra04Hf5.js","/assets/LiveOverview-CV8zrbVN.js","/assets/Login-DoU16aG9.js","/assets/NotFound-CdXnTk6P.js","/assets/Notifications-i1gcnAcZ.js","/assets/Overview-ChugRKch.js","/assets/Pagination-B0CX-gdk.js","/assets/PerenaladkaFactTable-PMH_TNwH.js","/assets/PersonCard-DNyrICtf.js","/assets/PlanFulfillment-BFUeze8U.js","/assets/Production-ChV7eXDU.js","/assets/Profile-DcvazFTf.js","/assets/ProofCamera-CD3z54Am.js","/assets/ProofPhoto-CBe6ZWgr.js","/assets/Quality-CmBxPDbm.js","/assets/RawRows-BjkryEuk.js","/assets/RequestStateChip-PovTr6kC.js","/assets/RichTextEditor-y13rEbpv.js","/assets/SaveState-CRcW7y_g.js","/assets/SearchInput-DAQUiKn0.js","/assets/SeasonalityHeatmap-DRj3HQyN.js","/assets/SegmentedToggle-By0oN6VV.js","/assets/SetupTimes-CYcqkoHT.js","/assets/ShiftDaily-BqIThI2C.js","/assets/Staff-BNwURaJa.js","/assets/StaffLive-DdLmiMDT.js","/assets/StatusBadge-BJfyP8HK.js","/assets/TargetGoal-h6ZPFiMM.js","/assets/Targets-ItnMf958.js","/assets/Tasks-BTBsHQMp.js","/assets/TimeWheelPicker-BtRJFf_t.js","/assets/Toast-OMK8c9_E.js","/assets/Tooltip-BbmAFCJL.js","/assets/TrendChart-651f4UiM.js","/assets/TripleSpeedometer-Cz6MtI6f.js","/assets/Trudoyomkost-CIVthOlT.js","/assets/UploadDropzone-SN79Et_b.js","/assets/UsersActivity-De5aSo8N.js","/assets/VerdictBlock-B4MdNUqf.js","/assets/VfxApiMap-BjAoCVJb.js","/assets/VfxDictionaries-DYqaekEK.js","/assets/VfxEmployees-6IaL32f8.js","/assets/VfxHrMoves-BVrGb-aJ.js","/assets/VfxJobs-Bna_i-Tp.js","/assets/VfxPhoto-CpMjcK_7.js","/assets/VfxShifts-CLDwJttD.js","/assets/VfxState-CFh62nwG.js","/assets/VfxTimebooks-Y9hzugFx.js","/assets/VfxTimesheet-C7jRXoml.js","/assets/WatchProgress-Bx7lVvpO.js","/assets/WebLogin-C7dMgyc0.js","/assets/WorkerConcerns-BQqQT4Kd.js","/assets/Workers-DoVbJXMq.js","/assets/Zagruzka-DzO6a69t.js","/assets/ZagruzkaCell-YbP-S2kk.js","/assets/api-CajgLZ73.js","/assets/archive-CkxTSIw-.js","/assets/archive-restore-C6ath4Mu.js","/assets/arrow-down-BFsv7D07.js","/assets/arrow-left-Cs-w7ct6.js","/assets/arrow-up-CA3di2O9.js","/assets/arrow-up-narrow-wide-DPca1Dh9.js","/assets/arrow-up-right-BsGZK9m5.js","/assets/award-CO2tJUra.js","/assets/ban-C4MD25ys.js","/assets/bot-C70lXYVd.js","/assets/boxes-Bcaeve-O.js","/assets/braces-BFALBnzj.js","/assets/brigadirFilters-BAWziQp3.js","/assets/broadcastTree-BPRdBA8j.js","/assets/building-2-D2ayKBkm.js","/assets/calendar-C-dofrsq.js","/assets/calendar-days-DjB3C8ar.js","/assets/camera-pdYEWnnn.js","/assets/categories-DmSWbg6n.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CeLi4a50.js","/assets/chart-line-BR_B0DUB.js","/assets/chart-pie-7fCOSGj9.js","/assets/chartRange-C5ZFQ2Zs.js","/assets/check-check-C-mCXvBt.js","/assets/chevron-left-D3qqJEv9.js","/assets/chevrons-up-down-D-pd9MaO.js","/assets/circle-CTTen1In.js","/assets/circle-alert-DKe-5eMT.js","/assets/circle-check-big-_BY8ZyXD.js","/assets/circle-dashed-BxRNuCmv.js","/assets/circle-minus-CialTuZo.js","/assets/circle-question-mark-TI4Fz_Co.js","/assets/circle-slash-lJBvGPKg.js","/assets/circle-user-round-Dm_X3ozi.js","/assets/clock-3-Bqvq2Nf3.js","/assets/cloud-off-BU7sdzlg.js","/assets/cloud-upload-BLJmc24J.js","/assets/compass-BPG2MloD.js","/assets/concernCategories-BP5_rUHR.js","/assets/copy-CYSmVlV1.js","/assets/corner-down-right-CKLK94RF.js","/assets/createLucideIcon-CMosmk_P.js","/assets/es-2dHwt6lY.js","/assets/exportXlsx-BzCsaxB3.js","/assets/external-link-Bu8wUYqN.js","/assets/file-clock-C-Q3YV22.js","/assets/file-exclamation-point-BzXCBT_C.js","/assets/file-spreadsheet-D88ayotG.js","/assets/file-text-BXfkHQwv.js","/assets/flag-DF0sD8Bz.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-2tPSIvyS.js","/assets/hash-BKKBNRpQ.js","/assets/history-3bso4Bdr.js","/assets/hourglass-DjOVTroP.js","/assets/image-DVkFYzkI.js","/assets/image-off-C6PR5nNZ.js","/assets/inbox-BPoQNcIQ.js","/assets/index-BcbO60tB.js","/assets/index-BngiOmj1.css","/assets/key-round-CUTT2raa.js","/assets/keyboard-DkuskZrC.js","/assets/languages-COCVeh1z.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CJeSvp_M.js","/assets/lightbulb-CtYeIpch.js","/assets/link-2-BhPrqS8u.js","/assets/link-2-off-DcJkFthG.js","/assets/list-ordered-CDyeZEfG.js","/assets/list-tree-D8gA2733.js","/assets/lock-open-D1DF0038.js","/assets/log-in-Bt_nys40.js","/assets/maximize-2-BU7qA9Ce.js","/assets/message-square-BbvptvX_.js","/assets/minimize-2-Smt-urmO.js","/assets/package-check-CIYQDZcM.js","/assets/paperclip-CYSuU3Az.js","/assets/pencil-CwiWUiuW.js","/assets/percent-CY59SL9w.js","/assets/pin-D1boIiOH.js","/assets/pin-off-3rWK6X77.js","/assets/play-CvpqnWEz.js","/assets/plug-zap-xEQ1GO9z.js","/assets/presentation-DwLbiXic.js","/assets/prop-types-3gHcGXRE.js","/assets/radio-DBcdRwJV.js","/assets/react-apexcharts.esm-CCQ4JafH.js","/assets/registers-stgt7Kkw.js","/assets/repeat-DrIDFxdp.js","/assets/rotate-ccw-CmZJPVAz.js","/assets/rotate-cw-BoY_rD-D.js","/assets/save-D_XjQSJu.js","/assets/scopeLinks-Mnyuaqlg.js","/assets/scroll-text-B2htaDkt.js","/assets/search-x-EF5rJ1wE.js","/assets/segments-CcUWf1SK.js","/assets/send-DiotwuIi.js","/assets/settings-2-mATW8KQq.js","/assets/shield-DiGnyU7u.js","/assets/shield-alert-BDngsS8B.js","/assets/shield-check-HihnQAv-.js","/assets/shield-question-mark-CsY__QbY.js","/assets/siren-KIpNK9R_.js","/assets/snowflake-vX5-rZqZ.js","/assets/split-Jyua4Yzp.js","/assets/square-_JWqYuHL.js","/assets/square-check-big-DlHshOcc.js","/assets/star-BPbQiNCg.js","/assets/statusBands-BkBZczKh.js","/assets/store-C-VhD_dx.js","/assets/table-2-CJ5v9m_l.js","/assets/table-properties-C0MKsMLM.js","/assets/tag-D8AayB8z.js","/assets/timer-off-BYFQa2nH.js","/assets/trending-down-BSKurP5C.js","/assets/trending-up-Cx4LnhrC.js","/assets/undo-2-CkcFRoGq.js","/assets/useChartTheme-D7TGO4r4.js","/assets/useElementWidth-pP3HF8fg.js","/assets/useIsMobile-DoDdBZr3.js","/assets/useOpenParam-DYvr0ZYV.js","/assets/useStatusBands-DBwGeluy.js","/assets/useUrlScope-DPpotN0v.js","/assets/user-BcyJjU2q.js","/assets/user-cog-ZNheF_m6.js","/assets/user-minus-qzuTHhtd.js","/assets/users-BLJauWXX.js","/assets/video-D5Tx-rOj.js","/assets/wallet-BHXhg667.js","/assets/warehouse-C9ORH5dH.js","/assets/x-CRNKlbjb.js","/assets/zap-BmrVgBnp.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
