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

const BUILD = "2026-10-04T20:47:34.717Z";
const PRECACHE = ["/","/assets/AdminPanel-BRR7chOq.js","/assets/AnalysisBoard-DQZJGozx.js","/assets/Arc-CtJjzg25.js","/assets/ArcLegacy-K4P0ZMAG.js","/assets/BrigadirProfile-C0VlrR4n.js","/assets/BroadcastReceivers-B6jtmWq_.js","/assets/BroadcastRecord-DeLT1T6W.js","/assets/CatLockNotice-BaRVfbBD.js","/assets/CategoryLegendModal-BSr7WGIt.js","/assets/CellConcerns-y-NheEdd.js","/assets/CellDetails-B0n0Zaz9.js","/assets/CellFormModal-CADwslIX.js","/assets/CellIdent-m71jHd_2.js","/assets/CellLink-v2tFuCiQ.js","/assets/Cells-CrdfSu7H.js","/assets/ColumnFilter-B2loE5W1.js","/assets/ColumnsPicker-Byl5CX4d.js","/assets/CommentsModal-DBQ5JHpp.js","/assets/ComparisonTable-CJuG9k_V.js","/assets/Concerns-n__cuQkx.js","/assets/ConfirmDialog-D63aNvN0.js","/assets/Daily-DMxTItFs.js","/assets/DataTable-D8NFkOv-.js","/assets/DateRangePicker-DtPQNQVi.js","/assets/DayReportView-ZJ71BXBi.js","/assets/DayStepper-BnpIyB9L.js","/assets/DifferenceBreakdown-Duyu_HjV.js","/assets/Downtime-C1chkZZR.js","/assets/Education-DIFQhTN8.js","/assets/EducationLesson-zKNE4sKW.js","/assets/EmptyState-BzelDp2Q.js","/assets/Exam-BClt7IP4.js","/assets/FactorySelect-Fz9783xD.js","/assets/Gamification-eXa_AnG3.js","/assets/GroupBadge-BzKBbiJN.js","/assets/HeatmapChart-BVxPESw2.js","/assets/IdleCell-DCrnCoF0.js","/assets/KPICard-Dzainazd.js","/assets/Kaizen-M5cXaXAS.js","/assets/Kelish-D3117Yeu.js","/assets/KpiDeltaCard-D11FYW4d.js","/assets/LangTextInput-FiId9CtT.js","/assets/Layout-D4hMB5dK.js","/assets/LeaderAppeal-BdwEVPwX.js","/assets/LeaderDayReport-BEuODzNs.js","/assets/LeaderUnitReport-DxBMkbBx.js","/assets/Leaderboard-CVrRUxyi.js","/assets/Leaders-BrrjW33s.js","/assets/Lightbox-DNaM0Gta.js","/assets/LiveOverview-ZI_OYilz.js","/assets/Login-DALZsQrV.js","/assets/NotFound-TMxaJP9e.js","/assets/Notifications-QaY-ZVfO.js","/assets/Overview-HoC4dlX5.js","/assets/Pagination-bNt4S7xh.js","/assets/PerenaladkaFactTable-069gjCYf.js","/assets/PersonCard-DhPafRaJ.js","/assets/PlanFulfillment-Bd2MklHh.js","/assets/Production-4SOr_3_m.js","/assets/Profile-CSxCA7-o.js","/assets/ProofCamera-COp9kZLe.js","/assets/ProofPhoto-2vwORLqe.js","/assets/Quality-DGuHJ0Gt.js","/assets/RawRows-ByYO7vLH.js","/assets/RequestStateChip-Da6rK4kp.js","/assets/RichTextEditor-C3jxk0IN.js","/assets/SaveState-CMlTptlT.js","/assets/SearchInput-DJelL1j0.js","/assets/SeasonalityHeatmap-C2htMDvt.js","/assets/SegmentedToggle-CIvRI7xO.js","/assets/SetupTimes-BJoWnohk.js","/assets/ShiftDaily-DZYzaXa6.js","/assets/Staff-BJMLdgo2.js","/assets/StaffLive-CerGtuO8.js","/assets/StatusBadge-waGZTITA.js","/assets/TargetGoal-VooGra0f.js","/assets/Targets-CRj-ajx1.js","/assets/Tasks-B3XHvTRB.js","/assets/TimeWheelPicker-DfT_Okw7.js","/assets/Toast-CrwK9zJJ.js","/assets/Tooltip-QDXVE2il.js","/assets/TrendChart-Cc264eaV.js","/assets/TripleSpeedometer-CMvXAiYo.js","/assets/Trudoyomkost-9PvoINUC.js","/assets/Turnover-DHnVwUnB.js","/assets/UploadDropzone-BKxGlOid.js","/assets/UsersActivity-BFuRSqGI.js","/assets/VerdictBlock-ChhVgak_.js","/assets/VfxApiMap-CwZ99Z4v.js","/assets/VfxDictionaries-C5MElPfA.js","/assets/VfxEmployees-dxZBydoD.js","/assets/VfxHrMoves-gpCa4kDI.js","/assets/VfxJobs-D_d5wGPZ.js","/assets/VfxPhoto-Derh5jRH.js","/assets/VfxShifts-Btt0zkXh.js","/assets/VfxState-BdH6kwp0.js","/assets/VfxTimebooks-96nxwjCA.js","/assets/VfxTimesheet-B6zZye1y.js","/assets/WatchProgress-X7a3CRZZ.js","/assets/WebLogin-KSX-mOLS.js","/assets/WorkerConcerns-4Ha3cOkR.js","/assets/Workers-BWoVKJxw.js","/assets/Zagruzka-W-_UWDdG.js","/assets/ZagruzkaCell-CN6wv8k2.js","/assets/api-Dmyv_cPv.js","/assets/archive-DAI1EeCQ.js","/assets/archive-restore-CxmgMVE6.js","/assets/arrow-down-zzYw7nge.js","/assets/arrow-left-BJzcLLYa.js","/assets/arrow-up-BM0nG9_R.js","/assets/arrow-up-narrow-wide-CFes0owu.js","/assets/arrow-up-right-BTkmYZkk.js","/assets/award-BSIpGuo5.js","/assets/ban-B9dTcZ-m.js","/assets/book-open-lDTPAdgA.js","/assets/bot-C8_OnqQa.js","/assets/boxes-DMx1IMRD.js","/assets/braces-CC8nqIz_.js","/assets/brigadirFilters-BufyoXSY.js","/assets/broadcastTree-DjY0OUcN.js","/assets/building-2-CrPvY7J4.js","/assets/calculator-DUnUkzxJ.js","/assets/calendar-DkzX-8AB.js","/assets/calendar-days-Dg6QnCRN.js","/assets/camera-COod1HqC.js","/assets/categories-BTU7A13q.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-ct4Pt4OD.js","/assets/chart-line-B3H0sLBe.js","/assets/chart-pie-CPMRjYf-.js","/assets/chartRange-D_-Xgn-D.js","/assets/check-check-Cq5OovHZ.js","/assets/chevron-left-DP1QHgHy.js","/assets/chevrons-up-down-4UCfkSiI.js","/assets/circle-Bne0vH3q.js","/assets/circle-alert-CDHZ1Fy1.js","/assets/circle-check-big-Bf7mJhA-.js","/assets/circle-dashed-CiPECLLK.js","/assets/circle-minus-C5wIzCNv.js","/assets/circle-question-mark-BJVKTcTs.js","/assets/circle-slash-BL74ZRp_.js","/assets/circle-user-round-Cf1jIqNg.js","/assets/clock-3-C-gdIJ7I.js","/assets/cloud-off-DJker13-.js","/assets/cloud-upload-B-yyaUwY.js","/assets/compass-D2hSTTIu.js","/assets/concernCategories-D_0kJJqt.js","/assets/copy-BT69S7mM.js","/assets/corner-down-right-B2Rgus_b.js","/assets/createLucideIcon-Dc4TrM60.js","/assets/es-DXHJNSGP.js","/assets/exportXlsx-CNUaxcJ8.js","/assets/external-link-B0qzMVQS.js","/assets/file-clock-CQz46Nob.js","/assets/file-exclamation-point-BpdpuXt9.js","/assets/file-spreadsheet-9ez1stR-.js","/assets/file-text-DlcX0z7J.js","/assets/flag-Dv7zo6KK.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-pSAl50Gf.js","/assets/hash-DQF0xD6N.js","/assets/history-ByH0Vajt.js","/assets/hourglass-BkoWdlW4.js","/assets/image-off-B7zSH7hB.js","/assets/image-wpR7A0BQ.js","/assets/inbox-BVcsGkDo.js","/assets/index-D4VDufLq.css","/assets/index-Eo6VkwPp.js","/assets/key-round-S8G0haV1.js","/assets/keyboard-CLvz-su_.js","/assets/languages-BlUsAoef.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Bd1Dg1Dn.js","/assets/lightbulb-B0UwLigN.js","/assets/link-2-dym9hVhl.js","/assets/link-2-off-C2ky-Xap.js","/assets/list-ordered-Dx5NweDD.js","/assets/list-tree-r-W5a70t.js","/assets/lock-open-hxnD0a6g.js","/assets/log-in-DqCM1k2D.js","/assets/maximize-2-DrNCqyig.js","/assets/message-square-BiYgWK6S.js","/assets/minimize-2-BVN3v9Ag.js","/assets/package-check-Cc2vV94C.js","/assets/paperclip-BuA5YfGp.js","/assets/pencil-CvOqik2s.js","/assets/percent-YcZWv8Qg.js","/assets/pin-h-ROXPZo.js","/assets/pin-off-1qnRI1ui.js","/assets/play-CtgWOEc0.js","/assets/plug-zap-DadrFych.js","/assets/presentation-CUGj6yIV.js","/assets/prop-types-F396tic3.js","/assets/radio-CdiuYMSd.js","/assets/react-apexcharts.esm-DnAu9Yfs.js","/assets/registers-CMaqM5Tr.js","/assets/repeat-BdAA_SQD.js","/assets/rotate-ccw-Cq5WBkzd.js","/assets/rotate-cw-D-vbcqgG.js","/assets/save-DF-elY5i.js","/assets/scopeLinks-BQXOrjD5.js","/assets/scroll-text-CeihcbHG.js","/assets/search-x-DUf_aeuT.js","/assets/segments-BClWhrdu.js","/assets/send-BMvLhqtb.js","/assets/settings-2-t7P87R5J.js","/assets/shield-BV1ZCytt.js","/assets/shield-alert-mfbu5TYB.js","/assets/shield-check-BbtAlgHn.js","/assets/shield-question-mark-D5TXbszv.js","/assets/siren-DzubiutO.js","/assets/snowflake-B_tnST0z.js","/assets/split-j_BVhT25.js","/assets/square-D3fP6F2v.js","/assets/square-check-big-DHMjHOOh.js","/assets/star-D7mNOADn.js","/assets/statusBands-BwtxlWcu.js","/assets/store-D1s01tl7.js","/assets/table-2-CdVOms0M.js","/assets/table-properties-DTFyh1UZ.js","/assets/tag-Vi7wBhGp.js","/assets/timer-off-DRIBtp5T.js","/assets/trending-down-zCE4kZMW.js","/assets/trending-up-DjOkoJET.js","/assets/undo-2-zuoTLtXS.js","/assets/useChartTheme-DaHXd7Qx.js","/assets/useElementWidth-CAN5Lll0.js","/assets/useIsMobile-DSxXNexB.js","/assets/useOpenParam-GAqlnymB.js","/assets/useStatusBands-BPAj08nr.js","/assets/useUrlScope-ClWF_KVa.js","/assets/user-Be64uq5S.js","/assets/user-cog-C4nFUlEz.js","/assets/users-orYTHtU1.js","/assets/vfx-bpK6WaHR.js","/assets/video-CgoPgM4a.js","/assets/wallet-Bu41sK1c.js","/assets/warehouse-DSMFsilf.js","/assets/x-BIjKKt9F.js","/assets/zap-CT3_rqjK.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
