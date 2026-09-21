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

const BUILD = "2026-09-21T05:59:22.742Z";
const PRECACHE = ["/","/assets/AdminPanel-3hIhzAfP.js","/assets/AnalysisBoard-CnqyFsRc.js","/assets/Arc-DEH5UaxN.js","/assets/AttendanceModal-D0wwpz3U.js","/assets/BrigadirProfile-tL8KcQtX.js","/assets/BroadcastReceivers-zgi9eXkU.js","/assets/BroadcastRecord-BrOaeKUR.js","/assets/CatLockNotice-CFnvLuQo.js","/assets/CategoryLegendModal-B5pKRAcM.js","/assets/CellConcerns-Bf5KV6rx.js","/assets/CellDetails-DR_MK2Fw.js","/assets/CellFormModal-BZBqG3ah.js","/assets/CellLink-Bv4GJpvE.js","/assets/Cells-CoTwJZPq.js","/assets/ColumnFilter-CmpMfcup.js","/assets/ColumnsPicker-nlLYmOGz.js","/assets/CommentsModal-UXYc3r4G.js","/assets/ComparisonTable-Ddoy3A0I.js","/assets/Concerns-B5BNIV4y.js","/assets/ConfirmDialog-DF68rWOx.js","/assets/Daily-D2oDQvWE.js","/assets/DataTable-BMo23Yn9.js","/assets/DateRangePicker-C4Mo68t8.js","/assets/DayReportView-Cgkq9Jvf.js","/assets/DayStepper-Bc5_BLqD.js","/assets/DifferenceBreakdown-B2RqNktb.js","/assets/Downtime-DLA3dqzJ.js","/assets/Education-EbHj6Cvl.js","/assets/EducationLesson-DbA-4vga.js","/assets/EmptyState-yt_mmsLR.js","/assets/FactorySelect-DlWCuBFi.js","/assets/FormField-C6OwAoiG.js","/assets/Gamification-Y1VDB_-t.js","/assets/GroupBadge-Dsh3IsKj.js","/assets/HeatmapChart-LaSVeG6F.js","/assets/IdleCell-BCbvZhU6.js","/assets/KPICard-CFqWYVUW.js","/assets/Kaizen-CmV3N3GI.js","/assets/KpiDeltaCard-gbiQHkrl.js","/assets/LangTextInput-jAkzBzG2.js","/assets/Layout-zPDvlToR.js","/assets/LeaderDayReport-DX-1CV0X.js","/assets/LeaderUnitReport-BmJgm3lj.js","/assets/Leaderboard-W3goVGE3.js","/assets/Leaders-BF-LuZrN.js","/assets/LiveOverview-BKRzoCYN.js","/assets/Login-CidJbAml.js","/assets/NotFound-Br_EcX_e.js","/assets/Overview-C3OEOUT8.js","/assets/Pagination-BKtkG2Kj.js","/assets/PerenaladkaFactTable-mokhJJRH.js","/assets/PlanFulfillment-C8bYpy9P.js","/assets/Production-D5Bs9dgH.js","/assets/Profile-DDPVi3Bw.js","/assets/ProofCamera-DeXpRy30.js","/assets/Quality-BRup-28i.js","/assets/RichTextEditor-BeD7V_Jt.js","/assets/SearchInput-D1thro-x.js","/assets/SeasonalityHeatmap-CYbUIULJ.js","/assets/SegmentedToggle-DOWqBaYI.js","/assets/SetupTimes-Dmtlh6IY.js","/assets/ShiftDaily-DiNb1Bj1.js","/assets/Skeleton-BYJtoQLz.js","/assets/Staff-Boq6m0B2.js","/assets/StatusBadge-CLBKcfWH.js","/assets/StyledSelect-DRpnsPxY.js","/assets/Targets-BXOCKGZY.js","/assets/Tasks-CzwvOhUB.js","/assets/TimeField-D9YnNHXy.js","/assets/TimeWheelPicker-HtXHCkxW.js","/assets/Toast-CoekXZxA.js","/assets/Tooltip-BEIr7GEQ.js","/assets/TrendChart-DGe4ENek.js","/assets/TripleSpeedometer-DhKAs7fr.js","/assets/Trudoyomkost-3_u-WxPg.js","/assets/UsersActivity-DswcawS8.js","/assets/WatchProgress-BP4Op9dL.js","/assets/WebLogin-CudMrqqV.js","/assets/WorkerConcerns-NmI9fYiT.js","/assets/Workers-WZbUVXD_.js","/assets/Zagruzka-C9u-M_DV.js","/assets/ZagruzkaCell-DqGIZHk2.js","/assets/alarm-clock-D2pTpslL.js","/assets/api-FaglqSMz.js","/assets/archive-DSeToo68.js","/assets/archive-restore-tXkKADx2.js","/assets/arrow-down-LZY9b4dz.js","/assets/arrow-left-BOfAIOrT.js","/assets/arrow-left-right-NNsDspwj.js","/assets/arrow-right-TlO7C2_7.js","/assets/arrow-up-BhOoLM3V.js","/assets/arrow-up-right-J2NuU-j_.js","/assets/award-mdgjdzi_.js","/assets/ban-CHRSRSA4.js","/assets/bot-CYFaVg62.js","/assets/boxes-Bd9VQCCC.js","/assets/brigadirFilters-BuuBwHdX.js","/assets/broadcastTree-sC-Ttu66.js","/assets/building-2-C-CE7J00.js","/assets/calendar-C1dH4Is7.js","/assets/calendar-clock-o3Sh3_tl.js","/assets/calendar-days-CzzCuenI.js","/assets/calendar-range-BGOy6ci2.js","/assets/camera-Cm3fQ3qA.js","/assets/categories-BPhnWU5d.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Cgotwwnb.js","/assets/chart-line-DhFeAE_1.js","/assets/chart-pie-CJjVn89P.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-D-stfTfA.js","/assets/check-3CkMQfpK.js","/assets/check-check-D6p3wGhA.js","/assets/chevron-left-BGk47f-p.js","/assets/chevrons-up-down-CpnvgXoN.js","/assets/circle-dashed-BUggTUyC.js","/assets/circle-dot-DTnvfOfu.js","/assets/circle-minus-DPssyQFi.js","/assets/circle-slash-CPaMFXCz.js","/assets/circle-user-round-CytQubVI.js","/assets/coins-DpHyMeB_.js","/assets/compass-DzwVkpvW.js","/assets/concernCategories-BXLB_cJE.js","/assets/copy-BIGv-AIS.js","/assets/corner-down-right-DIdqeaqh.js","/assets/createLucideIcon-BHxFBHIH.js","/assets/exportXlsx-ClYj2m25.js","/assets/external-link-eJmCS2sF.js","/assets/file-clock-CU2eZIL3.js","/assets/file-spreadsheet-Ippr8xwB.js","/assets/file-text-55PerkWP.js","/assets/flag-Btc6XFOl.js","/assets/flame-ChQQMDbO.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BNvXZEuK.js","/assets/funnel-GOF8DAi3.js","/assets/hash-C2GrLVQ2.js","/assets/history-CrBwLwjf.js","/assets/hourglass-Bxj-BSUT.js","/assets/image-BGFJz2zy.js","/assets/image-off-BUIAsUmq.js","/assets/index-BXqTV2jf.css","/assets/index-DTSD4sWi.js","/assets/keyboard-Fp78yjK0.js","/assets/languages-BsvNvqd-.js","/assets/layers-C-ViJEzR.js","/assets/leaderReason-Bv67XXA0.js","/assets/lightbulb-BXmljX45.js","/assets/link-2-HV5tDe4W.js","/assets/list-checks-Beq_799s.js","/assets/list-ordered-C-V7gtCC.js","/assets/lock-open-BPuHvMcd.js","/assets/log-in-C8ZRHLBl.js","/assets/message-square-BHxpDQzh.js","/assets/minimize-2-CiEJ3Zz-.js","/assets/minus-BfI_mAlJ.js","/assets/paperclip-BRbmBDka.js","/assets/pencil-DGMhtnIn.js","/assets/pencil-line-BDfbpNKt.js","/assets/personName-B4KId4zS.js","/assets/pin-DPnVLk_8.js","/assets/play-CGlBoJYF.js","/assets/prop-types-5Bj7uhmj.js","/assets/radio-BKg6W2To.js","/assets/react-apexcharts.esm-DUwBI7jg.js","/assets/refresh-cw-BnxesVMQ.js","/assets/repeat-BXAITWFo.js","/assets/rotate-ccw-CyMK6SoA.js","/assets/rotate-cw-DdADapyO.js","/assets/save-DQjFl2vG.js","/assets/scale-BWzdJ_vX.js","/assets/scroll-text-7HJ_-hqT.js","/assets/search-x-BHFv4XmH.js","/assets/segments-DzX5zpvF.js","/assets/send-BqjBGQ-F.js","/assets/settings-2-C0aHi6dt.js","/assets/shield-CsfysORh.js","/assets/shield-alert-Be1QjWQN.js","/assets/shield-check-bM7a_Ygv.js","/assets/shield-question-mark-DuOKFrJo.js","/assets/siren-qXNypRMl.js","/assets/smartphone-CJEMoJSv.js","/assets/snowflake-VNxrFRvm.js","/assets/square-Dri41f7w.js","/assets/square-check-big-BDFzh4Um.js","/assets/star-DakxbNAm.js","/assets/statusBands-UhGAQZvZ.js","/assets/table-2-k0sHSJPj.js","/assets/tag-MWzjUHdG.js","/assets/trash-2-BztBUKmG.js","/assets/trending-down-sWe3JEoi.js","/assets/trending-up-zECQ2rhC.js","/assets/undo-2-DZ2TrTHh.js","/assets/useChartTheme-CR8fMOFy.js","/assets/useElementWidth-CzNmsio0.js","/assets/useIsMobile-Cpz3yTAC.js","/assets/useMutation-Dcc_CNyU.js","/assets/useStatusBands-C-2EBVTb.js","/assets/user-check-DgO9PnaH.js","/assets/user-cog-avtIzBU_.js","/assets/user-minus-CabVfDI2.js","/assets/users-Dh6-ydUf.js","/assets/verifyState-CsTrpfaI.js","/assets/video-Bi5npxdj.js","/assets/warehouse-sHg_uGZQ.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
