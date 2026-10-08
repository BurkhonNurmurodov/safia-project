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

const BUILD = "2026-10-08T09:29:16.289Z";
const PRECACHE = ["/","/assets/AdminPanel-BIzUNRhu.js","/assets/AnalysisBoard-BQavqxdz.js","/assets/Arc-BzDO7DLG.js","/assets/Assistant-Dda6rQau.js","/assets/BrigadirProfile-D6R86k59.js","/assets/BroadcastReceivers-vdjp1E6-.js","/assets/BroadcastRecord-Dv2oQa9E.js","/assets/Button-BaBmIR02.js","/assets/CatLockNotice-CnIfvBHW.js","/assets/CategoryLegendModal-CbzC27XV.js","/assets/CellConcerns-BS4E0atG.js","/assets/CellDetails-BMdAA3mt.js","/assets/CellFormModal-8RGZyLVN.js","/assets/CellIdent-C9tLNKUu.js","/assets/CellLink-DjV6Y4ef.js","/assets/Cells-BS5gBDq-.js","/assets/ColumnFilter-BH6ZXFNT.js","/assets/ColumnsPicker-Mq3Po6C_.js","/assets/CommentsModal-pJ3SsOPo.js","/assets/ComparisonTable-CToKxXjh.js","/assets/Concerns-4G_q55qA.js","/assets/Daily-DmxzYEN1.js","/assets/DataTable-oSM0Dj9G.js","/assets/DateRangePicker-CFOxe_yi.js","/assets/DayReportView-BRH4BHk8.js","/assets/DayStepper-OIyvzhmi.js","/assets/DifferenceBreakdown-BXYDXbTi.js","/assets/Downtime-BvvmUoGP.js","/assets/Education-B02u4thZ.js","/assets/EducationLesson-DrfnePjQ.js","/assets/EmptyState-DVji781S.js","/assets/Exam-CU6kSybs.js","/assets/FactorySelect-BaUWHRr1.js","/assets/Gamification-DeglgimH.js","/assets/GroupBadge-DWYuL5QS.js","/assets/HeatmapChart-n7B7QPFA.js","/assets/IdleCell-CiwB5oRU.js","/assets/KPICard-LktnpcJL.js","/assets/Kaizen-B53Y8fh_.js","/assets/Kelish-CH1T-FNp.js","/assets/KpiDeltaCard-BP7cV8BS.js","/assets/LangTextInput-Qv5zDPwR.js","/assets/Layout-CroXB-5O.js","/assets/LeaderAppeal-10JmR85g.js","/assets/LeaderDayReport-DNLdISf8.js","/assets/LeaderUnitReport-CkTddFHF.js","/assets/Leaderboard-97RNyTdz.js","/assets/Leaders-QShOCd9c.js","/assets/Lightbox-VaXuv7KX.js","/assets/LiveOverview-DQCWZxlC.js","/assets/Login-B0dbiQkv.js","/assets/NotFound-BQEbWvWW.js","/assets/Notifications--7M5LcPX.js","/assets/Overview-khPE21zI.js","/assets/Pagination-C4G1Vfn3.js","/assets/PerenaladkaFactTable-C7RzGYn3.js","/assets/PersonCard-D27zn3S0.js","/assets/PlanFulfillment-C3V1gK6U.js","/assets/Production-7YNyPwRZ.js","/assets/Profile-B9KVshZj.js","/assets/ProofCamera-D-1XiguR.js","/assets/ProofPhoto-DPXKLlOv.js","/assets/Quality-D416kMyi.js","/assets/RawRows-C4lzbZ8u.js","/assets/RequestStateChip-u2YvmRj7.js","/assets/RichTextEditor-CZY5X4lS.js","/assets/SaveState-BV6_tXJy.js","/assets/SearchInput-mp_bTy6b.js","/assets/SeasonalityHeatmap-CNG3_svh.js","/assets/SegmentedToggle-Dr3qKlwT.js","/assets/SetupTimes-CA2mg2Uv.js","/assets/ShiftDaily-DpoxPh-J.js","/assets/Staff-pTznUuhx.js","/assets/StatusBadge-MCcYx5_x.js","/assets/TargetGoal-BJ_5dMef.js","/assets/Targets-CtLY1-id.js","/assets/Tasks-BLZyt26k.js","/assets/TimeWheelPicker-D8MZB4ye.js","/assets/Toast-DZvM6laH.js","/assets/Tooltip-CGsiLge6.js","/assets/TrendChart-Cpwgcsvd.js","/assets/TripleSpeedometer-BONu5O4n.js","/assets/Trudoyomkost-CsbnuTaT.js","/assets/Turnover-Comyorxn.js","/assets/UploadDropzone-1EwnF7yS.js","/assets/UsersActivity-DfeoqzzH.js","/assets/VerdictBlock-DlA5SwSC.js","/assets/VfxApiMap-BvSQiEeT.js","/assets/VfxDictionaries-Bbl6rx8U.js","/assets/VfxEmployees-mbid-uc8.js","/assets/VfxHrMoves-BXe6ROh9.js","/assets/VfxJobs-CMiv4tpV.js","/assets/VfxPhoto-DKI9pnb8.js","/assets/VfxShifts-1Kvkc4hb.js","/assets/VfxState-CCftjdy2.js","/assets/VfxTimebooks-Dys0AB39.js","/assets/VfxTimesheet-BbiLDlbB.js","/assets/WatchProgress-ENyD5LPt.js","/assets/WebLogin-DfWQhD2B.js","/assets/WorkerConcerns-Cpkg8XRK.js","/assets/Workers-BCWJ9H4x.js","/assets/Zagruzka-uU3g7dY2.js","/assets/ZagruzkaCell-C_BIBTpA.js","/assets/api-DNFWBlkI.js","/assets/archive-BUeuXrZO.js","/assets/archive-restore-BEgDNWlG.js","/assets/arrow-down-BUUppOz2.js","/assets/arrow-down-wide-narrow-Bgf4oDVM.js","/assets/arrow-up-narrow-wide-BSNxarAT.js","/assets/award-oIhrHW7A.js","/assets/ban-KPkjCFVk.js","/assets/boxes-DJRiNk4y.js","/assets/braces-CR3Tw1_P.js","/assets/brigadirFilters-BGFNt1Ok.js","/assets/broadcastTree-BquDKIZB.js","/assets/building-2-C6ilvhau.js","/assets/calculator-DIJ6lsf3.js","/assets/calendar-DCW3rlrm.js","/assets/calendar-days-D0FrUrdv.js","/assets/camera-BrDe2psT.js","/assets/categories-8v6pW0zQ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C1HlvYa9.js","/assets/chart-line-B_Yz-Km_.js","/assets/chart-pie--vq-UvzW.js","/assets/chartRange-K3WkXSZ3.js","/assets/check-check-B5ZP23tZ.js","/assets/chevron-left-0b64hF3y.js","/assets/chevrons-up-down-Dnz8OAqs.js","/assets/circle-Dq9YkGoA.js","/assets/circle-alert-CjsjHTer.js","/assets/circle-check-big-B_k8Gizi.js","/assets/circle-dashed-C3AmG9R_.js","/assets/circle-minus-7cDozVtY.js","/assets/circle-question-mark-BJ87Sv7G.js","/assets/circle-slash-CMyVCqTK.js","/assets/circle-user-round-BDDR8cwy.js","/assets/clock-3-CFG7yhN6.js","/assets/cloud-off-RE5lI8xs.js","/assets/cloud-upload-DUX8Snkh.js","/assets/compass-C_gTQpBM.js","/assets/concernCategories-36vm9Dpu.js","/assets/copy-Dvht62lo.js","/assets/corner-down-right-BK7GUITq.js","/assets/createLucideIcon-BzS7tvei.js","/assets/es-DBfjQh5r.js","/assets/external-link-DxB1bAXw.js","/assets/file-clock-ByT4AncC.js","/assets/file-exclamation-point-LNdQ7t98.js","/assets/flag-BdmysPBh.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-N6v5h4W-.js","/assets/hash-DmG0ojqo.js","/assets/hourglass-z086zZNI.js","/assets/image-Cmv4r2aH.js","/assets/image-off-LKGVkptU.js","/assets/inbox-xeKHLfM-.js","/assets/index-DFfGVOG_.css","/assets/index-DmcluT8o.js","/assets/keyboard-Bx_ub2oS.js","/assets/languages-Cl89pIPk.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-JQR8pqn2.js","/assets/lightbulb-DlUFn8KP.js","/assets/link-2-Bo-kcoTw.js","/assets/link-2-off-B9EBSRlv.js","/assets/list-ordered-C9tWyeQG.js","/assets/list-tree-DynWhysv.js","/assets/lock-open-CkMbfpsL.js","/assets/log-in-CxgHOL_9.js","/assets/minimize-2-BlQG5JdM.js","/assets/package-check-PoScNn8D.js","/assets/pencil-zjRWYbxS.js","/assets/percent-7H_7gVmL.js","/assets/pin-BCER4JQf.js","/assets/pin-off-DbsJyTsC.js","/assets/play-WEW3EsFd.js","/assets/plug-zap-BA7535zU.js","/assets/prop-types-KD4qqwed.js","/assets/radio-9w3jIowy.js","/assets/react-apexcharts.esm-Ezs8ZMCs.js","/assets/registers-BV_M5iky.js","/assets/repeat-7EphUgnG.js","/assets/save-DXuaNaNl.js","/assets/scopeLinks-qxkkqxCE.js","/assets/scroll-text-Bk1OE40_.js","/assets/search-x-CWD3UK3e.js","/assets/segments-CGIIssz1.js","/assets/send-CD9QVnAR.js","/assets/settings-2-DiNqKKXR.js","/assets/shield-CuOLEU7u.js","/assets/shield-alert-DX3onSAs.js","/assets/shield-question-mark-vfLKZb_h.js","/assets/siren-nRyhPeYz.js","/assets/snowflake-CFbaRCdg.js","/assets/split-D7XbrQkW.js","/assets/square-check-big-7aLc2QjB.js","/assets/star-D3WhNy7-.js","/assets/statusBands-BfP2mAKV.js","/assets/store-C7YA1VJh.js","/assets/table-2-BGPTESkw.js","/assets/table-properties-Bshev5FP.js","/assets/tag-PeHiAURB.js","/assets/timer-off-CrSmRZzE.js","/assets/trending-down-Cj863Bcd.js","/assets/trending-up-r-ClUfFo.js","/assets/undo-2-CQpmfGB5.js","/assets/useChartTheme-CjQ2DPU7.js","/assets/useElementWidth-DMmn8DVL.js","/assets/useIsMobile-BAnVIhUB.js","/assets/useOpenParam-Bgj4okgv.js","/assets/useStatusBands-CHoFLzAT.js","/assets/useUrlScope-CTvl2R0X.js","/assets/user-BgFqMAnw.js","/assets/user-cog-J9atIeFe.js","/assets/users-CpSLeyYj.js","/assets/vfx-xiODRtr3.js","/assets/video-TLSfaxTU.js","/assets/wallet-DWuB5J0f.js","/assets/warehouse-1ZVds98F.js","/assets/x-DTLQ5aAV.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
