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

const BUILD = "2026-10-02T05:41:03.180Z";
const PRECACHE = ["/","/assets/AdminPanel-hc1Pb6lF.js","/assets/AnalysisBoard-DDcQ7Pr1.js","/assets/Arc-k9kAeYBA.js","/assets/ArcLegacy-B2mmy8At.js","/assets/BrigadirProfile-DUAwq1fD.js","/assets/BroadcastReceivers-DB3y4Glm.js","/assets/BroadcastRecord-DnSUezFF.js","/assets/CatLockNotice-BvlZ8sLa.js","/assets/CategoryLegendModal-BVSj0Fu4.js","/assets/CellConcerns-ECQdGPs9.js","/assets/CellDetails-CRohoZ0Q.js","/assets/CellFormModal-0hGkDBAd.js","/assets/CellIdent-CrsH0zLA.js","/assets/CellLink-2xW30k1z.js","/assets/Cells-CWKSaL8n.js","/assets/ColumnFilter-_0pK1xY7.js","/assets/ColumnsPicker-DkVX-53P.js","/assets/CommentsModal-D5ezVO_x.js","/assets/ComparisonTable-Dp7wLYXt.js","/assets/Concerns-bSFII1e9.js","/assets/ConfirmDialog-D5FKg3A0.js","/assets/Daily-CivCPxV_.js","/assets/DataTable-CXq7BnlO.js","/assets/DateRangePicker-nc2Tl03L.js","/assets/DayReportView-DF3q1wUA.js","/assets/DayStepper-81ssC3KS.js","/assets/DifferenceBreakdown-DmTDG2kv.js","/assets/Downtime-BdQFnh5q.js","/assets/Education-wtCLsDO5.js","/assets/EducationLesson-BuunnbUG.js","/assets/EmptyState-WSqF1gMi.js","/assets/Exam-D6YkeWA6.js","/assets/FactorySelect-DhiklyuH.js","/assets/Gamification-BMRt40wV.js","/assets/GroupBadge-rZ3YXFxm.js","/assets/HeatmapChart-DS1bwvW9.js","/assets/IdleCell-9LebTNC5.js","/assets/KPICard-BJJtc3jz.js","/assets/Kaizen-CD_yR0yz.js","/assets/Kelish-HoOr5muD.js","/assets/KpiDeltaCard-Ckbjubca.js","/assets/LangTextInput-Bsyh8Apf.js","/assets/Layout-Co0Nb6Tx.js","/assets/LeaderAppeal-BPeg8jId.js","/assets/LeaderDayReport-CNBRKgJb.js","/assets/LeaderUnitReport-CEJkmHAw.js","/assets/Leaderboard-BvNpcjSR.js","/assets/Leaders-CXIPnGe7.js","/assets/Lightbox-D9m51pz9.js","/assets/LiveOverview-D43OnAJK.js","/assets/Login-C-uyCzMh.js","/assets/NotFound-CJgyPjLX.js","/assets/Notifications-CSy5g6LG.js","/assets/Overview-YYC2X9-U.js","/assets/Pagination-CGgX_g8r.js","/assets/PerenaladkaFactTable-DSimZ_21.js","/assets/PlanFulfillment-CuCed1al.js","/assets/Production-Cpn7v8yd.js","/assets/Profile-Kafh9nbc.js","/assets/ProofCamera-BlKtmy0J.js","/assets/ProofPhoto-kkMoYGAI.js","/assets/Quality-4Eib23mk.js","/assets/RequestStateChip-s7KBkOeI.js","/assets/RichTextEditor-b15_xndD.js","/assets/SaveState-CavI94qA.js","/assets/SearchInput-DD1kPtS2.js","/assets/SeasonalityHeatmap-CXil2hm2.js","/assets/SegmentedToggle-BL2UzT-A.js","/assets/SetupTimes-B1WSgS6Y.js","/assets/ShiftDaily-CqxvG7Hk.js","/assets/Staff-CKQ18Jbd.js","/assets/StaffLive-ChPigW0K.js","/assets/StatusBadge-DKNujFN-.js","/assets/TargetGoal-YZbGAl4L.js","/assets/Targets-CtVaSEP0.js","/assets/Tasks-SPZjFplJ.js","/assets/TimeWheelPicker-DKy1TjXe.js","/assets/Toast-CfpeUy1D.js","/assets/Tooltip-lFAk-JcF.js","/assets/TrendChart-CR8rOPx8.js","/assets/TripleSpeedometer-GvAwOGMu.js","/assets/Trudoyomkost-r7wkbeqJ.js","/assets/UploadDropzone-BcwGHfr4.js","/assets/UsersActivity-DnYahUmj.js","/assets/VerdictBlock-DrCD9A3P.js","/assets/WatchProgress--_hIPPFw.js","/assets/WebLogin-BlR7Bnxg.js","/assets/WorkerConcerns-v-duSAcc.js","/assets/Workers-BkamM3su.js","/assets/Zagruzka-CDEhhUnz.js","/assets/ZagruzkaCell-BfWJi9tX.js","/assets/api-BMmO6B2w.js","/assets/archive-OiCIDfa-.js","/assets/archive-restore-DI5tOcjT.js","/assets/arrow-down-CzjxULvy.js","/assets/arrow-left-DXiXP6hj.js","/assets/arrow-right-left-TjUa6WAN.js","/assets/arrow-up-B81ZiACI.js","/assets/arrow-up-narrow-wide-C4HJKwLI.js","/assets/arrow-up-right-D-ssDZAN.js","/assets/award-B1MtCp3u.js","/assets/ban-BEvr4Qij.js","/assets/bot-CEtxhrWt.js","/assets/boxes-D8nE500f.js","/assets/brigadirFilters-DjXOLgzG.js","/assets/broadcastTree-DUhsh9LD.js","/assets/building-2-D8MbPHxI.js","/assets/calendar-days-BbQ66gFq.js","/assets/calendar-range-HXokScy4.js","/assets/calendar-xCs9e2Ge.js","/assets/camera-CkBEmvS7.js","/assets/categories-ufT3cCax.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-6MPYo6R1.js","/assets/chart-line-DPcKK2kV.js","/assets/chart-pie-yK-h_Lye.js","/assets/chartRange-2bbjrEXi.js","/assets/chevron-left-C6hJIAU5.js","/assets/chevrons-up-down-DY83xso9.js","/assets/circle-D9o4woum.js","/assets/circle-alert-HxokgZXE.js","/assets/circle-check-big-CS1-wn4a.js","/assets/circle-minus-rjNXwaqT.js","/assets/circle-slash-BiFyrQyd.js","/assets/circle-user-round-DRrB7ox4.js","/assets/cloud-off-XujuK5XD.js","/assets/cloud-upload-DyKzsaQA.js","/assets/compass-D0N0uP4U.js","/assets/concernCategories-BTJUbsU_.js","/assets/copy-DX_Z8aj7.js","/assets/corner-down-right-CrxoJDlR.js","/assets/createLucideIcon-Da2TZwkZ.js","/assets/es-CAFOs9P_.js","/assets/exportXlsx-DNR0i3ee.js","/assets/external-link-9CmkYzay.js","/assets/file-clock-CYfC3uve.js","/assets/file-exclamation-point-CfZEJH7c.js","/assets/file-spreadsheet-DHN4ynOO.js","/assets/file-text-CLxjY741.js","/assets/flag-BtJuVVhf.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CX2WtXRa.js","/assets/hash-C9fFi1XM.js","/assets/history-FkcTEw2-.js","/assets/hourglass-BvwsDPh-.js","/assets/id-card-CS801LdQ.js","/assets/image-CLoWzq8v.js","/assets/image-off-BNEIIs4f.js","/assets/inbox-Di-Dt73e.js","/assets/index-B4v8YXuI.js","/assets/index-CBQ-7RpV.css","/assets/key-round-B87X2t1I.js","/assets/keyboard-C6ohxai4.js","/assets/languages-Cgim01dq.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-C7tJdO_Y.js","/assets/lightbulb-CtEXqtNj.js","/assets/link-2-B12g7RCL.js","/assets/link-2-off-CLC2EK6-.js","/assets/list-ordered-QLcRXE7c.js","/assets/list-tree-BEeTQso2.js","/assets/lock-open-C0sCHE20.js","/assets/log-in-0FcID9sk.js","/assets/maximize-2-Pya4iK7U.js","/assets/message-square-Cbzfz06t.js","/assets/minimize-2-DunQKUX4.js","/assets/package-check-QMutLT1t.js","/assets/paperclip-CXroBCKT.js","/assets/pencil-CLIarfhe.js","/assets/percent-HkcLk1Tk.js","/assets/pin-nCwWHSzq.js","/assets/pin-off-BqWGrSpG.js","/assets/play-D3p7KCxW.js","/assets/plug-zap-BAhYVpem.js","/assets/presentation-D8WjxdQb.js","/assets/prop-types-NA-kYUZ_.js","/assets/radio-T88aFYKW.js","/assets/react-apexcharts.esm-BO_E9-N-.js","/assets/repeat-BpJqIbsI.js","/assets/rotate-ccw-CUU2F1XZ.js","/assets/rotate-cw-CGtMCzxq.js","/assets/save-G1_9OnZe.js","/assets/scopeLinks-UPoBeBXG.js","/assets/scroll-text-BqIYIvxs.js","/assets/search-x-CsP7_49O.js","/assets/segments-CKVZyRV0.js","/assets/send-EKeiBr0t.js","/assets/settings-2-BsLYyI48.js","/assets/shield-alert-DBSfx2z9.js","/assets/shield-check-B-QCEOH1.js","/assets/shield-nok4N1RR.js","/assets/shield-question-mark-BXxQW4lI.js","/assets/siren-BLIoHNvj.js","/assets/snowflake-Cxiw9ivC.js","/assets/split-B1hqj6eq.js","/assets/square-CRoJwxEy.js","/assets/square-check-big-CjVqxMxj.js","/assets/star-DnaB_xSW.js","/assets/statusBands-BR-oEEPZ.js","/assets/store-BsW3XyQL.js","/assets/table-2-CGI7Jfey.js","/assets/table-properties-CNiPzFO1.js","/assets/tag-B-ZR3Azo.js","/assets/timer-off-BNWl4T7E.js","/assets/trending-down-CAriNvPk.js","/assets/trending-up-Bri1-ukl.js","/assets/undo-2-BxEdqtCl.js","/assets/useChartTheme-BeFS3YYR.js","/assets/useElementWidth-YJbIF86L.js","/assets/useIsMobile-Cs4LJtaN.js","/assets/useOpenParam-rjm6DK81.js","/assets/useStatusBands-CjJdYqEu.js","/assets/useUrlScope-mRUGAnQh.js","/assets/user-D9nghjMC.js","/assets/user-cog-CxeE_5ol.js","/assets/user-minus-BbGQ3NxH.js","/assets/users-BFHQK38Z.js","/assets/video-Ch6EIK-O.js","/assets/wallet-DsNwsHyx.js","/assets/warehouse-Ch-T2iR7.js","/assets/x-DTreiOCB.js","/assets/zap-hbXg_GNY.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
