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

const BUILD = "2026-10-08T05:55:15.294Z";
const PRECACHE = ["/","/assets/AdminPanel-E5Eih4zy.js","/assets/AnalysisBoard-DmUyEuVK.js","/assets/Arc-CEWzlMnS.js","/assets/Assistant-BqOaiti9.js","/assets/BrigadirProfile-B9xneCR1.js","/assets/BroadcastReceivers-NjhjkYio.js","/assets/BroadcastRecord-De8Zu2-g.js","/assets/Button-A0cUSlSH.js","/assets/CatLockNotice-CBlu89vu.js","/assets/CategoryLegendModal-CXaWQLyn.js","/assets/CellConcerns-9leuY6Am.js","/assets/CellDetails-Dbi_Pf1u.js","/assets/CellFormModal-LAxIMK27.js","/assets/CellIdent-BjkcUVhU.js","/assets/CellLink-IC7Kng6W.js","/assets/Cells-DM64pFVh.js","/assets/ColumnFilter-DWFS2164.js","/assets/ColumnsPicker-DFePHCWI.js","/assets/CommentsModal-lXXUqieH.js","/assets/ComparisonTable-B77WrMcq.js","/assets/Concerns-CR13KgBt.js","/assets/Daily-D8RUYFCK.js","/assets/DataTable-BtsWEdRg.js","/assets/DateRangePicker-H0dGu4GM.js","/assets/DayReportView-Bg1Vrc75.js","/assets/DayStepper-CWW1wOh-.js","/assets/DifferenceBreakdown-DRCn8kIz.js","/assets/Downtime-DwDi44uA.js","/assets/Education-BY7uobAe.js","/assets/EducationLesson-BF5UMENg.js","/assets/EmptyState-CW3VgMDA.js","/assets/Exam-A3MbJMqC.js","/assets/FactorySelect-ldyPcBDU.js","/assets/Gamification-qMED0TO3.js","/assets/GroupBadge-D1GNskme.js","/assets/HeatmapChart-0TRjNCnS.js","/assets/IdleCell-DXqdUzQD.js","/assets/KPICard-CJFfGr64.js","/assets/Kaizen-Dgxm8N2j.js","/assets/Kelish-Bu-jAZ25.js","/assets/KpiDeltaCard-Cdk64A2Y.js","/assets/LangTextInput-NfwaeUca.js","/assets/Layout-tiNzmzkv.js","/assets/LeaderAppeal-BEwKfQ1d.js","/assets/LeaderDayReport-Dcwb23eX.js","/assets/LeaderUnitReport-ozim51bW.js","/assets/Leaderboard-B0gFw2lt.js","/assets/Leaders-Dos22Arn.js","/assets/Lightbox-ChwXqyie.js","/assets/LiveOverview-fldmJhNs.js","/assets/Login-_q_s4r0W.js","/assets/NotFound-BXPLkImB.js","/assets/Notifications-CaUcV0qh.js","/assets/Overview-B9HLnVvo.js","/assets/Pagination-CCVxyzl-.js","/assets/PerenaladkaFactTable-DFUinqqL.js","/assets/PersonCard-CUvxat_S.js","/assets/PlanFulfillment-DLipcKeg.js","/assets/Production-CT33S1aj.js","/assets/Profile-B_o5BwW-.js","/assets/ProofCamera-t0KDzZR3.js","/assets/ProofPhoto-7--BFjoX.js","/assets/Quality-Cxfb7ZLu.js","/assets/RawRows-DpqJDLSy.js","/assets/RequestStateChip-BJASxZuG.js","/assets/RichTextEditor-KildlY9x.js","/assets/SaveState-t7ctXbSI.js","/assets/SearchInput-CE0rqUbi.js","/assets/SeasonalityHeatmap-Cii_tpdO.js","/assets/SegmentedToggle-gFJtLb06.js","/assets/SetupTimes-CW0XxT_L.js","/assets/ShiftDaily-P8vBTYkN.js","/assets/Staff-CY_ijkj_.js","/assets/StatusBadge-CsPSpAkv.js","/assets/TargetGoal-Dbus6wAS.js","/assets/Targets-A0FWVuKT.js","/assets/Tasks-DQLWoKfp.js","/assets/TimeWheelPicker-DDnqtfQU.js","/assets/Toast-Df_iq4J7.js","/assets/Tooltip-Dlofgxax.js","/assets/TrendChart-BieX_qZU.js","/assets/TripleSpeedometer-eD-ZpTsp.js","/assets/Trudoyomkost-b7QX7mMR.js","/assets/Turnover-CvfI2DtY.js","/assets/UploadDropzone-MEsVx0fa.js","/assets/UsersActivity-BD2tCkj_.js","/assets/VerdictBlock-RJiXM6dj.js","/assets/VfxApiMap-w-odIQAr.js","/assets/VfxDictionaries-BqzdeKQY.js","/assets/VfxEmployees-CdHrGH7A.js","/assets/VfxHrMoves-9P_mIQmf.js","/assets/VfxJobs-DMFGxNWT.js","/assets/VfxPhoto-C47pgZKz.js","/assets/VfxShifts-BcpiFAZa.js","/assets/VfxState-5OzCCgxS.js","/assets/VfxTimebooks-B6o6cGlL.js","/assets/VfxTimesheet-Bf5nQk00.js","/assets/WatchProgress-DypMkTPd.js","/assets/WebLogin-DbaQWPdT.js","/assets/WorkerConcerns-ClW5uvQQ.js","/assets/Workers-DGmfp4RB.js","/assets/Zagruzka-ItVxQLio.js","/assets/ZagruzkaCell-DB8Tatm_.js","/assets/api-B4J-sImb.js","/assets/archive-DLKtJQBs.js","/assets/archive-restore-y-tUHJsS.js","/assets/arrow-down-B_BByYTH.js","/assets/arrow-up-narrow-wide-BzOFP0or.js","/assets/award-bmWScirG.js","/assets/ban-Th8iNwla.js","/assets/boxes-CDB7U_lW.js","/assets/braces-BHaEnzfT.js","/assets/brigadirFilters-C5uVrhen.js","/assets/broadcastTree-C-wctLog.js","/assets/building-2-CWsNWSyL.js","/assets/calculator-B7WbyXZ8.js","/assets/calendar-days-BoqaDMhq.js","/assets/calendar-lIVduz_l.js","/assets/camera-CI7HeHw5.js","/assets/categories-CqsixYjD.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-doztexCx.js","/assets/chart-line-BlMDiEqM.js","/assets/chart-pie-CNv-KtIN.js","/assets/chartRange-aqne09zA.js","/assets/check-check-Cv3PaCzE.js","/assets/chevron-left-FROwJ7yK.js","/assets/chevrons-up-down-Dchac4iD.js","/assets/circle-alert-CE3ArgsC.js","/assets/circle-check-big-B2ibw2sc.js","/assets/circle-dashed-D60Bicpy.js","/assets/circle-minus-CeejwgHj.js","/assets/circle-question-mark-DhR7DlWq.js","/assets/circle-slash-DHF1ANkh.js","/assets/circle-user-round-3Ne2aTLe.js","/assets/circle-yQxr4cAc.js","/assets/clock-3-syrVheHw.js","/assets/cloud-off-DhdnJCWb.js","/assets/cloud-upload-DUWBGlhF.js","/assets/compass-yc0ZxHFK.js","/assets/concernCategories-DLnJqL0B.js","/assets/copy-CxqBQOh4.js","/assets/corner-down-right-CDpvl5tM.js","/assets/createLucideIcon-Dd8XBxCf.js","/assets/es-Zssm-vU9.js","/assets/external-link-RwVRaTr8.js","/assets/file-clock-DPbyjslg.js","/assets/file-exclamation-point-Cegd_tpU.js","/assets/flag-WIR3DKcz.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CUV3pMtY.js","/assets/hash-DafUMdVJ.js","/assets/hourglass-CvYmsuYd.js","/assets/image-Kr0Xwjuc.js","/assets/image-off-COtSPwpa.js","/assets/inbox-B6NxHHoy.js","/assets/index-Ck814gz0.css","/assets/index-EmEQXJdm.js","/assets/keyboard-QZf9Ztxb.js","/assets/languages-BnZcya2u.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DHhdc3O0.js","/assets/lightbulb-Cebgm6oK.js","/assets/link-2-Bn3Es3Bh.js","/assets/link-2-off-BbZeIYCD.js","/assets/list-ordered-D63sguSn.js","/assets/list-tree-D68tUenm.js","/assets/lock-open-WP7eV9sj.js","/assets/log-in-MDkOIAkG.js","/assets/minimize-2-2ryOyFSg.js","/assets/package-check-e2IrRJYB.js","/assets/pencil-DdGW8_nC.js","/assets/percent-icmEH19O.js","/assets/pin-Dn46PRZA.js","/assets/pin-off-B0LtcghG.js","/assets/play-DsJuFB0F.js","/assets/plug-zap-COUPXsnb.js","/assets/prop-types-FoI-FA__.js","/assets/radio-DWOopfIO.js","/assets/react-apexcharts.esm-CZR1lZQT.js","/assets/registers-QP5m2i4R.js","/assets/repeat-2vwluL0t.js","/assets/save-D5kef9s3.js","/assets/scopeLinks-T_d6jnVF.js","/assets/scroll-text-CRK9k2LS.js","/assets/search-x--2cBY6q1.js","/assets/segments-IR3RjIVJ.js","/assets/send-Dyh045Bv.js","/assets/settings-2-C36KBcQF.js","/assets/shield-9PEJgcEb.js","/assets/shield-alert-CrIJ68v1.js","/assets/shield-question-mark-BgSlYmUZ.js","/assets/siren-Bqjjfk4Q.js","/assets/snowflake-CZ7O5AFh.js","/assets/split-Ccyz7got.js","/assets/square-check-big-Bee9jn5e.js","/assets/star-CXG47CNe.js","/assets/statusBands-DKkJXKXK.js","/assets/store-BgGjVKLN.js","/assets/table-2-_3dmb1zy.js","/assets/table-properties-Bq5EJslV.js","/assets/tag-Cse_LnYN.js","/assets/timer-off-DWKt9Qwu.js","/assets/trending-down-DdIreiBx.js","/assets/trending-up-Bt8Ag4pB.js","/assets/undo-2-ZVdQ2EdV.js","/assets/useChartTheme-EUBqSwd-.js","/assets/useElementWidth-DhKN6OnG.js","/assets/useIsMobile-CZghrSmk.js","/assets/useOpenParam-DB7K_4XM.js","/assets/useStatusBands-CZM8qQpy.js","/assets/useUrlScope-BkILrq0v.js","/assets/user-cog-BkZhi1Cd.js","/assets/user-ebuWTjQu.js","/assets/users-Dzc3dIGo.js","/assets/vfx-BmELUgao.js","/assets/video-CqHhZ52V.js","/assets/wallet-DXVICtQe.js","/assets/warehouse-BinaGd4K.js","/assets/x-_OzJc4w2.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
