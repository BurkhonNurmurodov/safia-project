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

const BUILD = "2026-10-04T19:33:21.721Z";
const PRECACHE = ["/","/assets/AdminPanel-BuU7TV9o.js","/assets/AnalysisBoard-C7-pIO7K.js","/assets/Arc-xaO9LuMx.js","/assets/ArcLegacy-DdeUXJ7G.js","/assets/BrigadirProfile-Ca26gKsa.js","/assets/BroadcastReceivers-Btp24Glh.js","/assets/BroadcastRecord-CAIgbRQQ.js","/assets/CatLockNotice-Do_ApHv1.js","/assets/CategoryLegendModal-D1FkUFrh.js","/assets/CellConcerns-BVqXnrKn.js","/assets/CellDetails-CBwCYREy.js","/assets/CellFormModal-BfNWQaFe.js","/assets/CellIdent-BIyJrkye.js","/assets/CellLink-AymS6o3u.js","/assets/Cells-CbCpc4Du.js","/assets/ColumnFilter-R9MsV-Q1.js","/assets/ColumnsPicker-BQzR59j3.js","/assets/CommentsModal-D4Iv0sNI.js","/assets/ComparisonTable-CEUQhier.js","/assets/Concerns-BmhoElsE.js","/assets/ConfirmDialog-CBgh-byW.js","/assets/Daily-_TX23qcs.js","/assets/DataTable-BzVThpfC.js","/assets/DateRangePicker-D4jvGaWx.js","/assets/DayReportView-JnWTfKoO.js","/assets/DayStepper-DHWyIFCu.js","/assets/DifferenceBreakdown-EZs74NvZ.js","/assets/Downtime-VaYGeJeo.js","/assets/Education-dpGLhxgu.js","/assets/EducationLesson-BPLQVSOe.js","/assets/EmptyState-BGVcr1Aw.js","/assets/Exam-xgK2izAa.js","/assets/FactorySelect-Cd05e0QP.js","/assets/Gamification-BaRa9LIb.js","/assets/GroupBadge-B_M2RN_j.js","/assets/HeatmapChart-BkGh2PYG.js","/assets/IdleCell-DxzEoRaP.js","/assets/KPICard-CgIlkv2q.js","/assets/Kaizen-C5XJdwyG.js","/assets/Kelish-CkQZ13Ld.js","/assets/KpiDeltaCard-D_Ci7x_1.js","/assets/LangTextInput-BjlP7iFp.js","/assets/Layout-BfN61ktd.js","/assets/LeaderAppeal-CJu6gFZD.js","/assets/LeaderDayReport-YuaGNtL7.js","/assets/LeaderUnitReport-Br9zwt6O.js","/assets/Leaderboard-C9dAxDmk.js","/assets/Leaders-Conoyd15.js","/assets/Lightbox-CMZ770jw.js","/assets/LiveOverview-D9Hmyqj_.js","/assets/Login-CVVdazYT.js","/assets/NotFound-DHrlQnr4.js","/assets/Notifications-DxR_PVki.js","/assets/Overview-B62WlFQk.js","/assets/Pagination-CX_l-XoD.js","/assets/PerenaladkaFactTable-CvFAOEqB.js","/assets/PersonCard-DFiWYx91.js","/assets/PlanFulfillment-BNd_Fj54.js","/assets/Production-Ce12r0EQ.js","/assets/Profile-Dpw5JxnE.js","/assets/ProofCamera-Sh9PplOv.js","/assets/ProofPhoto-YvCAhOD6.js","/assets/Quality-CuJTBx-J.js","/assets/RawRows-Z6jUt3eb.js","/assets/RequestStateChip-BQdkPHEO.js","/assets/RichTextEditor-DsNCXwa1.js","/assets/SaveState-C0N99Lwa.js","/assets/SearchInput-ICxb2i25.js","/assets/SeasonalityHeatmap-CDRpL8J0.js","/assets/SegmentedToggle-liCbJvX3.js","/assets/SetupTimes-CHn-r4KD.js","/assets/ShiftDaily-BZk8LihH.js","/assets/Staff-CRDua0PQ.js","/assets/StaffLive-BLh1SKf_.js","/assets/StatusBadge-Isw3hVUL.js","/assets/TargetGoal-BfpTMcKc.js","/assets/Targets-DK7x97DK.js","/assets/Tasks-D83xvcLt.js","/assets/TimeWheelPicker-CvjXhoIk.js","/assets/Toast-CEDopRkg.js","/assets/Tooltip-z4AlW3ke.js","/assets/TrendChart-DBdQW1bg.js","/assets/TripleSpeedometer-BRD9n9Jr.js","/assets/Trudoyomkost-C_BaY_qM.js","/assets/Turnover-CuY-ZWsI.js","/assets/UploadDropzone-DecxWaT4.js","/assets/UsersActivity-DxP252-m.js","/assets/VerdictBlock-DSsozhVC.js","/assets/VfxApiMap-Dz6LZKsy.js","/assets/VfxDictionaries-COcpCFrb.js","/assets/VfxEmployees-BoqR7HMn.js","/assets/VfxHrMoves-B5Ies2eN.js","/assets/VfxJobs--NNUU3Rl.js","/assets/VfxPhoto-DepxzTD_.js","/assets/VfxShifts-BalB3hP6.js","/assets/VfxState-CotnRKds.js","/assets/VfxTimebooks-vSdgEFJh.js","/assets/VfxTimesheet-DF_6i2lm.js","/assets/WatchProgress-2X0AuC0C.js","/assets/WebLogin-BcSklaxj.js","/assets/WorkerConcerns-BpCmOS_n.js","/assets/Workers-Bx3HT7ax.js","/assets/Zagruzka-CXFk1XWd.js","/assets/ZagruzkaCell-Dbir6mwp.js","/assets/api-CADTsvon.js","/assets/archive-_8pn2uXv.js","/assets/archive-restore-Cxi1vRG2.js","/assets/arrow-down-0gM61Hyj.js","/assets/arrow-left-Cfvx_xfO.js","/assets/arrow-up-C6Hv_Wkx.js","/assets/arrow-up-narrow-wide-BKEcQOUB.js","/assets/arrow-up-right-jkhkLYda.js","/assets/award-D-YqaRjG.js","/assets/ban-DuqglbOm.js","/assets/book-open-wz1OvXSM.js","/assets/bot-DtzXoUsc.js","/assets/boxes-BjgRdepf.js","/assets/braces-C9eJpeER.js","/assets/brigadirFilters-CoCPDzz6.js","/assets/broadcastTree-35ZWoXFg.js","/assets/building-2-D8Twm-Lz.js","/assets/calculator-DNdYHuAm.js","/assets/calendar-CDprkZQ1.js","/assets/calendar-days-BKNS216s.js","/assets/camera-xqgyTviP.js","/assets/categories-DUyN7_U5.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BFgZx-YH.js","/assets/chart-line-CjIi0im7.js","/assets/chart-pie-BsycNd8p.js","/assets/chartRange-BhW9ofxz.js","/assets/check-check-DXiUGPQt.js","/assets/chevron-left-7O66Zkvv.js","/assets/chevrons-up-down-B1NTOew3.js","/assets/circle-CiAvvgNQ.js","/assets/circle-alert-CfbrA-lT.js","/assets/circle-check-big-CwELRG09.js","/assets/circle-dashed-BgzavS-y.js","/assets/circle-minus-CSs8AYF7.js","/assets/circle-question-mark-Y0ORYYbM.js","/assets/circle-slash-CsLsBuVX.js","/assets/circle-user-round-mQ5QDtXs.js","/assets/clock-3-DKKnJ-tz.js","/assets/cloud-off-D-_yroBQ.js","/assets/cloud-upload-5QX4_iW_.js","/assets/compass-B5KXLWkv.js","/assets/concernCategories-K3RZxclq.js","/assets/copy-CFzxMZ-Y.js","/assets/corner-down-right-Cl85-hV3.js","/assets/createLucideIcon-DIgXfk6S.js","/assets/es-Pllqph-Y.js","/assets/exportXlsx-CwkeboSn.js","/assets/external-link-CzUjqx3c.js","/assets/file-clock-C4ReOaYp.js","/assets/file-exclamation-point-B2ATUp3Y.js","/assets/file-spreadsheet-mhOdtfvB.js","/assets/file-text-BQLuenTR.js","/assets/flag-Gd-uuCJX.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BbPWspeL.js","/assets/hash-Dh0s03He.js","/assets/history-DLgT-ZEE.js","/assets/hourglass-DV1oNbmV.js","/assets/image-DS4IJU2n.js","/assets/image-off-BPtbxIun.js","/assets/inbox-DrFiHZn0.js","/assets/index-B_6Pcyfl.js","/assets/index-L3sa6CXi.css","/assets/key-round-BnSGdMJ4.js","/assets/keyboard-OzuQtdzN.js","/assets/languages-C0NDl1nS.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CQf0keuw.js","/assets/lightbulb-C6h_bxE7.js","/assets/link-2-BVcXMWPR.js","/assets/link-2-off-KWsi30Ts.js","/assets/list-ordered-CBCWDJia.js","/assets/list-tree-do8j_VOo.js","/assets/lock-open-weEOK5NW.js","/assets/log-in-6Pw-HN0r.js","/assets/maximize-2-BGjggb5L.js","/assets/message-square-CnLkfjdU.js","/assets/minimize-2-BKqpGR07.js","/assets/package-check-CoQ2lOQr.js","/assets/paperclip-BRlq2Ztt.js","/assets/pencil-DEnhqOhM.js","/assets/percent-viuv65PA.js","/assets/pin-CllhuB1x.js","/assets/pin-off-SNC88RW2.js","/assets/play-ISV0Oq_8.js","/assets/plug-zap-QL21sdi3.js","/assets/presentation-jAvcz2UX.js","/assets/prop-types-D_IdV0DC.js","/assets/radio-C-7Vtbf4.js","/assets/react-apexcharts.esm-BKhyyE2F.js","/assets/registers-BaVQplhb.js","/assets/repeat-CDdel8Tu.js","/assets/rotate-ccw-_NX6EThh.js","/assets/rotate-cw-C5s_nEBS.js","/assets/save-D4wl14YE.js","/assets/scopeLinks-ow5tKmL_.js","/assets/scroll-text-CKTOf_FM.js","/assets/search-x-CT6z7J_j.js","/assets/segments-PYyVCGAY.js","/assets/send-COlw0zgS.js","/assets/settings-2-qYz2pn9L.js","/assets/shield-BeSrE7cu.js","/assets/shield-alert-Bn0hrBTQ.js","/assets/shield-check-DD-UhhyM.js","/assets/shield-question-mark-6_2M82Jr.js","/assets/siren-CdbMw7SU.js","/assets/snowflake-DrOSeXL1.js","/assets/split-CKbINlOt.js","/assets/square-CVq-VbZj.js","/assets/square-check-big-C2Jgz39Y.js","/assets/star-C8QNXuBa.js","/assets/statusBands-Dk6KTrb0.js","/assets/store-BBV2TJPA.js","/assets/table-2-CSHEOqSW.js","/assets/table-properties-BubEDHkz.js","/assets/tag-CkIO3Lvl.js","/assets/timer-off-DQleCIk_.js","/assets/trending-down-Iv0fZVuG.js","/assets/trending-up-ZfkP5BSd.js","/assets/undo-2-BoCHfH-V.js","/assets/useChartTheme-Dx6zlwHh.js","/assets/useElementWidth-D0pHuslw.js","/assets/useIsMobile-Co5QbeJz.js","/assets/useOpenParam-BWfdMLV0.js","/assets/useStatusBands-CW0F36YQ.js","/assets/useUrlScope-DtoXCt25.js","/assets/user-Oiho1Eg-.js","/assets/user-cog-2rwxcVZg.js","/assets/users-GcrpcCu3.js","/assets/vfx-TccPfQas.js","/assets/video-y71cFJO2.js","/assets/wallet-deFI2ZhV.js","/assets/warehouse-BBYBgkkb.js","/assets/x-BcuRSj3R.js","/assets/zap-Dud4mx1g.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
