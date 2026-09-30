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

const BUILD = "2026-09-30T14:20:26.533Z";
const PRECACHE = ["/","/assets/AdminPanel-Cam6ZRAa.js","/assets/AnalysisBoard-PTnCxjYm.js","/assets/Arc-B7gxhR2F.js","/assets/ArcLegacy-LFE-IPka.js","/assets/AttendanceModal-Dl-VbHlm.js","/assets/BrigadirProfile-DzrSUWor.js","/assets/BroadcastReceivers-BDBBHFPw.js","/assets/BroadcastRecord-UW60CPIK.js","/assets/CatLockNotice-tJQeQru5.js","/assets/CategoryLegendModal-DMfBKUVo.js","/assets/CellConcerns-C49Ydi89.js","/assets/CellDetails-CagKhKaH.js","/assets/CellFormModal-BBSII7Se.js","/assets/CellLink-CVaAN63c.js","/assets/Cells-C5V5Ssfi.js","/assets/ColumnFilter-C8pzlOIC.js","/assets/ColumnsPicker-BM51riZF.js","/assets/CommentsModal-Bkgvn0St.js","/assets/ComparisonTable-BCIe-w2p.js","/assets/Concerns-ClEK8pAY.js","/assets/ConfirmDialog-C5Oq4QW_.js","/assets/Daily-CShhlVYH.js","/assets/DataTable-CQoBd98_.js","/assets/DateRangePicker-C49-NrU6.js","/assets/DayReportView-DCEqTQN4.js","/assets/DayStepper-BR7NH2z0.js","/assets/DifferenceBreakdown-DcLHexVs.js","/assets/Downtime-Cz3Sh34t.js","/assets/Education-b5gseBVF.js","/assets/EducationLesson-CscX5EPy.js","/assets/EmptyState-BGMs3pVx.js","/assets/Exam-5gUJUNE8.js","/assets/FactorySelect-Ywo9dBqI.js","/assets/Gamification-B7F6LV2w.js","/assets/GroupBadge-DCxZlQOD.js","/assets/HeatmapChart-C61HYRme.js","/assets/IdleCell-DVac_F9e.js","/assets/KPICard-Bpepgkh4.js","/assets/Kaizen-FKGawDpi.js","/assets/Kelish-CzzlLDHN.js","/assets/KpiDeltaCard-DFgzBZlW.js","/assets/LangTextInput-CpUYg21S.js","/assets/Layout-B8a0K-Vd.js","/assets/LeaderAppeal-DE0PkGh8.js","/assets/LeaderDayReport-8-IKDCK2.js","/assets/LeaderUnitReport-zm8NA3Wu.js","/assets/Leaderboard-ZDIWIq8l.js","/assets/Leaders-BW9_vncM.js","/assets/Lightbox-BPwbgTOX.js","/assets/LiveOverview-Cg8m8hd9.js","/assets/Login-CaTPZsJE.js","/assets/NotFound-Plw_jwW6.js","/assets/Overview-Dws_iY_-.js","/assets/Pagination-DllYjgcq.js","/assets/PerenaladkaFactTable-C4g7uf0i.js","/assets/PlanFulfillment-CcjZKYPl.js","/assets/Production-CZjEbOSx.js","/assets/Profile-DkL_1JqW.js","/assets/ProofCamera-CAVVSszu.js","/assets/ProofPhoto-CGdiep51.js","/assets/Quality-D-6CokKA.js","/assets/RequestStateChip-BN6r-5w3.js","/assets/RichTextEditor-CUwBNyGu.js","/assets/SaveState-BCQxrNgL.js","/assets/SearchInput-RztizM6c.js","/assets/SeasonalityHeatmap-3Ykbxeyc.js","/assets/SegmentedToggle-DiLD0Mea.js","/assets/SetupTimes-DzEyZEIh.js","/assets/ShiftDaily-ChPC-3O9.js","/assets/Staff-BH7dqxGZ.js","/assets/StatusBadge-Ds9AeFYM.js","/assets/TargetGoal-2vH_Yrjd.js","/assets/Targets-Dauwa5CV.js","/assets/Tasks-BDFEh3Sm.js","/assets/TimeWheelPicker-Vw0P7wwl.js","/assets/Tooltip-C8duRWd4.js","/assets/TrendChart-BPhQNCVS.js","/assets/TripleSpeedometer-ng_iGM70.js","/assets/Trudoyomkost-Ddo3ENOG.js","/assets/UploadDropzone-DALet02x.js","/assets/UsersActivity-BMo5CwiE.js","/assets/VerdictBlock-Po7GcC8i.js","/assets/WatchProgress-BM6RQUKj.js","/assets/WebLogin-Ce8KRXCT.js","/assets/WorkerConcerns-DdcUbxVU.js","/assets/Workers-Df0M-U-v.js","/assets/Zagruzka-D6mRZhjy.js","/assets/ZagruzkaCell-tz50Q-iw.js","/assets/api-XhmyjYiH.js","/assets/archive-restore-CQSDeeT2.js","/assets/archive-sikNoZEh.js","/assets/arrow-down-CLjjbXXy.js","/assets/arrow-left-B_lTiw0t.js","/assets/arrow-left-right-B6U-nZSj.js","/assets/arrow-up-BwOYCmNi.js","/assets/arrow-up-narrow-wide-TTCy3reT.js","/assets/arrow-up-right-Bw1ol1SC.js","/assets/award-CaKyOqsj.js","/assets/ban-B2OfNhMi.js","/assets/bot-DNTyKe6G.js","/assets/boxes-B8MWgBSh.js","/assets/brigadirFilters-CEWBX8yt.js","/assets/broadcastTree-BM5ZogqC.js","/assets/building-2-TxHem4cB.js","/assets/calendar-DLS_2Ldh.js","/assets/calendar-clock-Cc3UZne_.js","/assets/calendar-days-DqXpY3hF.js","/assets/calendar-range-Cn2lOJCr.js","/assets/camera-ODoceIaw.js","/assets/categories--1x163Ng.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BC_qxWFQ.js","/assets/chart-line-BCi6_bAi.js","/assets/chart-pie-DcZwdNAO.js","/assets/chartRange-BTpsv-f_.js","/assets/chevron-left-BRt9Z00h.js","/assets/chevrons-up-down-CGN4CVo1.js","/assets/circle-C4rPISpb.js","/assets/circle-check-big-Ctmn7lfd.js","/assets/circle-dot-C9bCuN7Y.js","/assets/circle-minus-DFAl3sK9.js","/assets/circle-slash-BWDyLdHq.js","/assets/circle-user-round-JAsBUsYs.js","/assets/cloud-off-CgnPsYo6.js","/assets/cloud-upload-CWpsprox.js","/assets/compass-DY5O5G9g.js","/assets/concernCategories-BPqJejl1.js","/assets/copy-BVOCyRze.js","/assets/corner-down-right-Fz_RQMaw.js","/assets/createLucideIcon-Btt6LRQu.js","/assets/es-T-cLFOMz.js","/assets/exportXlsx-BDhtLiCA.js","/assets/external-link-CEbuDsI4.js","/assets/file-clock-7t-SrTxu.js","/assets/file-exclamation-point-Mfc1krja.js","/assets/file-spreadsheet-DYVwexiv.js","/assets/file-text-8o3L1fVk.js","/assets/flag-ChgpOyD6.js","/assets/flame-DwHQAOqS.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-_Pk-fXQC.js","/assets/hash-6JPplohy.js","/assets/history-Aar5APpQ.js","/assets/hourglass-CfJGt1nA.js","/assets/image-COXjM2_w.js","/assets/image-off-DD7tg1VK.js","/assets/index-Bn5n-OZu.css","/assets/index-CpL4q4-i.js","/assets/key-round-DvkeN3zM.js","/assets/keyboard-CP6cULZF.js","/assets/languages-BL83j_cB.js","/assets/layers-DwtZuCuO.js","/assets/lightbulb-Nzl-oZLy.js","/assets/link-2-DYdbdkcW.js","/assets/link-2-off-DhCMGB_Z.js","/assets/list-checks-Bw1HrO2B.js","/assets/list-ordered-CoI6QrCY.js","/assets/list-tree-BX_jjsE1.js","/assets/lock-open-_QIAVPFC.js","/assets/log-in-O3gqAq89.js","/assets/maximize-2-DCXrWYPc.js","/assets/message-square-BcBaXdZM.js","/assets/minimize-2-BJmcJQW8.js","/assets/package-check-BJcGdezg.js","/assets/paperclip-BD-On2Ox.js","/assets/pencil-X8pTojFK.js","/assets/percent-CE67ibx0.js","/assets/personName-CogOuS3K.js","/assets/pin-Bpj3dVGM.js","/assets/pin-off-Bd51L2xg.js","/assets/play-Bz17XJpV.js","/assets/presentation-OsnSxZbs.js","/assets/prop-types-BndLEyld.js","/assets/radio-BXiFPDws.js","/assets/react-apexcharts.esm-BxeWijMe.js","/assets/repeat-BK14NVHn.js","/assets/rotate-ccw-ClII851r.js","/assets/rotate-cw-bRIWjkUG.js","/assets/save-hSJqRrxK.js","/assets/scale-CpIc12sL.js","/assets/scopeLinks-BwWBMrKf.js","/assets/scroll-text-DUDCo6O2.js","/assets/search-x-DolHjJut.js","/assets/segments-Dqd0vj-2.js","/assets/send-aNZxz4q2.js","/assets/settings-2-DEwGEkWl.js","/assets/shield-DzlaA2jh.js","/assets/shield-alert-BmUfRKlZ.js","/assets/shield-check-DDmvdVSY.js","/assets/shield-question-mark-bSHyFmAH.js","/assets/siren-PQSzJFoa.js","/assets/snowflake-De83-XF3.js","/assets/square-TNuQIasL.js","/assets/square-check-big-DpXjZjXI.js","/assets/star-CDT_7-w7.js","/assets/statusBands-D7FhlO-q.js","/assets/store-BJPxrP4E.js","/assets/table-2-BnlDEkB-.js","/assets/table-properties-ipClbAjI.js","/assets/tag-B0yfkP7W.js","/assets/timer-off-CkTHzAC6.js","/assets/trending-down-BupreOOC.js","/assets/trending-up-DNkAMFzj.js","/assets/undo-2-C2chW1S7.js","/assets/useChartTheme-B-iAz4Tf.js","/assets/useElementWidth-CAdQIPII.js","/assets/useIsMobile-D-LWpiV1.js","/assets/useMutation-mN2VXglc.js","/assets/useStatusBands-DmKyBzns.js","/assets/useUrlScope-jU3iRZw3.js","/assets/user-BB9Xm0E6.js","/assets/user-cog-dPJ4wPpw.js","/assets/user-minus-BX3pCWxr.js","/assets/users-CEqPhEhV.js","/assets/video-BiJ9MFHJ.js","/assets/wallet-CS0M8CME.js","/assets/warehouse-C_KTSIBf.js","/assets/zap-D71xwAhH.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
