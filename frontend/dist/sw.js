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

const BUILD = "2026-10-07T04:27:54.121Z";
const PRECACHE = ["/","/assets/AdminPanel-BvEBRAZl.js","/assets/AnalysisBoard-C9p_e5P0.js","/assets/Arc-CXw8aQCY.js","/assets/Assistant-BlQTWLnl.js","/assets/BrigadirProfile-D5xjYhSz.js","/assets/BroadcastReceivers-BT1LtEnp.js","/assets/BroadcastRecord-DxWxz5gh.js","/assets/Button-Lz4lVE2C.js","/assets/CatLockNotice-BQV41HnX.js","/assets/CategoryLegendModal-D5OJ9c7I.js","/assets/CellConcerns-CAv3nr2A.js","/assets/CellDetails-Bj6-7sOT.js","/assets/CellFormModal-BnX-GlvG.js","/assets/CellIdent-CdLdbwnQ.js","/assets/CellLink-BxR8busf.js","/assets/Cells-Bsg3nDLX.js","/assets/ColumnFilter-Cyqay0BO.js","/assets/ColumnsPicker-BrFGnXiH.js","/assets/CommentsModal-DJSmlfSg.js","/assets/ComparisonTable-JBZY35P3.js","/assets/Concerns-9Z6UTCzH.js","/assets/Daily-CElYpj_g.js","/assets/DataTable-ChBx1_bL.js","/assets/DateRangePicker-BY0F15N4.js","/assets/DayReportView-B98zESdk.js","/assets/DayStepper-BUexILjD.js","/assets/DifferenceBreakdown-B4O4juDk.js","/assets/Downtime-CH8OrU3W.js","/assets/Education-Bpzbr8S6.js","/assets/EducationLesson-BR5n9IZ-.js","/assets/EmptyState-CJQBNSQg.js","/assets/Exam-BStIP2hg.js","/assets/FactorySelect-CVk9yFV9.js","/assets/Gamification-DYNnRUnC.js","/assets/GroupBadge-H8Rafzyp.js","/assets/HeatmapChart-DZv6dE_h.js","/assets/IdleCell-Crdpkpzb.js","/assets/KPICard-tYEwCBb8.js","/assets/Kaizen-CSp3iqaJ.js","/assets/Kelish-DbzQSxd3.js","/assets/KpiDeltaCard-DeSYBwLk.js","/assets/LangTextInput-DpM3zB2Z.js","/assets/Layout-rxzmBIue.js","/assets/LeaderAppeal-_kITLWPB.js","/assets/LeaderDayReport-C9Kt7uN7.js","/assets/LeaderUnitReport-Dq_7jY8f.js","/assets/Leaderboard-4mvz46XC.js","/assets/Leaders-DJA2oxz2.js","/assets/Lightbox-PqrUby0n.js","/assets/LiveOverview-BZR9ZZKy.js","/assets/Login-4vG2JccD.js","/assets/NotFound-Bl3S_Bl1.js","/assets/Notifications-DTXaYNwS.js","/assets/Overview-CgLXRXeY.js","/assets/Pagination-xu2-SJxy.js","/assets/PerenaladkaFactTable-CG1pasLm.js","/assets/PersonCard-BIfEQ5As.js","/assets/PlanFulfillment-BUz1xHkS.js","/assets/Production-BZCvKmMc.js","/assets/Profile-gfQS1r4j.js","/assets/ProofCamera-DtA0PG0H.js","/assets/ProofPhoto-CgGdP1W8.js","/assets/Quality-TZeBrU6P.js","/assets/RawRows-DD2ZEbxA.js","/assets/RequestStateChip-CiVwRKTf.js","/assets/RichTextEditor-DTxdaOpF.js","/assets/SaveState-DuJTozrz.js","/assets/SearchInput-CaOusqdg.js","/assets/SeasonalityHeatmap-BXYpeV9F.js","/assets/SegmentedToggle-DZpqbLS8.js","/assets/SetupTimes-BaSL5J1Q.js","/assets/ShiftDaily-CHvf3wUy.js","/assets/Staff-BtdRq8gn.js","/assets/StatusBadge-BkmAe2CK.js","/assets/TargetGoal-Cd5385ey.js","/assets/Targets-BEP6DXJr.js","/assets/Tasks-DIVPpgUI.js","/assets/TimeWheelPicker-DYP8_61_.js","/assets/Toast-Dqjlzirp.js","/assets/Tooltip-3o2FE0y4.js","/assets/TrendChart-CeBhdvLX.js","/assets/TripleSpeedometer-Dbw8bwqN.js","/assets/Trudoyomkost-P0hVq86c.js","/assets/Turnover-BigsPj0-.js","/assets/UploadDropzone-BlWZg0mR.js","/assets/UsersActivity-A5AjeOco.js","/assets/VerdictBlock-D1y5hImB.js","/assets/VfxApiMap-ClhU9c0B.js","/assets/VfxDictionaries-CVxDqRyQ.js","/assets/VfxEmployees-CLBAH26P.js","/assets/VfxHrMoves-DAanvD9N.js","/assets/VfxJobs-DNL73-vn.js","/assets/VfxPhoto-CRIvQT0J.js","/assets/VfxShifts-yJF-o_E3.js","/assets/VfxState-yJ7-H2TB.js","/assets/VfxTimebooks-BHlJDIkF.js","/assets/VfxTimesheet-CImi2NiS.js","/assets/WatchProgress-Co9aXbqd.js","/assets/WebLogin-JfAZ2cmC.js","/assets/WorkerConcerns-DOzuRKq_.js","/assets/Workers-9wbViHHv.js","/assets/Zagruzka-B7LW2kp_.js","/assets/ZagruzkaCell-BNlHM7lH.js","/assets/api-CDN5UxfY.js","/assets/archive-62YHiJpj.js","/assets/archive-restore-CIeQIdEr.js","/assets/arrow-down-BONN9n74.js","/assets/arrow-up-narrow-wide--CbNqKLv.js","/assets/award-DRNZCnEo.js","/assets/ban-Bej_szXx.js","/assets/boxes-C0nM_d_Z.js","/assets/braces-CbPiuS2V.js","/assets/brigadirFilters-DDEP-QJ2.js","/assets/broadcastTree--HBVpjF7.js","/assets/building-2-8Lt6EdGS.js","/assets/calculator-bjdihIWo.js","/assets/calendar-D9AZ1eb_.js","/assets/calendar-days-BszXKsWR.js","/assets/camera-C48YEwMv.js","/assets/categories-DcgknL-3.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-J4D4kbdk.js","/assets/chart-line-CscNUjrQ.js","/assets/chart-pie-BdjOZuGn.js","/assets/chartRange-BJWdDh1o.js","/assets/check-check-BfEwQQ0x.js","/assets/chevron-left-DhwiDcJz.js","/assets/chevrons-up-down-CO9zuuiZ.js","/assets/circle-alert-Djb7cG6_.js","/assets/circle-check-big-GhyIR0rw.js","/assets/circle-dashed-2bnnosUB.js","/assets/circle-minus-B-Azlm0B.js","/assets/circle-ofJXjDuo.js","/assets/circle-question-mark-CtfyUw3_.js","/assets/circle-slash-CF7FGMwh.js","/assets/circle-user-round-DwSZZz9i.js","/assets/clock-3-g_dtb09B.js","/assets/cloud-off-BfK9QKAK.js","/assets/cloud-upload-B03PNGSJ.js","/assets/compass-BWltFyLJ.js","/assets/concernCategories-CndS7mPJ.js","/assets/copy-BIEzzAt-.js","/assets/corner-down-right-Bq2Jo4Qz.js","/assets/createLucideIcon-CsE9GIxC.js","/assets/es-BGUjFeMV.js","/assets/external-link-BuQAHHji.js","/assets/file-clock-5MH-_ODr.js","/assets/file-exclamation-point-BORAMFB6.js","/assets/flag-COi1LN7S.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CrD3BYuT.js","/assets/hash-CqJ06Fhv.js","/assets/hourglass-BRkL16qO.js","/assets/image-BDpskRK6.js","/assets/image-off-Ds4N82EL.js","/assets/inbox-DnZitOLR.js","/assets/index-CGLLIoaT.js","/assets/index-ujSOZk1J.css","/assets/keyboard--fcxU4Af.js","/assets/languages-BgeeSMuf.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-C9y75CXh.js","/assets/lightbulb-QiNXnIiY.js","/assets/link-2-CJsxbLh_.js","/assets/link-2-off-B_1D75ze.js","/assets/list-ordered-BdXIwocO.js","/assets/list-tree-CwR0cHJB.js","/assets/lock-open-BvuXIiDL.js","/assets/log-in-DN8lcxGC.js","/assets/minimize-2-D3iDKJLS.js","/assets/package-check-V0xvEQVL.js","/assets/pencil-BguMSiDj.js","/assets/percent-jJs_IkQ2.js","/assets/pin-CW7LAw9B.js","/assets/pin-off-CFqfU-qd.js","/assets/play-q3Vw9dCn.js","/assets/plug-zap-nFIpWQET.js","/assets/prop-types-KFEXZ9O1.js","/assets/radio-DGVDYGXu.js","/assets/react-apexcharts.esm-B3Xu-5Qw.js","/assets/registers-4q4Usu0i.js","/assets/repeat-8DvBJtNJ.js","/assets/save-G0nvPOmZ.js","/assets/scopeLinks-Q_AB2sPp.js","/assets/scroll-text-C_Ltboww.js","/assets/search-x-ByCGnYU4.js","/assets/segments-DQYcbEU8.js","/assets/send-9UaW_lvG.js","/assets/settings-2-DtW5WmFo.js","/assets/shield-DgmeoO6A.js","/assets/shield-alert-DUlnz5bx.js","/assets/shield-question-mark-DJ6pExT_.js","/assets/siren-DgADrFsx.js","/assets/snowflake-BPN6o6X-.js","/assets/split-BADo21FC.js","/assets/square-check-big-CVGvsEIB.js","/assets/star-RWDx46QA.js","/assets/statusBands-Dpasr60-.js","/assets/store-feqqJTNZ.js","/assets/table-2-D9ZeK210.js","/assets/table-properties-DKkk1ee3.js","/assets/tag-pWYZEbj9.js","/assets/timer-off-DOb8dt-S.js","/assets/trending-down-Ht-VHdab.js","/assets/trending-up-Dct_diGP.js","/assets/undo-2-DSy3m8yG.js","/assets/useChartTheme-DcNYHHCk.js","/assets/useElementWidth-BpBPcD66.js","/assets/useIsMobile-BH8m55if.js","/assets/useOpenParam-DY7DnHgR.js","/assets/useStatusBands-7Begro66.js","/assets/useUrlScope-C8JgUl51.js","/assets/user-Ej6is8ui.js","/assets/user-cog-iCX5xack.js","/assets/users-B5FZogQy.js","/assets/vfx-GXpRgY5m.js","/assets/video-CpQzeRl9.js","/assets/wallet-BvAXoxTP.js","/assets/warehouse-QeCyA7fB.js","/assets/x-CehXgaJ2.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
