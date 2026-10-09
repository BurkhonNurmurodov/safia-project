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

const BUILD = "2026-10-09T09:07:38.777Z";
const PRECACHE = ["/","/assets/AdminPanel-BFto4AkY.js","/assets/AnalysisBoard-CV0MJ7BB.js","/assets/Arc-BOxcRzzK.js","/assets/Assistant-C8sOt4ge.js","/assets/BrigadirProfile-D6G9oFUE.js","/assets/BroadcastReceivers-DKrzcLhL.js","/assets/BroadcastRecord-D39GPyJa.js","/assets/Button-Bg2Eh2QR.js","/assets/CatLockNotice-mxvKvolt.js","/assets/CategoryLegendModal-CtGgh9sg.js","/assets/CellConcerns-CoEl3PJr.js","/assets/CellDetails-Bsck1Hp_.js","/assets/CellFormModal-DiOXYSNc.js","/assets/CellIdent-ByFD_w_a.js","/assets/CellLink-Bg3qpgu-.js","/assets/Cells-BGTTgW4F.js","/assets/ColumnFilter-BK6ynZOP.js","/assets/ColumnsPicker-Cl3QveLi.js","/assets/CommentsModal-CkgkYVkw.js","/assets/ComparisonTable-8eId6UGI.js","/assets/Concerns-BYPnIwQ3.js","/assets/Daily-CDrfdCah.js","/assets/DataTable-CjkJ3Zig.js","/assets/DateRangePicker-DyIm4uWo.js","/assets/DayReportView-DdQAjkvg.js","/assets/DayStepper-C8Tv9t23.js","/assets/DifferenceBreakdown-De6q_2cK.js","/assets/Downtime-ZqTAYStJ.js","/assets/Education-C0vceUav.js","/assets/EducationLesson-BHSruLFe.js","/assets/EmptyState-DroIV2r4.js","/assets/Exam-CqeCQ4dg.js","/assets/FactorySelect-DKBN5Ziu.js","/assets/Gamification-CFKL2JfF.js","/assets/GroupBadge-C6m_UgF2.js","/assets/HeatmapChart-Br17vNmH.js","/assets/IdleCell-DWfatHXZ.js","/assets/KPICard-BIQvD8zo.js","/assets/Kaizen-nrjGxDgE.js","/assets/Kelish-OSeDcfIt.js","/assets/KpiDeltaCard-CQoD7oQ1.js","/assets/LangTextInput-DrHiSPdE.js","/assets/Layout-DGYdHHrW.js","/assets/LeaderAppeal-bv7ST7Ee.js","/assets/LeaderDayReport-Cw_BVJUe.js","/assets/LeaderUnitReport-DEaCXfPG.js","/assets/Leaderboard-DO2x04Bb.js","/assets/Leaders-BxQ-fxTB.js","/assets/Lightbox-BFJK3MtX.js","/assets/LiveOverview-BfPuat9J.js","/assets/Login-eWrypUSt.js","/assets/NotFound-DSVEvihv.js","/assets/Notifications-Dyy2Xe2m.js","/assets/Overview-CFFUSP8P.js","/assets/Pagination-CNu4HWRX.js","/assets/PerenaladkaFactTable-Bcn2pjUf.js","/assets/PersonCard-DvU2A0xS.js","/assets/PlanFulfillment-boS6lR70.js","/assets/Production-866ilsQI.js","/assets/Profile-DJmzt6EE.js","/assets/ProofCamera-D8qAenbt.js","/assets/ProofPhoto-DN07sfeF.js","/assets/Quality-DOizeSsl.js","/assets/RawRows-y5og1C05.js","/assets/RequestStateChip-MrHvbu4R.js","/assets/RichTextEditor-B__65YzX.js","/assets/SaveState-B-e2AeVC.js","/assets/SearchInput-CViovGtt.js","/assets/SeasonalityHeatmap-DlSAeLwx.js","/assets/SegmentedToggle-BRoMdb6r.js","/assets/SetupTimes-inIE40mX.js","/assets/ShiftDaily-Dh5OQfJd.js","/assets/Staff-Dj6eNWdl.js","/assets/StatusBadge-DcE7UkCP.js","/assets/TargetGoal-V_PaYCpU.js","/assets/Targets-DB5_mTH3.js","/assets/Tasks-DaTgcr-o.js","/assets/TimeWheelPicker-DEU7pc2U.js","/assets/Toast-DCQcPfzn.js","/assets/Tooltip-C9vIb-Ou.js","/assets/TrendChart-CO597X1J.js","/assets/TripleSpeedometer-DKoo_XWo.js","/assets/Trudoyomkost-DuwcX2Cu.js","/assets/Turnover-BD9E8Q8b.js","/assets/UploadDropzone-Cz3XzyOy.js","/assets/UsersActivity-CNar1gGg.js","/assets/VerdictBlock-DS4XqdL_.js","/assets/VfxApiMap-BmgBxRj8.js","/assets/VfxDictionaries-Bj8zTlVr.js","/assets/VfxEmployees-C-0Vclya.js","/assets/VfxHrMoves-2ttV4KIQ.js","/assets/VfxJobs-BuHYF5an.js","/assets/VfxPhoto-CKfzHRS5.js","/assets/VfxShifts-BPfdZRfc.js","/assets/VfxState-vW1uhjvC.js","/assets/VfxTimebooks-BGYLaXN3.js","/assets/VfxTimesheet-DH5zHPfZ.js","/assets/WatchProgress-xS8u7-yE.js","/assets/WebLogin-BODLRCMO.js","/assets/WorkerConcerns-CpZh7Z7l.js","/assets/Workers-CrRfaYdA.js","/assets/Zagruzka-50cWi8vW.js","/assets/ZagruzkaCell-wuiMYlvZ.js","/assets/api-BgWt1v_U.js","/assets/archive-gC8dPr5A.js","/assets/archive-restore-Bc4SlTVj.js","/assets/arrow-down-CuTQL2Ls.js","/assets/arrow-down-wide-narrow-CpKM8L94.js","/assets/arrow-up-narrow-wide-Feu6pC3m.js","/assets/award-JtAcRhFd.js","/assets/ban-zqWaZPvs.js","/assets/boxes-DimO6e5G.js","/assets/braces-iG_xSqbJ.js","/assets/brigadirFilters-C9W7VIyQ.js","/assets/broadcastTree-BKAYme0t.js","/assets/building-2-COHQLMXp.js","/assets/calculator-B5_LCHXD.js","/assets/calendar-DjC7MG99.js","/assets/calendar-days-DjID3vD3.js","/assets/camera-BS1tU7_Q.js","/assets/categories-DQtnqssm.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CuTepCMu.js","/assets/chart-line-CxQwDhHr.js","/assets/chart-pie-DJTaCcCE.js","/assets/chartRange-wqWSammh.js","/assets/check-check-CmJKbSrk.js","/assets/chevron-left-Lzs7S8sJ.js","/assets/chevrons-up-down-hD0P2YGZ.js","/assets/circle-CrXq9JMH.js","/assets/circle-alert-BcBV_jAJ.js","/assets/circle-check-big-NOFJ4kZz.js","/assets/circle-dashed-D4iKSzKR.js","/assets/circle-minus-C9RBJW4Q.js","/assets/circle-question-mark-DRZlMTNr.js","/assets/circle-slash-DRQFM4p6.js","/assets/circle-user-round-CKFihW7p.js","/assets/clock-3-CKzBV09C.js","/assets/cloud-off-DTpMSweH.js","/assets/cloud-upload-BTumGBlZ.js","/assets/compass-BGoXZpNS.js","/assets/concernCategories-DNcRXDO_.js","/assets/copy-DYfvTN-L.js","/assets/corner-down-right-BnODprz7.js","/assets/createLucideIcon-Rx_h2MEe.js","/assets/es-CAx3Phgv.js","/assets/external-link-CexIl-9k.js","/assets/file-clock-BIOmRa_Q.js","/assets/file-exclamation-point-Cc40ZqXz.js","/assets/flag-BdYBLfo5.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Dq4ELTXb.js","/assets/hash-BxiEfYlA.js","/assets/hourglass-Dnzi6oZr.js","/assets/image-CBu42THa.js","/assets/image-off-D9uPZ7OZ.js","/assets/inbox-CvZcw3Ph.js","/assets/index-DFfGVOG_.css","/assets/index-rPtQjjQN.js","/assets/keyboard-BMF-RKWx.js","/assets/languages-B7Ngyx2j.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-IosVqLDA.js","/assets/lightbulb-DglynrI2.js","/assets/link-2-DtI2YJ0j.js","/assets/link-2-off-CGmuYqna.js","/assets/list-ordered-Cqib1h1-.js","/assets/list-tree-DUEhBviF.js","/assets/lock-open-CA-3x1Un.js","/assets/log-in-tNgCTJZD.js","/assets/minimize-2-wYwoI91m.js","/assets/package-check-CG4BtGaA.js","/assets/pencil-BHJRyysu.js","/assets/percent-ByrnUKKu.js","/assets/pin-Befn_3yL.js","/assets/pin-off-B4VoayI1.js","/assets/play-eF3ObZgh.js","/assets/plug-zap-CCSaX25Y.js","/assets/prop-types-uWXJEXRd.js","/assets/radio-D0_9LDC5.js","/assets/react-apexcharts.esm-CCHfAtkO.js","/assets/registers-Dgxie3d6.js","/assets/repeat-BfWWiVxw.js","/assets/save-CVSj71rr.js","/assets/scopeLinks-Cpmggvlc.js","/assets/scroll-text-DcYriMMd.js","/assets/search-x-CehwvtTe.js","/assets/segments-CglJkziJ.js","/assets/send-CU0EM_tM.js","/assets/settings-2-CZF4UpBs.js","/assets/shield-DV_QEpE3.js","/assets/shield-alert-Bi01Ac5i.js","/assets/shield-question-mark-DS_NnXQq.js","/assets/siren-BH2d96p1.js","/assets/snowflake-Cd1HpkqD.js","/assets/split-CzP1Shrj.js","/assets/square-check-big-BoyndMml.js","/assets/star-CFEBsw2t.js","/assets/statusBands-CWPRlFnS.js","/assets/store-BDwv9PMY.js","/assets/table-2-CXLthSQU.js","/assets/table-properties-Dz4n2r17.js","/assets/tag-DkutMpHg.js","/assets/timer-off-BjwopYTa.js","/assets/trending-down-BamPSt9Y.js","/assets/trending-up-DRoVFUw8.js","/assets/undo-2-BU4UDaq0.js","/assets/useChartTheme-VfV6vnDZ.js","/assets/useElementWidth-B_RiBsPH.js","/assets/useIsMobile-DI3EgyAC.js","/assets/useOpenParam-Zw3UtTaA.js","/assets/useStatusBands-BEMkt7x3.js","/assets/useUrlScope-Ch-HYOxF.js","/assets/user-Cxyjewpx.js","/assets/user-cog-CEoO6_Vg.js","/assets/users-BYDS6sBd.js","/assets/vfx-CcfhEWEV.js","/assets/video-BAawBkSE.js","/assets/wallet-TBZzSEQN.js","/assets/warehouse-DPIxoNis.js","/assets/x-B66uAwIo.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
