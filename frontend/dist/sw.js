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

const BUILD = "2026-10-04T14:28:33.321Z";
const PRECACHE = ["/","/assets/AdminPanel-DKU5wFhg.js","/assets/AnalysisBoard-NHbw3iOK.js","/assets/Arc-BpxBj503.js","/assets/ArcLegacy-DSHXOUS_.js","/assets/BrigadirProfile-xZyk-8K0.js","/assets/BroadcastReceivers-BR4oqCeS.js","/assets/BroadcastRecord-lJpxXcX0.js","/assets/CatLockNotice-CeWEtVk9.js","/assets/CategoryLegendModal-CMaGOHxy.js","/assets/CellConcerns-447iUif4.js","/assets/CellDetails-UTxP8kyQ.js","/assets/CellFormModal-B9tJtuAS.js","/assets/CellIdent-_8WMPXWN.js","/assets/CellLink-5N2XpQl7.js","/assets/Cells-B9kzQJ3I.js","/assets/ColumnFilter-MXa2Wknn.js","/assets/ColumnsPicker-D9o8dmh3.js","/assets/CommentsModal-C7_hGGcl.js","/assets/ComparisonTable-BN4DT8-F.js","/assets/Concerns-CjN3TAAI.js","/assets/ConfirmDialog-Bck2W_Va.js","/assets/Daily-DpGRb9Gv.js","/assets/DataTable-Bzt-sUpn.js","/assets/DateRangePicker-CXciIyfN.js","/assets/DayReportView-CJfvbrgR.js","/assets/DayStepper-CUGVBhAs.js","/assets/DifferenceBreakdown-BN87el3l.js","/assets/Downtime-D37xrqvo.js","/assets/Education-VxPAfwkA.js","/assets/EducationLesson-BFYjeHP9.js","/assets/EmptyState-CJIWBg7g.js","/assets/Exam-Dfo7cCyI.js","/assets/FactorySelect-nBsshxaF.js","/assets/Gamification-CZH-rlcu.js","/assets/GroupBadge-BeDMnHzx.js","/assets/HeatmapChart-DSsWM6ah.js","/assets/IdleCell-BAqwvg8i.js","/assets/KPICard-CZLF1pbx.js","/assets/Kaizen-MMgdYK0B.js","/assets/Kelish-DVScSg7E.js","/assets/KpiDeltaCard-Gcbva7HA.js","/assets/LangTextInput-Cf2cenoD.js","/assets/Layout-TjDZvLHl.js","/assets/LeaderAppeal-jlJyWoqC.js","/assets/LeaderDayReport-JLsIIVVY.js","/assets/LeaderUnitReport-l_02oCOp.js","/assets/Leaderboard-ByGfdMIE.js","/assets/Leaders-xZn1RA5O.js","/assets/Lightbox-DZT_s-28.js","/assets/LiveOverview-DZuZ6Dje.js","/assets/Login-w2lwhL_p.js","/assets/NotFound-Uq0wQprF.js","/assets/Notifications-t8vkNFVE.js","/assets/Overview-lGdNYC_4.js","/assets/Pagination-CrdZ1YDO.js","/assets/PerenaladkaFactTable-CfQWNkgM.js","/assets/PersonCard-BqxEBKiZ.js","/assets/PlanFulfillment-C2FhN0y0.js","/assets/Production-j_X1fY0C.js","/assets/Profile-DIOcrpzw.js","/assets/ProofCamera-D6rkYTH8.js","/assets/ProofPhoto-D7MpCJOf.js","/assets/Quality-DySpToDX.js","/assets/RawRows-B7gjYN9u.js","/assets/RequestStateChip-CFE-6iAq.js","/assets/RichTextEditor-C2n1ody-.js","/assets/SaveState-Cow0xBPx.js","/assets/SearchInput-7KdXT1nd.js","/assets/SeasonalityHeatmap-DHrVPnyP.js","/assets/SegmentedToggle-BP4Dn3w-.js","/assets/SetupTimes-hJcBw-cF.js","/assets/ShiftDaily-CTK_pHZT.js","/assets/Staff-Ck30pHJK.js","/assets/StaffLive-G98IFCni.js","/assets/StatusBadge-CHoFLvRz.js","/assets/TargetGoal-uHhgZ4tZ.js","/assets/Targets-GuRNukox.js","/assets/Tasks-B70yHEHo.js","/assets/TimeWheelPicker-DtrAVYIw.js","/assets/Toast-CJjj_hcf.js","/assets/Tooltip-DE1xtE2Y.js","/assets/TrendChart-Diz4wnnO.js","/assets/TripleSpeedometer-Cx72aclN.js","/assets/Trudoyomkost-B3YZXnSk.js","/assets/Turnover-BiqNCthh.js","/assets/UploadDropzone-i26XHjQ4.js","/assets/UsersActivity-qlg8v70r.js","/assets/VerdictBlock-CYDsvtXw.js","/assets/VfxApiMap-D1m4tipo.js","/assets/VfxDictionaries-umPRgvE9.js","/assets/VfxEmployees-vPYZGH-t.js","/assets/VfxHrMoves-yJNcV98e.js","/assets/VfxJobs-BAq9I7EN.js","/assets/VfxPhoto-C8vDeKdu.js","/assets/VfxShifts-DGSUA0Fg.js","/assets/VfxState-DBadzjgK.js","/assets/VfxTimebooks-D5l-5KmU.js","/assets/VfxTimesheet-BfI4JfCa.js","/assets/WatchProgress-vxij-B3z.js","/assets/WebLogin-CTuXQJ_w.js","/assets/WorkerConcerns-D-iqKXhg.js","/assets/Workers-ClkOX3BP.js","/assets/Zagruzka-DHMDiGa0.js","/assets/ZagruzkaCell-CIBN6rcW.js","/assets/api-Crx_jx0K.js","/assets/archive-CUkMNmU_.js","/assets/archive-restore-DqTfOWkI.js","/assets/arrow-down-veDjJn01.js","/assets/arrow-left-DyF8QN6U.js","/assets/arrow-up-DZJfUrGZ.js","/assets/arrow-up-narrow-wide-BNmkGrhF.js","/assets/arrow-up-right-DfvzXPpM.js","/assets/award-BaUBpBOz.js","/assets/ban-QSutxDoK.js","/assets/book-open-DhFkSqbR.js","/assets/bot-EHBqGog9.js","/assets/boxes-Dc7XVagN.js","/assets/braces-DYtTKWsK.js","/assets/brigadirFilters-CVMFkSVv.js","/assets/broadcastTree-gd2_dYw_.js","/assets/building-2-C_jzMbLg.js","/assets/calculator-1PD6POOb.js","/assets/calendar-DujCOfbQ.js","/assets/calendar-days-CbM5ErEe.js","/assets/camera-DW1J6D6j.js","/assets/categories-BkC-QERC.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B-vWDAQT.js","/assets/chart-line-dOe_e_3r.js","/assets/chart-pie-BP4cNze8.js","/assets/chartRange-fDpqVZOQ.js","/assets/check-check-D1Dgn_YD.js","/assets/chevron-left-DUha68bL.js","/assets/chevrons-up-down-DP3M95Xg.js","/assets/circle-Ddp7teAA.js","/assets/circle-alert-Bzb6DJQ0.js","/assets/circle-check-big-BvNS32ug.js","/assets/circle-dashed-DLqni-AZ.js","/assets/circle-minus-DHMehQrC.js","/assets/circle-question-mark-CpXxLwzq.js","/assets/circle-slash-BJGYlEAK.js","/assets/circle-user-round-CzC2OHoB.js","/assets/clock-3-YEp-P8LJ.js","/assets/cloud-off-CYvMMd_Y.js","/assets/cloud-upload-BQ3hIMn9.js","/assets/compass-C77M__mq.js","/assets/concernCategories-BuQZOnE7.js","/assets/copy-B3ipgHN9.js","/assets/corner-down-right-4knEVpaj.js","/assets/createLucideIcon-DWXui5R0.js","/assets/es-HJtixQt_.js","/assets/exportXlsx-YHfR4nzV.js","/assets/external-link-BbLnb4nD.js","/assets/file-clock-dlCpPSNO.js","/assets/file-exclamation-point-Ct0UIzx0.js","/assets/file-spreadsheet-DrvvUFC8.js","/assets/file-text-RaifyNPS.js","/assets/flag-EogAwFah.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-C-LNT1Sx.js","/assets/hash-CyncsspB.js","/assets/history-CznO7YRV.js","/assets/hourglass-FO1Er0Qe.js","/assets/image-CjaToJTB.js","/assets/image-off-DVhwsjBJ.js","/assets/inbox-hnGxq2NJ.js","/assets/index-BVd-uVFM.css","/assets/index-DH3i3dPg.js","/assets/key-round-7Iy4qWlp.js","/assets/keyboard-B1FtnlsX.js","/assets/languages-D-zROSwa.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-yHOfgYJb.js","/assets/lightbulb-DVAPUVnm.js","/assets/link-2-CbuMcKRu.js","/assets/link-2-off-BblGsDEi.js","/assets/list-ordered-D7exuLfR.js","/assets/list-tree-BwZ9suBp.js","/assets/lock-open-Dw-UKidg.js","/assets/log-in-s8V2AqK2.js","/assets/maximize-2-tFnBK8kk.js","/assets/message-square-C4ZKXmAS.js","/assets/minimize-2-BktojrB1.js","/assets/package-check-B1PmCj4V.js","/assets/paperclip-hC2X4E1b.js","/assets/pencil-D_Y-7Oet.js","/assets/percent-6TlJ4e-Y.js","/assets/pin-DFx60vje.js","/assets/pin-off-Ct-z0FKS.js","/assets/play-DWIkOnnG.js","/assets/plug-zap-d42blKQw.js","/assets/presentation-M1CeOT1B.js","/assets/prop-types-DgK0KDWn.js","/assets/radio-D4L0aL2T.js","/assets/react-apexcharts.esm-BoqaO1ab.js","/assets/registers-DgIoCtdq.js","/assets/repeat-CQne064o.js","/assets/rotate-ccw--Vn9SZK8.js","/assets/rotate-cw-hkkjVfHQ.js","/assets/save-BiI4M5JC.js","/assets/scopeLinks-C9G8OlpY.js","/assets/scroll-text-CU-72PS7.js","/assets/search-x-D21qHTjS.js","/assets/segments-CyrfFbg0.js","/assets/send-BXNOQ640.js","/assets/settings-2-N_EtWtyB.js","/assets/shield-C8U0F5Du.js","/assets/shield-alert-B_ZitG8C.js","/assets/shield-check-zALwt181.js","/assets/shield-question-mark-DYacYlpD.js","/assets/siren-B87cQce7.js","/assets/snowflake-CEYwdegx.js","/assets/split-BmP63wKX.js","/assets/square-CrJ3-d-5.js","/assets/square-check-big-ymnJIB7d.js","/assets/star-CqEPaMMW.js","/assets/statusBands-m9_ehmS0.js","/assets/store-Bc5E9Ey2.js","/assets/table-2-BlOWCK-7.js","/assets/table-properties-cgsXIiIJ.js","/assets/tag-BcHoy1y2.js","/assets/timer-off-C5juepp4.js","/assets/trending-down-BG0dGVSD.js","/assets/trending-up-DhQdB5zl.js","/assets/undo-2-CliAqZNR.js","/assets/useChartTheme-tuMzo6xT.js","/assets/useElementWidth-C0ynQkk8.js","/assets/useIsMobile-DZ4cg28_.js","/assets/useOpenParam-DGdXi9kB.js","/assets/useStatusBands-DaFuaaoA.js","/assets/useUrlScope-Cf_zGCE_.js","/assets/user-CfEkMN00.js","/assets/user-cog-5pNfiQQ7.js","/assets/users-CeprvqJx.js","/assets/vfx-y2znETmw.js","/assets/video-BQpRONe1.js","/assets/wallet-CORlv9dv.js","/assets/warehouse-BprveM8F.js","/assets/x-DUQlg_s3.js","/assets/zap-CaloCuVN.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
