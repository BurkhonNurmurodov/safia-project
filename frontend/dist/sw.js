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

const BUILD = "2026-10-07T06:57:46.285Z";
const PRECACHE = ["/","/assets/AdminPanel-D8xNFV0w.js","/assets/AnalysisBoard-LEbWFb-n.js","/assets/Arc-B5LM-rGi.js","/assets/Assistant-CXUbdXJb.js","/assets/BrigadirProfile-BADNGc4M.js","/assets/BroadcastReceivers-ChdkhydM.js","/assets/BroadcastRecord-tXi_7Has.js","/assets/Button-DXF2VPsj.js","/assets/CatLockNotice-DbU04JQy.js","/assets/CategoryLegendModal-OaHAxWlk.js","/assets/CellConcerns-Cb3Q9SEu.js","/assets/CellDetails-DkMUkO6r.js","/assets/CellFormModal-DPsp33lM.js","/assets/CellIdent-DjUu9PzZ.js","/assets/CellLink-CPMs0xKU.js","/assets/Cells-BbyfVnb_.js","/assets/ColumnFilter-CKDDPHT5.js","/assets/ColumnsPicker-Cv2keRuZ.js","/assets/CommentsModal-jUTQ3Waf.js","/assets/ComparisonTable-DAA4ZeKF.js","/assets/Concerns-CpsL4LYr.js","/assets/Daily-CA75A2l4.js","/assets/DataTable-WBRaS3_c.js","/assets/DateRangePicker-B2oCNzJM.js","/assets/DayReportView-Dd-2ZKWO.js","/assets/DayStepper-Dy7L0out.js","/assets/DifferenceBreakdown-f6p5Tex8.js","/assets/Downtime-sCLLt4bn.js","/assets/Education-4pHhMe5h.js","/assets/EducationLesson-zyZ-BYOO.js","/assets/EmptyState-Oxx7aMTk.js","/assets/Exam-hrfpcvDM.js","/assets/FactorySelect-CoJ98odE.js","/assets/Gamification-BeNnc2SI.js","/assets/GroupBadge-C5FZOJAx.js","/assets/HeatmapChart-QKEtBEXw.js","/assets/IdleCell-DcVb6EtY.js","/assets/KPICard-CW5mjZKj.js","/assets/Kaizen-BeRLHIGl.js","/assets/Kelish-DVYpbN88.js","/assets/KpiDeltaCard-DFMrObfK.js","/assets/LangTextInput-Bml4c-kE.js","/assets/Layout-D6VV-jKd.js","/assets/LeaderAppeal-D370J06A.js","/assets/LeaderDayReport-CLvaJFfp.js","/assets/LeaderUnitReport-WVs24wCy.js","/assets/Leaderboard-DkJkWHqj.js","/assets/Leaders-BBS7IYjW.js","/assets/Lightbox-8abX7FEC.js","/assets/LiveOverview-BmRrFjVv.js","/assets/Login-BU7IUtC_.js","/assets/NotFound-1w0aJQ7O.js","/assets/Notifications-B4UiCPqE.js","/assets/Overview-B0B7LWHo.js","/assets/Pagination-DPS25gvL.js","/assets/PerenaladkaFactTable-0f5_8GAQ.js","/assets/PersonCard-BT5tiZ90.js","/assets/PlanFulfillment-Cm4C5217.js","/assets/Production-CYY_S8H1.js","/assets/Profile-De2eZHba.js","/assets/ProofCamera-Cd64ff_0.js","/assets/ProofPhoto-Cdb3PF0T.js","/assets/Quality-CGegv2KV.js","/assets/RawRows--TSXEJo1.js","/assets/RequestStateChip-jxgqyFTi.js","/assets/RichTextEditor-DkRn8BuH.js","/assets/SaveState-CHJX8Cb5.js","/assets/SearchInput-CDI9-YNR.js","/assets/SeasonalityHeatmap-D3LUIxko.js","/assets/SegmentedToggle-BcsGm8AB.js","/assets/SetupTimes-COzicjeH.js","/assets/ShiftDaily-wPWgVu-x.js","/assets/Staff-m6ndBnef.js","/assets/StatusBadge-5Qtv-OyY.js","/assets/TargetGoal-DTBK65tI.js","/assets/Targets-p028QxqP.js","/assets/Tasks-aC5ND9Ut.js","/assets/TimeWheelPicker-DUSYO3jY.js","/assets/Toast-DkzfXjUK.js","/assets/Tooltip-DRWkAo9G.js","/assets/TrendChart-C5GA-e27.js","/assets/TripleSpeedometer-D6OJxX8M.js","/assets/Trudoyomkost-C9tYfptn.js","/assets/Turnover-CxTJJQin.js","/assets/UploadDropzone-CGmKlzrb.js","/assets/UsersActivity-DObbrNdt.js","/assets/VerdictBlock-BcoJImL5.js","/assets/VfxApiMap-B_O9LbUy.js","/assets/VfxDictionaries-BRUJBquM.js","/assets/VfxEmployees-JLQlJNRU.js","/assets/VfxHrMoves-DJHwE9J_.js","/assets/VfxJobs-DwTg9VNK.js","/assets/VfxPhoto-B9ALiZpE.js","/assets/VfxShifts-D4RuVN6b.js","/assets/VfxState-Bkg0X20o.js","/assets/VfxTimebooks-CetALY5B.js","/assets/VfxTimesheet-BSR1q2Wx.js","/assets/WatchProgress-CUZLxibh.js","/assets/WebLogin-DdNpR5-B.js","/assets/WorkerConcerns-BWmYlLbk.js","/assets/Workers-Cwc3EMp4.js","/assets/Zagruzka-DY7PLu19.js","/assets/ZagruzkaCell-CNsnn93v.js","/assets/api-D20DkVLE.js","/assets/archive-DRnsBlVF.js","/assets/archive-restore-DpYY5RPq.js","/assets/arrow-down-BdZhYOnd.js","/assets/arrow-up-narrow-wide-DuhaX653.js","/assets/award-3pNkDfBo.js","/assets/ban-DlbgC-o5.js","/assets/boxes-BVFO0AI9.js","/assets/braces-K3UIrxFr.js","/assets/brigadirFilters-BNL-I3U5.js","/assets/broadcastTree-CqqDUGh4.js","/assets/building-2-DJbYaGOv.js","/assets/calculator-Ch4yMYnz.js","/assets/calendar-CZMQC5Dl.js","/assets/calendar-days-CJgjn28M.js","/assets/camera-DRIOF6UV.js","/assets/categories-CFgr8gX_.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C9Y1bDOZ.js","/assets/chart-line-DyVRChG-.js","/assets/chart-pie-Lk_0CZP8.js","/assets/chartRange-BmuEAbQM.js","/assets/check-check-BKSEbLHL.js","/assets/chevron-left-BA8vrtZV.js","/assets/chevrons-up-down-bBCB3K4d.js","/assets/circle-BV1945Ir.js","/assets/circle-alert-DCxccrQr.js","/assets/circle-check-big-B_0kq9XC.js","/assets/circle-dashed-CHFySKmH.js","/assets/circle-minus-DEaduRqv.js","/assets/circle-question-mark-BOYX-cNB.js","/assets/circle-slash-DMwAMdfn.js","/assets/circle-user-round-B2kuH_pk.js","/assets/clock-3-BWdvjHkY.js","/assets/cloud-off-sSbKSzLE.js","/assets/cloud-upload-Bmrd2mii.js","/assets/compass-utlNsL28.js","/assets/concernCategories-DBM7SGYD.js","/assets/copy-B0r2XY7u.js","/assets/corner-down-right-BVbxHJ0c.js","/assets/createLucideIcon-CDulwlze.js","/assets/es-B6rf6BhJ.js","/assets/external-link-Dmx3VMTq.js","/assets/file-clock-ZRvffspr.js","/assets/file-exclamation-point-Cbh8RmVm.js","/assets/flag-DeIUyBZo.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-lGGgykbN.js","/assets/hash-DbovbrTd.js","/assets/hourglass-BX86lFlU.js","/assets/image-Bx42chFK.js","/assets/image-off-DAwpW0hJ.js","/assets/inbox-CjUDWugK.js","/assets/index-B7yzqq84.css","/assets/index-D17c2pkP.js","/assets/keyboard-DYuMz3WH.js","/assets/languages-WM4M1Oco.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DWXYouok.js","/assets/lightbulb-Dt3gvsuH.js","/assets/link-2-CP59RLBK.js","/assets/link-2-off-D7yLjZ6f.js","/assets/list-ordered-BQm04SG4.js","/assets/list-tree-CqLM-SK6.js","/assets/lock-open-CP41kE6X.js","/assets/log-in-CieT7OXa.js","/assets/minimize-2-CZMdHvPw.js","/assets/package-check-DIu55KFo.js","/assets/pencil-D6-N3_xf.js","/assets/percent-etx6zBE9.js","/assets/pin-C35xbDUf.js","/assets/pin-off-C7KCDt2d.js","/assets/play-D6PLAI9t.js","/assets/plug-zap-DnC-bGXj.js","/assets/prop-types-B-7m39gQ.js","/assets/radio-Q2fxtjH1.js","/assets/react-apexcharts.esm-BYUQ7C8h.js","/assets/registers-CMQyJCck.js","/assets/repeat-D6jaxhA8.js","/assets/save-DtzFijZY.js","/assets/scopeLinks-pRKYAYv1.js","/assets/scroll-text-01DSS-Xl.js","/assets/search-x-nFqEo07i.js","/assets/segments-n0riOCke.js","/assets/send-BfS3JDDD.js","/assets/settings-2-Cy6o5Sxj.js","/assets/shield-Dvl2IAwB.js","/assets/shield-alert-vKcxK5Pc.js","/assets/shield-question-mark-DvbmVpMV.js","/assets/siren-BncOXfw6.js","/assets/snowflake-esNoXVpe.js","/assets/split-IKo7Vf1f.js","/assets/square-check-big-BRfozykv.js","/assets/star-BNTlcMAq.js","/assets/statusBands-E1IAVwaa.js","/assets/store-B-QhV_St.js","/assets/table-2-B-dHJiLA.js","/assets/table-properties-CU6zWCiM.js","/assets/tag-5rTWKAhm.js","/assets/timer-off-CKrvOYRj.js","/assets/trending-down-9dgLSmMf.js","/assets/trending-up-BuTqFDSH.js","/assets/undo-2-BTKwvhB1.js","/assets/useChartTheme-CqB69lXc.js","/assets/useElementWidth-BaPbCQIN.js","/assets/useIsMobile-I3MiRsDW.js","/assets/useOpenParam-NHTmdGu_.js","/assets/useStatusBands-DOCxqwGm.js","/assets/useUrlScope-BxrBm63b.js","/assets/user-DGrh5lZN.js","/assets/user-cog-9-ySUMc5.js","/assets/users-AmidCPMm.js","/assets/vfx-CQ4ifwO1.js","/assets/video-DXIkjXWu.js","/assets/wallet-CrBPFZye.js","/assets/warehouse-DvTMDC4x.js","/assets/x-Brb-Bv6X.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
