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

const BUILD = "2026-10-08T07:44:04.569Z";
const PRECACHE = ["/","/assets/AdminPanel-Djw4jV-U.js","/assets/AnalysisBoard-CTvDzhHg.js","/assets/Arc-NDpnBeTw.js","/assets/Assistant-DQPoYbNc.js","/assets/BrigadirProfile-B_CXIxi3.js","/assets/BroadcastReceivers-xZdJpd7z.js","/assets/BroadcastRecord-uTQB1T4C.js","/assets/Button-Cm2RIgjc.js","/assets/CatLockNotice-CPyyET8Z.js","/assets/CategoryLegendModal-CUF5a--Q.js","/assets/CellConcerns-ospcWUq5.js","/assets/CellDetails-CvhOk9Y7.js","/assets/CellFormModal-CAECkkQO.js","/assets/CellIdent-CSemUllk.js","/assets/CellLink-DGsh77qY.js","/assets/Cells-GoIbH_88.js","/assets/ColumnFilter-BmVR8RLA.js","/assets/ColumnsPicker-CB2vFbJU.js","/assets/CommentsModal-BqcFb9qg.js","/assets/ComparisonTable-CKJfhHEq.js","/assets/Concerns-7X4aq6jd.js","/assets/Daily-DBDj0Rnw.js","/assets/DataTable-CTqE0RH6.js","/assets/DateRangePicker-BtWe79_i.js","/assets/DayReportView-CfD6As7U.js","/assets/DayStepper-e-lqWiSt.js","/assets/DifferenceBreakdown-Da959Tx3.js","/assets/Downtime-2Y5Ghi2s.js","/assets/Education-DvrlGgHu.js","/assets/EducationLesson-CoWnzXr0.js","/assets/EmptyState-CQ3lrDSG.js","/assets/Exam-gPF47P29.js","/assets/FactorySelect-BYLBj0yx.js","/assets/Gamification-Yr3v_e1y.js","/assets/GroupBadge-b_iSb1DV.js","/assets/HeatmapChart-DrfJdBHZ.js","/assets/IdleCell-BwfD1IV6.js","/assets/KPICard-BPOM9fY2.js","/assets/Kaizen-BNy886UL.js","/assets/Kelish-CRVzN2x2.js","/assets/KpiDeltaCard-BJNJ0Abk.js","/assets/LangTextInput-mdob1H5n.js","/assets/Layout-UETvArBL.js","/assets/LeaderAppeal-DezpuK3W.js","/assets/LeaderDayReport-CtOL_X2h.js","/assets/LeaderUnitReport-sbJPcUAv.js","/assets/Leaderboard-DhtQ7mOi.js","/assets/Leaders-C-Tjpfir.js","/assets/Lightbox-F1Tcn2O2.js","/assets/LiveOverview-axcDrLC2.js","/assets/Login-DZ4BN3MK.js","/assets/NotFound-DzULJf0U.js","/assets/Notifications-B8Br6-Yk.js","/assets/Overview-WNdR_eVU.js","/assets/Pagination-Fe_-UIZ2.js","/assets/PerenaladkaFactTable-CVL2hYGl.js","/assets/PersonCard-CS4lgkAl.js","/assets/PlanFulfillment-VzOHIAhd.js","/assets/Production-DuYuHRgT.js","/assets/Profile-CzyO8gIw.js","/assets/ProofCamera-D_VW3xrQ.js","/assets/ProofPhoto-Cwu9tIbd.js","/assets/Quality-CT__qeIe.js","/assets/RawRows-C9aRmDKz.js","/assets/RequestStateChip-C1XiZ9YH.js","/assets/RichTextEditor-BrEdZx31.js","/assets/SaveState-C9mZq884.js","/assets/SearchInput-CFX2fKLE.js","/assets/SeasonalityHeatmap-CjIXqJBh.js","/assets/SegmentedToggle-CJGy7p75.js","/assets/SetupTimes-CbJwAZcP.js","/assets/ShiftDaily-DRqhM4VS.js","/assets/Staff-CdY2EnOb.js","/assets/StatusBadge-BANaDVgR.js","/assets/TargetGoal-CGd_tsuV.js","/assets/Targets-Cw8sC7km.js","/assets/Tasks-COd-_HVA.js","/assets/TimeWheelPicker-CIEDwUJM.js","/assets/Toast-BC-75Qdw.js","/assets/Tooltip-C2Jw1gxz.js","/assets/TrendChart-BizN4PYw.js","/assets/TripleSpeedometer-9OQ5xhyo.js","/assets/Trudoyomkost-Cre5yvUt.js","/assets/Turnover-DhoTW9ls.js","/assets/UploadDropzone-BXfhaK1X.js","/assets/UsersActivity-Bh2VEwln.js","/assets/VerdictBlock-DEgk7Wce.js","/assets/VfxApiMap-CWGiA91h.js","/assets/VfxDictionaries-DEQCnj6o.js","/assets/VfxEmployees-CzqBC6nv.js","/assets/VfxHrMoves-BiaiSjZR.js","/assets/VfxJobs-IcBUVJQY.js","/assets/VfxPhoto-Dd0WUnnX.js","/assets/VfxShifts-z4yBE-LC.js","/assets/VfxState-BUAOMqEM.js","/assets/VfxTimebooks-XlwR9Wl2.js","/assets/VfxTimesheet-v7qfjQLP.js","/assets/WatchProgress-CuZWgFOA.js","/assets/WebLogin-CZZ-aj1g.js","/assets/WorkerConcerns-CvCnVe0J.js","/assets/Workers-BhX4LOuC.js","/assets/Zagruzka-B9oHBH4R.js","/assets/ZagruzkaCell-WhPi2ZFf.js","/assets/api-BzuCslu9.js","/assets/archive-BTrnpPpK.js","/assets/archive-restore-CjeNbPv9.js","/assets/arrow-down-7miFyW3a.js","/assets/arrow-up-narrow-wide-CEjOr6gH.js","/assets/award-BIGyNsHp.js","/assets/ban-CKDT0bvo.js","/assets/boxes-B4DJ51xt.js","/assets/braces-DKfjQIEQ.js","/assets/brigadirFilters-Bq7uwPkQ.js","/assets/broadcastTree-DfzWamET.js","/assets/building-2-Cf2_EtOs.js","/assets/calculator-CY6n45FS.js","/assets/calendar-_CpwEk_I.js","/assets/calendar-days-NVO7ENnY.js","/assets/camera-C_e1Pxsa.js","/assets/categories-BDzzeV1Y.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BM4KffS2.js","/assets/chart-line-CcblOiCa.js","/assets/chart-pie-JGnSa__i.js","/assets/chartRange-DYYL4xV6.js","/assets/check-check-lHSsnlLn.js","/assets/chevron-left-BnmBu6FW.js","/assets/chevrons-up-down-S18U66UU.js","/assets/circle-DdlG07hV.js","/assets/circle-alert-Bley3Yvv.js","/assets/circle-check-big-Chkwlfg3.js","/assets/circle-dashed-C-63HiCi.js","/assets/circle-minus-Bv28vtb4.js","/assets/circle-question-mark-DGouNnhR.js","/assets/circle-slash-BDkEYaJ0.js","/assets/circle-user-round-DDmWBYKN.js","/assets/clock-3-CH32Dowd.js","/assets/cloud-off-CbcNv1-7.js","/assets/cloud-upload-CGT7iusF.js","/assets/compass-CpBTRkYH.js","/assets/concernCategories-C6qho3vB.js","/assets/copy-GxONgT2O.js","/assets/corner-down-right-De8Oe-ur.js","/assets/createLucideIcon-BSl1MmxO.js","/assets/es-DeiMoUhn.js","/assets/external-link-BE4XXPQ6.js","/assets/file-clock-Bkrpi4Xk.js","/assets/file-exclamation-point-CDWA5nIr.js","/assets/flag-Bj5vc-Dp.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BGXWxIxU.js","/assets/hash-z8Wwg8_b.js","/assets/hourglass-NrWSKM0v.js","/assets/image-DLZ2fL-c.js","/assets/image-off-BoqTFPNH.js","/assets/inbox-BWNxbO7W.js","/assets/index-Ck814gz0.css","/assets/index-D6eia58J.js","/assets/keyboard-D_15ELlG.js","/assets/languages-Dv84cOt4.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BZNqlvTg.js","/assets/lightbulb-Bj5yqaUu.js","/assets/link-2-DJuEJXOj.js","/assets/link-2-off-DfS-26mt.js","/assets/list-ordered-BaGA2SvL.js","/assets/list-tree-DHvixCfm.js","/assets/lock-open-C1abZ2wm.js","/assets/log-in-C9L-YqzP.js","/assets/minimize-2-9PGhVj6w.js","/assets/package-check-4ctrsiJw.js","/assets/pencil-BywFoZ5d.js","/assets/percent-Bf__lzIY.js","/assets/pin-DY5CIL3F.js","/assets/pin-off-Q4KO6mQ7.js","/assets/play-DG0-P-M2.js","/assets/plug-zap-C1af-Xwb.js","/assets/prop-types-C43F6R3R.js","/assets/radio-CCAL8-Hn.js","/assets/react-apexcharts.esm-CZWI5l3C.js","/assets/registers-soPwpSR0.js","/assets/repeat-CeVWpLTa.js","/assets/save-7yKxeS1c.js","/assets/scopeLinks-DVPFc8Ve.js","/assets/scroll-text-lMKkLP2t.js","/assets/search-x-D1gbZxCw.js","/assets/segments-D4Vm4QqP.js","/assets/send-tSmqqysi.js","/assets/settings-2-DkFw_8S8.js","/assets/shield-D3AZO_nd.js","/assets/shield-alert-BlCUXAKG.js","/assets/shield-question-mark-CRNCOJV3.js","/assets/siren-BRbFbzJy.js","/assets/snowflake-CdGSMoZv.js","/assets/split-BMRj1RjN.js","/assets/square-check-big-DnEJ3sYN.js","/assets/star-CP479wiK.js","/assets/statusBands-BNc9U0rO.js","/assets/store-LKBHR09j.js","/assets/table-2-CJ98KtnH.js","/assets/table-properties-DMHh6D9q.js","/assets/tag-c-OPw986.js","/assets/timer-off-DqH1NZuV.js","/assets/trending-down-DhLgzJ23.js","/assets/trending-up-Cb2d7W_C.js","/assets/undo-2-BvG7ETVP.js","/assets/useChartTheme-BftPFEif.js","/assets/useElementWidth-jLRxfgKo.js","/assets/useIsMobile-B42qSmwk.js","/assets/useOpenParam-DqVxPbNC.js","/assets/useStatusBands-AILwTP0f.js","/assets/useUrlScope-Bgzkrjay.js","/assets/user-Aa7NxhlN.js","/assets/user-cog-EaPrKfvQ.js","/assets/users-DKurp3zL.js","/assets/vfx-DXwiQU37.js","/assets/video-DbXGMWIE.js","/assets/wallet-B8dpZRSg.js","/assets/warehouse-CopOSh6G.js","/assets/x-DrzJmHwl.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
