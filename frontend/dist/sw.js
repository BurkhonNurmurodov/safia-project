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

const BUILD = "2026-10-01T14:23:31.158Z";
const PRECACHE = ["/","/assets/AdminPanel-k6__REYB.js","/assets/AnalysisBoard-HmoPq5QP.js","/assets/Arc-Bf6HmWrU.js","/assets/ArcLegacy-Be-U46OE.js","/assets/BrigadirProfile-BiwCmUgr.js","/assets/BroadcastReceivers-DuyCtIdn.js","/assets/BroadcastRecord-Y3MsuRs1.js","/assets/CatLockNotice-ByezKYH7.js","/assets/CategoryLegendModal-DUDs6-8j.js","/assets/CellConcerns-C3tZRP59.js","/assets/CellDetails-ifjagYjL.js","/assets/CellFormModal-DuNCz3Eq.js","/assets/CellIdent-DIphFQbN.js","/assets/CellLink-DPnWHMyg.js","/assets/Cells-Bt_2GPAb.js","/assets/ColumnFilter-Dxzdy0AO.js","/assets/ColumnsPicker-fA3Bqnso.js","/assets/CommentsModal-BXZ9khlp.js","/assets/ComparisonTable-BEhS5BA7.js","/assets/Concerns-NmyIdfXM.js","/assets/ConfirmDialog-Bz-ZaLTP.js","/assets/Daily-CtJrOet7.js","/assets/DataTable-hzDavp5U.js","/assets/DateRangePicker-D30JZEDq.js","/assets/DayReportView-BfZxGCJi.js","/assets/DayStepper-DbVD4GBl.js","/assets/DifferenceBreakdown-BRaBvBdh.js","/assets/Downtime-DvHVWdyG.js","/assets/Education-RYjqNwCx.js","/assets/EducationLesson-DId6d-U9.js","/assets/EmptyState-APerBdpm.js","/assets/Exam-DIC_M5E9.js","/assets/FactorySelect-jqaGRXPR.js","/assets/Gamification-CHE_waO1.js","/assets/GroupBadge-CIOiISF3.js","/assets/HeatmapChart-CF0KPqJZ.js","/assets/IdleCell-dkS89bd2.js","/assets/KPICard-5byX3rL8.js","/assets/Kaizen-CZ5t1KKC.js","/assets/Kelish-TCvTKFUj.js","/assets/KpiDeltaCard-BakFLJdt.js","/assets/LangTextInput-D8mU_mc7.js","/assets/Layout-DyjUhiEF.js","/assets/LeaderAppeal-WZXRRf-Y.js","/assets/LeaderDayReport-BXmTV6ZU.js","/assets/LeaderUnitReport-Cp8dFl3D.js","/assets/Leaderboard-DVrgkblS.js","/assets/Leaders-Cj83EnGm.js","/assets/Lightbox-BMml8Nhg.js","/assets/LiveOverview-DxYR6unD.js","/assets/Login-DPvPreNt.js","/assets/NotFound-BL6cSTHJ.js","/assets/Notifications-BFFdfPU7.js","/assets/Overview-deW8CrIq.js","/assets/Pagination-BBxjfdUs.js","/assets/PerenaladkaFactTable-BLzGt0TB.js","/assets/PlanFulfillment-CrOC55Vu.js","/assets/Production-CC_fjUUe.js","/assets/Profile-D4mfIg7D.js","/assets/ProofCamera-DQEGdrSq.js","/assets/ProofPhoto-CufoIhvW.js","/assets/Quality-BQcl9Ymk.js","/assets/RequestStateChip-uxj1_KlL.js","/assets/RichTextEditor-Cryu1G8w.js","/assets/SaveState-D2Oeswig.js","/assets/SearchInput-Ch5uSe4s.js","/assets/SeasonalityHeatmap-FbU2dNV7.js","/assets/SegmentedToggle-Yf2TK3s2.js","/assets/SetupTimes-DB2RQyb9.js","/assets/ShiftDaily-tWWuqIdp.js","/assets/Staff-LsyEkiVT.js","/assets/StaffLive-CkveSOQ3.js","/assets/StatusBadge-DmNue6tI.js","/assets/TargetGoal-C07jJBb-.js","/assets/Targets-CxUZXfZ7.js","/assets/Tasks-DuczWZa_.js","/assets/TimeWheelPicker-DAn9tw3-.js","/assets/Toast-BUlvm-ES.js","/assets/Tooltip-BIfHQG8j.js","/assets/TrendChart-D_5-GN5s.js","/assets/TripleSpeedometer-Bp98lZTU.js","/assets/Trudoyomkost-rBOovrCE.js","/assets/UploadDropzone-DhBFhrtA.js","/assets/UsersActivity-DbohnxM5.js","/assets/VerdictBlock-BmlZCWPj.js","/assets/WatchProgress-CdArxulh.js","/assets/WebLogin-D9_LBhS0.js","/assets/WorkerConcerns-BagNiwQP.js","/assets/Workers-PzBsf_XG.js","/assets/Zagruzka-BZ2x8xwf.js","/assets/ZagruzkaCell-DYEbEk7A.js","/assets/api-BSpGBFUO.js","/assets/archive-Bbafd6AY.js","/assets/archive-restore-CnZPd4Ia.js","/assets/arrow-down-B5jLt1cb.js","/assets/arrow-left-C3L_yCug.js","/assets/arrow-right-left-BjbdGmhB.js","/assets/arrow-up-BJPjtSxE.js","/assets/arrow-up-narrow-wide-B2LwZfyi.js","/assets/arrow-up-right-HK5-xqKk.js","/assets/award-B8LehJBx.js","/assets/ban-DcJypww9.js","/assets/bot-Mvk4p-nN.js","/assets/boxes-DLa6IvGo.js","/assets/brigadirFilters-CfxNjz2Q.js","/assets/broadcastTree-B4BAXHky.js","/assets/building-2-BHV1ccEb.js","/assets/calendar-BYn_FQw7.js","/assets/calendar-days-SB59mVC5.js","/assets/calendar-range-DwUOsczl.js","/assets/camera-CalN-K9B.js","/assets/categories-DwqAqNn4.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Du_HhZ9N.js","/assets/chart-line-CWcV9SWJ.js","/assets/chart-pie-D9AMDG_4.js","/assets/chartRange-DcTX3yW6.js","/assets/chevron-left-Bm3dk3jC.js","/assets/chevrons-up-down-CpaYd6bh.js","/assets/circle-B-wDDRo1.js","/assets/circle-alert-CvCzSpbk.js","/assets/circle-check-big-CfIRmQ3d.js","/assets/circle-minus-DRsZtUzr.js","/assets/circle-slash-HXpI-qBN.js","/assets/circle-user-round-DQwj2C7L.js","/assets/cloud-off-DidB7C7X.js","/assets/cloud-upload-C1G5mSQu.js","/assets/compass-DP28h0ns.js","/assets/concernCategories-C7qTfiO8.js","/assets/copy-DzdfteU1.js","/assets/corner-down-right-BCSh2MD8.js","/assets/createLucideIcon-BMyckcg7.js","/assets/es-DmaP5clc.js","/assets/exportXlsx-DkMNlW2L.js","/assets/external-link-Dae4klQN.js","/assets/file-clock-6nmBoEJu.js","/assets/file-exclamation-point-7sMzVzgu.js","/assets/file-spreadsheet-Cp3QZwcq.js","/assets/file-text-CEChRBWj.js","/assets/flag-CtEfCQlu.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-B2_Gx3eM.js","/assets/hash-DgoGkmfQ.js","/assets/history-BRxoMCnM.js","/assets/hourglass-DxcVdzgE.js","/assets/id-card-BobtFpz5.js","/assets/image-CKjRiheC.js","/assets/image-off-C8-mVdD6.js","/assets/inbox-CluLHLNm.js","/assets/index-CHdMEsRM.js","/assets/index-S0I328RS.css","/assets/key-round-BLNQQE63.js","/assets/keyboard-BRI8RI4-.js","/assets/languages-DaU1d38-.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-3z2SJvqE.js","/assets/lightbulb-BwDrbucc.js","/assets/link-2-DTcDiEnK.js","/assets/link-2-off-CR1HdXQu.js","/assets/list-ordered-D0Z_jk7h.js","/assets/list-tree-D1sLK7rS.js","/assets/lock-open-DeJjsezy.js","/assets/log-in-Be1V5C7G.js","/assets/maximize-2-D3YGy4-J.js","/assets/message-square-BocB-u7V.js","/assets/minimize-2-DVqJxwjJ.js","/assets/package-check-BkFOLjf3.js","/assets/paperclip-BB8RrIrk.js","/assets/pencil-DcFY88GV.js","/assets/percent-CswgTtKD.js","/assets/pin-off-DP3fJbrU.js","/assets/pin-upb1ur4B.js","/assets/play-CR5GsOTj.js","/assets/plug-zap-BtLOiguB.js","/assets/presentation-BSPBTm4x.js","/assets/prop-types-DXJaQL4N.js","/assets/radio-BdC4HzpH.js","/assets/react-apexcharts.esm-Dx7DRjJ4.js","/assets/repeat-C8h35tWl.js","/assets/rotate-ccw-CqKLcZnL.js","/assets/rotate-cw-CwlTNEPf.js","/assets/save-B9ivP_uN.js","/assets/scopeLinks-DBLXrnoh.js","/assets/scroll-text-kXKY6jgx.js","/assets/search-x-gXYcgLHs.js","/assets/segments-CrZfAIb9.js","/assets/send-BbCFFbMs.js","/assets/settings-2-C_SOexL4.js","/assets/shield-DOUUXYDs.js","/assets/shield-alert-JVUJy-4M.js","/assets/shield-check-OTrbsdur.js","/assets/shield-question-mark-BCQl5N15.js","/assets/siren-D-MGLNK3.js","/assets/snowflake-BzbpQrOI.js","/assets/split-CxbRHvX2.js","/assets/square-BgEmd1ov.js","/assets/square-check-big-BI_EkB7d.js","/assets/star-CWonRgHk.js","/assets/statusBands-Bdeg1Ego.js","/assets/store-DMYjEpCt.js","/assets/table-2-bHqQKVA9.js","/assets/table-properties-Bv0T99d5.js","/assets/tag-DSVIzxxJ.js","/assets/timer-off-CwsJLWW8.js","/assets/trending-down-D0Q0sa5i.js","/assets/trending-up-IRte1q1Q.js","/assets/undo-2-BConk8_s.js","/assets/useChartTheme-W10GcvDF.js","/assets/useElementWidth-Cmbo3w9s.js","/assets/useIsMobile-C5lgJGLM.js","/assets/useOpenParam-BDlFNa0V.js","/assets/useStatusBands-C_E9Ziku.js","/assets/useUrlScope-aGe5Jz2z.js","/assets/user-cog-FsyGuev5.js","/assets/user-dH0jcZ1g.js","/assets/user-minus-F7YzOmec.js","/assets/users-6oLAvQgo.js","/assets/video-DJ4hm3OO.js","/assets/wallet-Br51oa5H.js","/assets/warehouse-B4F4G3M_.js","/assets/x-Co53tGe4.js","/assets/zap-CTGf0ady.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
