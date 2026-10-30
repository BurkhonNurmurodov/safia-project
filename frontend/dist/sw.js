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

const BUILD = "2026-10-30T07:19:16.417Z";
const PRECACHE = ["/","/assets/AdminPanel-BU1IYITb.js","/assets/AnalysisBoard-BNqD39zk.js","/assets/Arc-DiOMoNUq.js","/assets/Assistant-8qaPkrE6.js","/assets/BrigadirProfile-B6-swlM5.js","/assets/BroadcastReceivers-B-Nymr5N.js","/assets/BroadcastRecord-CoYUFEOb.js","/assets/Button-Cpfe4cwX.js","/assets/CatLockNotice-B_CTol6_.js","/assets/CategoryLegendModal-B5Cm_mvz.js","/assets/CellConcerns-B9TQQzF5.js","/assets/CellDetails--JsyZhvI.js","/assets/CellFormModal-p4adNm8t.js","/assets/CellIdent-BgXYzzNB.js","/assets/CellLink-CnqT9S8Y.js","/assets/Cells-C0U-Y0i5.js","/assets/ColumnFilter-CE7CpNrA.js","/assets/ColumnsPicker-BLIR83xL.js","/assets/CommentsModal-C8_lHb6U.js","/assets/ComparisonTable-DkvaBtHj.js","/assets/Concerns-ClhO5H-h.js","/assets/CountStepper-DrXqQ1c3.js","/assets/Daily-BBawh-D1.js","/assets/DataTable-BGtHVQM4.js","/assets/DateRangePicker-BCIKqMOE.js","/assets/DayReportView-D8_cfisK.js","/assets/DayStepper-DLWcjJJO.js","/assets/DayStrip-1TIxU5j1.js","/assets/DifferenceBreakdown-CLl9VYcE.js","/assets/Downtime-B33Ncgfj.js","/assets/Education-C_k2oOJU.js","/assets/EducationLesson-bB3_BnRZ.js","/assets/EmptyState-VKUwzhuM.js","/assets/Exam-DhkVZyQX.js","/assets/FactorySelect-R2E8YtkM.js","/assets/Gamification-C6HuBQeo.js","/assets/GroupBadge-fHxGzMlv.js","/assets/HeatmapChart-Dy86TfYp.js","/assets/IdleCell-DMqXFu9V.js","/assets/KPICard-vCZmwUNE.js","/assets/Kaizen-iaqIfavF.js","/assets/Kelish-BSsnwp7V.js","/assets/KpiDeltaCard-BfxM63Qw.js","/assets/LangTextInput-5eAeXiVf.js","/assets/Layout-DOlxjE6F.js","/assets/LeaderAppeal-Dw_v_yQZ.js","/assets/LeaderDayReport-BI-lJvkv.js","/assets/LeaderUnitReport-DvYbflOh.js","/assets/Leaderboard-CIVt2Rpy.js","/assets/Leaders-C4yCqLMw.js","/assets/LeadersKpi-BaW2GUPl.js","/assets/Lightbox-BNZ7KvJa.js","/assets/LiveOverview-DTdwd6B5.js","/assets/Login-C9HrkuCG.js","/assets/NotFound-vdpc0CfK.js","/assets/Notifications-TxVFM98x.js","/assets/Ontime-BJ9dC46g.js","/assets/Overview-DPTI7BLe.js","/assets/Pagination-D6hMYxe7.js","/assets/PerenaladkaFactTable-DAKzWYex.js","/assets/PersonCard-C6azOJ0E.js","/assets/PlanFulfillment-CzyGDNO5.js","/assets/Production-C0gzX7BH.js","/assets/Profile-C_i6Gyq0.js","/assets/ProofCamera-DzsSBPH0.js","/assets/ProofPhoto-DnqU_AiG.js","/assets/Quality-By69W3FF.js","/assets/RawRows-cPcJJcRu.js","/assets/Reports-CdiudnOO.js","/assets/RequestStateChip-Ca47iwDn.js","/assets/RichTextEditor-D9wWOQGu.js","/assets/SaveState-Lq4_joMs.js","/assets/SearchInput-BCAC3wsn.js","/assets/SeasonalityHeatmap-DaS4iKyE.js","/assets/SegmentedToggle-2VxbDhTW.js","/assets/SetupTimes-sVhixOSx.js","/assets/ShiftDaily-DDbDW2aY.js","/assets/Staff-B1oqLMVO.js","/assets/StaffListAtCheck-Cw4kRH3o.js","/assets/StatusBadge-DkrYgLmV.js","/assets/StatusBandsModal-BZXFASsW.js","/assets/TargetGoal-DnKgh7nf.js","/assets/Targets-BPG2gZts.js","/assets/Tasks-DlQ1dFvU.js","/assets/TimeWheelPicker-_JYs3I-4.js","/assets/Toast-Cp_iHcD8.js","/assets/Tooltip-CwFutwvo.js","/assets/TrendChart-eOk4Ulun.js","/assets/TripleSpeedometer-DtfXkQ1F.js","/assets/Trudoyomkost-BUPk9snA.js","/assets/UploadDropzone-C3izqzFm.js","/assets/UsersActivity-CrpYLef4.js","/assets/VerdictBlock-eEUVIDBp.js","/assets/VfxApiMap-DLfA9W7q.js","/assets/VfxDictionaries-DwcIL8NG.js","/assets/VfxEmployees-DRo1r-BR.js","/assets/VfxHrMoves-BVtIxud8.js","/assets/VfxJobs-DdM6N-LO.js","/assets/VfxPhoto-C0P8XHdm.js","/assets/VfxShifts-BVXmYEJ5.js","/assets/VfxState-C_EMCVOx.js","/assets/VfxTimebooks-C493-QkM.js","/assets/VfxTimesheet-B5qFfxlD.js","/assets/WatchProgress-BYAs1FaW.js","/assets/WebLogin-qpsr2a1-.js","/assets/Workers-D9I8-HHf.js","/assets/Zagruzka-Gq-WVycN.js","/assets/ZagruzkaCell-GOsSbrPE.js","/assets/api-BFm7MSgf.js","/assets/archive-restore-D74rmdLL.js","/assets/archive-sOiXF23v.js","/assets/arrow-down-JtK82Xte.js","/assets/arrow-down-right-BVZwUETZ.js","/assets/arrow-down-wide-narrow-BP1i_gSC.js","/assets/arrow-up-narrow-wide-CoOLUk3N.js","/assets/ban-BmsCrXPo.js","/assets/boxes-CCBWsAXt.js","/assets/braces-BHvQk33k.js","/assets/brigadirFilters-BQH-x9g4.js","/assets/broadcastTree-Broz8Jyy.js","/assets/building-2-UnN566uG.js","/assets/calendar-B5d1NAfV.js","/assets/calendar-days-ClbVxV_z.js","/assets/camera-SLswgZKd.js","/assets/categories-DZ_OR6uH.js","/assets/cellMoveRefusal-C35lV8mw.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DL1OqKUV.js","/assets/chart-line-C1DiX7l6.js","/assets/chart-pie-CRTQQh6f.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-OHwbJFPF.js","/assets/chevron-left-Dnv14PQm.js","/assets/chevrons-up-down-ciaezI5x.js","/assets/circle-BUuhQe64.js","/assets/circle-alert-DJeRMYEk.js","/assets/circle-check-big-Bb8V0peF.js","/assets/circle-dashed-B7sN32cx.js","/assets/circle-minus-B_Oiz4jw.js","/assets/circle-question-mark-DZrywCq2.js","/assets/circle-slash-UkKt2J8o.js","/assets/circle-user-round-Bh0YGB2t.js","/assets/cloud-off-fT4GKiqJ.js","/assets/cloud-upload-DWv962cC.js","/assets/coins-ClUIGnBq.js","/assets/compass-jrZ7MJ4f.js","/assets/concernCategories-BUAl7C9l.js","/assets/corner-down-right-BMBMBLIo.js","/assets/createLucideIcon-BAWwt_D-.js","/assets/en-QoTtYzbk.js","/assets/es-Dtgc5NM1.js","/assets/external-link-oUklyEU8.js","/assets/file-clock-BaDSQpLU.js","/assets/file-exclamation-point-DI-akqKU.js","/assets/flag-DhHgxbQY.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-iS-W5IFP.js","/assets/funnel-CQlKHD78.js","/assets/hash-D879mSAb.js","/assets/hourglass-xZ4m1fTx.js","/assets/idleTime-CHPnJRpw.js","/assets/image-B8g9HQNf.js","/assets/image-off-KIV33tiU.js","/assets/inbox-DIkD3NBs.js","/assets/index-BtYmuUYW.css","/assets/index-YT77baBl.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-je5pZ69i.js","/assets/languages-Cw5Dqw8h.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-PE4TAfdg.js","/assets/leaderBoard-YJz2WKkc.js","/assets/lightbulb-CwVwP1lc.js","/assets/link-2-S0zuNgcP.js","/assets/link-2-off-C0rTFDQE.js","/assets/list-ordered-Cd9p0ILb.js","/assets/list-tree-BcZ9iPKe.js","/assets/lock-open-qhd8__0I.js","/assets/log-in-DDinVWDj.js","/assets/map-pin-Vg5Yfh2x.js","/assets/marks-BbHB7RpR.js","/assets/minimize-2-BiuGPZH3.js","/assets/package-CQ4VmAix.js","/assets/package-check-CrkIJeV9.js","/assets/pencil-DKpmnTzw.js","/assets/percent-CIMRlFkO.js","/assets/pin-KBuZwXwh.js","/assets/pin-off-C_YTKBbm.js","/assets/play-letT_aed.js","/assets/plug-zap-DMEUC80P.js","/assets/prop-types-RD3fbola.js","/assets/radio-C1M2Mxgx.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-DYtgThYY.js","/assets/repeat-Bq7jjqC0.js","/assets/ru-1AbZZ_uQ.js","/assets/save-DFF9uBWD.js","/assets/scopeLinks-BgrFaMzg.js","/assets/scroll-text-BIganKg9.js","/assets/search-x-B6nZoiB0.js","/assets/segments-D5Uiedtv.js","/assets/send-CmLyyQWM.js","/assets/settings-2-BX-s2yQN.js","/assets/shield-alert-BHMlcz3A.js","/assets/shield-question-mark-B_85Id6R.js","/assets/shield-wALyLMNC.js","/assets/sigma-1tP9_Iis.js","/assets/siren-ixShlC3Z.js","/assets/snowflake-DpAZNQrZ.js","/assets/split-D6ERyPpm.js","/assets/square-check-big-VqvO_1X7.js","/assets/star-BJOdECOg.js","/assets/statusBands-DVBZcBq3.js","/assets/store-HmEocT10.js","/assets/table-2-BpLs_m3l.js","/assets/table-properties-C_hrpYHS.js","/assets/tag-CmMmRzV7.js","/assets/timer-off-D7sgWqjB.js","/assets/translations-BLb2LDwD.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-BTk0gnRG.js","/assets/trending-up-I_m19CIM.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-BtFktXB1.js","/assets/useChartTheme-CwMSo7XD.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-BN3TCnDO.js","/assets/useStatusBands-BfJNHIOf.js","/assets/useUrlScope-B1uKejxZ.js","/assets/user-BkAyVWws.js","/assets/user-cog-XZ8KA_y9.js","/assets/user-minus-BGAWE4iV.js","/assets/users-CcaZQze-.js","/assets/uz-5VKuN68s.js","/assets/uz_cyrl-CzFA3N88.js","/assets/vfx-D0RVPk_x.js","/assets/video-DIGOWYfO.js","/assets/wallet-aCapuVFj.js","/assets/warehouse-CwGtzWfI.js","/assets/workflow-CTG3FPdc.js","/assets/x-B-ehaWxs.js","/assets/zap--zpWM8nf.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
