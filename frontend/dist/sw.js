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

const BUILD = "2026-10-20T05:08:06.113Z";
const PRECACHE = ["/","/assets/AdminPanel-CoNh91ye.js","/assets/AnalysisBoard-5rRehBKC.js","/assets/Arc-D5bZWW-X.js","/assets/Assistant-DBYp0cLO.js","/assets/BrigadirProfile-BVnB09Qr.js","/assets/BroadcastReceivers-BJQTHuKm.js","/assets/BroadcastRecord-ugx1wcfK.js","/assets/Button-XwHr0oRN.js","/assets/CatLockNotice-DTrMS6kU.js","/assets/CategoryLegendModal-CTDXiW0H.js","/assets/CellConcerns-DZL-uXpk.js","/assets/CellDetails-gqXYcF-Z.js","/assets/CellFormModal-CXfKHedz.js","/assets/CellIdent-GLnQy7pu.js","/assets/CellLink-D7Gbk_6n.js","/assets/Cells-DotwliXP.js","/assets/ColumnFilter-DPiMUzy4.js","/assets/ColumnsPicker-B1zB_gtF.js","/assets/CommentsModal-Bde2vtea.js","/assets/ComparisonTable-C975AVJ9.js","/assets/Concerns-Bkbv_43C.js","/assets/CountStepper-FvG7DRZu.js","/assets/Daily-DNHydDhS.js","/assets/DataTable-Bi3Fm7Pk.js","/assets/DateRangePicker-Gd12NK3E.js","/assets/DayReportView-BY52iAdV.js","/assets/DayStepper-DaMS_e6O.js","/assets/DifferenceBreakdown-BX0fcNYJ.js","/assets/Downtime-a_hcFLIK.js","/assets/Education-y8q4zbl0.js","/assets/EducationLesson-COZrXqlG.js","/assets/EmptyState-N05ZVH39.js","/assets/Exam-sgaOsQEt.js","/assets/FactorySelect-VJBGu4Iy.js","/assets/Gamification-DwgRV06O.js","/assets/GroupBadge-DoBjjAKJ.js","/assets/HeatmapChart-DEMElxzV.js","/assets/IdleCell-Bf5jbkNz.js","/assets/KPICard-BRGcc0ie.js","/assets/Kaizen-DbHWTiyl.js","/assets/Kelish-D6PufIYn.js","/assets/KpiDeltaCard-CFUiT9qz.js","/assets/LangTextInput-CH9O5g49.js","/assets/Layout-OSFbIiJK.js","/assets/LeaderAppeal-d58S4AE-.js","/assets/LeaderDayReport-MkS00VhM.js","/assets/LeaderUnitReport-CP45px5f.js","/assets/Leaderboard-CHsOtgka.js","/assets/Leaders-DYRXDV8O.js","/assets/LeadersKpi-mMT-PmU4.js","/assets/Lightbox-Cn-63V1X.js","/assets/LiveOverview-BCLLarCP.js","/assets/Login-CAO_x7a5.js","/assets/NotFound-GqY0AUUi.js","/assets/Notifications-CIlTeo5w.js","/assets/Overview-CkSetxha.js","/assets/Pagination-DPCtA1-W.js","/assets/PerenaladkaFactTable-61NTHRn2.js","/assets/PersonCard-DqzeCurG.js","/assets/PlanFulfillment-Cbus4UWg.js","/assets/Production-CDxaL9fU.js","/assets/Profile-D0k2KBFh.js","/assets/ProofCamera-Bg3gpekd.js","/assets/ProofPhoto-DZw3hriZ.js","/assets/Quality-Bh7UecL0.js","/assets/RawRows-CxhEBKZ7.js","/assets/RequestStateChip-DaQMXCbH.js","/assets/RichTextEditor-BiyItYl-.js","/assets/SaveState-B9D8scGZ.js","/assets/SearchInput-DppptXpj.js","/assets/SeasonalityHeatmap-YCQJO68T.js","/assets/SegmentedToggle-Bf3r1uc_.js","/assets/SetupTimes-DWXJh08z.js","/assets/ShiftDaily-CbAKDuMq.js","/assets/Staff-BZoRMjbw.js","/assets/StaffListAtCheck-clXDDaOm.js","/assets/StatusBadge-BoGEsSCt.js","/assets/TargetGoal-CMn6bwoT.js","/assets/Targets-J0sArZ97.js","/assets/Tasks-CADjaN5g.js","/assets/TimeWheelPicker-BQFGfAn6.js","/assets/Toast-CeMXTUxs.js","/assets/Tooltip-D3rdeXYH.js","/assets/TrendChart-FU32zEa6.js","/assets/TripleSpeedometer-CpDdZimv.js","/assets/Trudoyomkost-Dlm2kjAA.js","/assets/UploadDropzone-DH1hRiFX.js","/assets/UsersActivity-Ct4-0xlM.js","/assets/VerdictBlock-B3G_Vurm.js","/assets/VfxApiMap-DSdjIMXf.js","/assets/VfxDictionaries-BEohplKT.js","/assets/VfxEmployees-CQ1mX35e.js","/assets/VfxHrMoves-DUaJUJ7p.js","/assets/VfxJobs-CgRIT-a4.js","/assets/VfxPhoto-CLTgMAGP.js","/assets/VfxShifts-BeRg_o8p.js","/assets/VfxState-Bjm81Zzo.js","/assets/VfxTimebooks-Dw28CB4I.js","/assets/VfxTimesheet-BBB2IiHv.js","/assets/WatchProgress-D1z1o4uK.js","/assets/WebLogin-B52S1nVd.js","/assets/Workers-BKZuy5_Y.js","/assets/Zagruzka-BIO2FiQh.js","/assets/ZagruzkaCell-qi59x-ji.js","/assets/api-DKbdKky8.js","/assets/archive-B6OEcrQS.js","/assets/archive-restore-D--zEmAj.js","/assets/arrow-down-BA8X6tGI.js","/assets/arrow-down-right-yp-wbNYt.js","/assets/arrow-down-wide-narrow-B5xG5k_R.js","/assets/arrow-up-narrow-wide-Cae-0K58.js","/assets/ban-BUeZPyaG.js","/assets/boxes-CzLOCh7N.js","/assets/braces-DrPHKVmm.js","/assets/brigadirFilters-BibdM6FR.js","/assets/broadcastTree-Clcoj2MQ.js","/assets/building-2-6oRG5yrA.js","/assets/calendar-Dl4nH3G2.js","/assets/calendar-days-CCZbuXAy.js","/assets/camera-CdPmz6ZP.js","/assets/categories-B6C2bnjH.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BvQmsLfa.js","/assets/chart-line-m4kKicej.js","/assets/chart-pie-C8qeU_rh.js","/assets/chartRange-D0saf11t.js","/assets/check-check-BTzgr1AQ.js","/assets/chevron-left-BFJuxYsU.js","/assets/chevrons-up-down-DjcbAM4a.js","/assets/circle-B9y66kzJ.js","/assets/circle-alert-B3P7_2kE.js","/assets/circle-check-big-C7NOS-pV.js","/assets/circle-dashed-Dkv5wjZF.js","/assets/circle-minus-D_k3bfgB.js","/assets/circle-question-mark-D9DsWOjU.js","/assets/circle-slash-gYbvjSua.js","/assets/circle-user-round-CdYsEHFd.js","/assets/cloud-off-Dj-jzxPu.js","/assets/cloud-upload-BdS_9AqH.js","/assets/compass-CMvTPPtG.js","/assets/concernCategories-Bl4i1OSC.js","/assets/corner-down-right-C9woqtxZ.js","/assets/createLucideIcon-DPeqCrFq.js","/assets/es-dx179Dt0.js","/assets/external-link-I-EEBS-9.js","/assets/file-clock-D6I0MoFn.js","/assets/file-exclamation-point-B0islFjQ.js","/assets/flag-D3uuyNsF.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-LkWjLa_0.js","/assets/funnel-DCz1MmXX.js","/assets/hash-DceBo1Yi.js","/assets/hourglass-CeD4Vxhi.js","/assets/image-CG0x3NlM.js","/assets/image-off-Cx8f4B1c.js","/assets/inbox-D4ayAu9N.js","/assets/index-DemTQruw.css","/assets/index-rBVXzr88.js","/assets/keyboard-xiN1CGHy.js","/assets/languages-D2Sa33gY.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CFuCOzbs.js","/assets/lightbulb-oxTK8KZ8.js","/assets/link-2-Bwl16HH1.js","/assets/link-2-off-do_pIcya.js","/assets/list-ordered-DEDN_kzI.js","/assets/list-tree-Bn44fG5K.js","/assets/lock-open-q5El2PmJ.js","/assets/log-in-BtC2P89V.js","/assets/marks-NZlaM-Ik.js","/assets/minimize-2-0x8mpigh.js","/assets/package-check-COVgtu0F.js","/assets/pencil-wVf9R6mL.js","/assets/percent-BDYrEEFI.js","/assets/pin-B3hwE_cn.js","/assets/pin-off-Doe9YLbs.js","/assets/play-BXkUIeoo.js","/assets/plug-zap-DEiwXhF8.js","/assets/prop-types-Bpr8dWaF.js","/assets/radio-BXN_V-NP.js","/assets/react-apexcharts.esm-BVplnE0U.js","/assets/registers-WhhWNJ1s.js","/assets/repeat-CRrARdLg.js","/assets/save-t0KyDy1T.js","/assets/scopeLinks-CXXtkPak.js","/assets/scroll-text-C6CCCAFi.js","/assets/search-x-EnPD1J8e.js","/assets/segments-BPzZ4rg7.js","/assets/send-CWBgKEHi.js","/assets/settings-2-CyKvlcUr.js","/assets/shield-FR7V0cvp.js","/assets/shield-alert-BBSAwGr1.js","/assets/shield-question-mark-C5gbeoLx.js","/assets/siren-CRqZfKSB.js","/assets/snowflake-CsWgQWoR.js","/assets/split-C_rme58K.js","/assets/square-check-big-BERVC5W9.js","/assets/star-CMKrpyb0.js","/assets/statusBands-BhEFoTz0.js","/assets/store-9n-ErF4l.js","/assets/table-2-Dm6B9LdB.js","/assets/table-properties-Bb0f624z.js","/assets/tag-DH9-h-Uy.js","/assets/timer-off-DUjgw6gN.js","/assets/trending-down-Cgej_t32.js","/assets/trending-up-XwHbErGm.js","/assets/undo-2-CqBJoJ81.js","/assets/useChartTheme-C17FJCX8.js","/assets/useElementWidth-FlGCjJDl.js","/assets/useIsMobile-BAmWltS4.js","/assets/useOpenParam-CFezy4hN.js","/assets/useStatusBands-BHBXFxXd.js","/assets/useUrlScope-DosYZ005.js","/assets/user-C_w5V864.js","/assets/user-cog-yUJAwY-s.js","/assets/user-minus-BKeAyOR_.js","/assets/users-PUrCMZlO.js","/assets/vfx-Cciz5XbW.js","/assets/video-B-1ZotDe.js","/assets/wallet-CXx9h2_k.js","/assets/warehouse-CAAOgjDF.js","/assets/workflow-CCHbcTVj.js","/assets/x-Bt3fWMBd.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
