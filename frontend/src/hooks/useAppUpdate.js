import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BUILD_TIME } from "../utils/version";
import { isOutdated, subscribeCompat } from "../utils/compat";
import { updateWorker } from "../utils/pwa";
import { inAndroidApp } from "../utils/session";
import { apkPercent, pagesAsk, usePagesState } from "../utils/androidUpdate";

/**
 * Is the tab running an older build than the one deployed?
 *
 * A push to main deploys immediately, and this app is left OPEN for whole
 * shifts — a phone in a pocket, a browser tab on a desk — so a session can sit
 * several deploys behind without anything saying so. The reactive half of that
 * problem is already handled: `lazyWithReload` in App.jsx catches a lazy chunk
 * that 404s and hands off to `window.__staleReload`. But that only fires once
 * the app is ALREADY broken, and only for a route the user happens to open.
 * This is the proactive half: notice the new build first, and let the user
 * choose the moment.
 *
 * The comparison is the frontend BUILD STAMP, not the version number: VERSION
 * is bumped by hand for releases, while every deploy produces a new build. The
 * stamp in `dist/build.json` is written by the same build that produced the
 * bundle, so "mine ≠ deployed" is exact — no ordering, no heuristics, and a
 * rollback (deployed stamp older than mine) reads as an update too, which is
 * correct: reloading is still what puts the user on the deployed build.
 *
 * It never reloads on its own. Attendance drafts, admin forms and comment
 * boxes are all unsaved state a surprise reload would throw away.
 *
 * The stamp answers "is there something newer?", which is a suggestion. It
 * cannot answer "does the server still serve ME?", which is not — and those
 * two need different words on screen, because one can be waved away for the
 * rest of the shift and the other cannot. `incompatible` is the second
 * question, answered by the server itself on the headers of every API response
 * (see utils/compat.js). It rides the same hook so ONE component decides what
 * the user is told, rather than two prompts arguing on top of each other.
 */

const DISMISS_KEY = "appUpdateDismissed";

function readDismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) || "";
  } catch {
    return ""; // storage blocked (private mode / locked-down WebView)
  }
}

export function useAppUpdate({ pollMs = 5 * 60 * 1000 } = {}) {
  const [dismissed, setDismissed] = useState(readDismissed);

  // Set by the axios interceptor the first time the server says this bundle is
  // below its floor. Read once at mount as well: the verdict may already have
  // landed before this component existed.
  const [incompatible, setIncompatible] = useState(isOutdated);
  useEffect(() => subscribeCompat(setIncompatible), []);

  const { data, refetch } = useQuery({
    queryKey: ["build-info"],
    queryFn: async () => {
      // Busted on both sides: `no-store` covers the browser, the changing query
      // string covers anything in front of it — the host's anti-bot layer has
      // pinned stale responses to stable URLs before (see the logo incident).
      const res = await fetch(`/build.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`build.json ${res.status}`);
      return res.json();
    },
    // Dev serves no build.json, and a bundle with no stamp of its own has
    // nothing to compare against — don't poll for an answer we couldn't use.
    enabled: Boolean(BUILD_TIME),
    refetchInterval: pollMs,
    // The one that matters in Telegram: the mini-app is backgrounded and
    // reopened far more often than it is left in the foreground for 5 minutes.
    refetchOnWindowFocus: true,
    // A missing or anti-bot-mangled marker is a non-answer, not an error worth
    // retrying — stay quiet and try again on the next interval.
    retry: false,
    staleTime: 60_000,
  });

  // The Android app downloads a newly deployed build in the background and
  // fires this the moment it has all of it (android/…/PageUpdates.java), so the
  // prompt does not wait for the next poll. Nothing else fires it.
  useEffect(() => {
    const check = () => {
      if (BUILD_TIME) refetch();
    };
    window.addEventListener("safia-build-check", check);
    return () => window.removeEventListener("safia-build-check", check);
  }, [refetch]);

  const deployed = typeof data?.buildTime === "string" ? data.buildTime : "";
  const updateReady = Boolean(deployed && BUILD_TIME && deployed !== BUILD_TIME);

  // In the Android app /build.json above is answered by the PHONE from the
  // builds it already holds, so it names a deploy only once the whole build has
  // downloaded. The server's own answer comes from a server path the phone
  // never answers (routers/android.py `/pages`): a newer stamp there, with
  // nothing held yet, means the app is fetching it — say so now, and offer the
  // reload only once `updateReady` (a reload before that lands on the old pages).
  const inApp = inAndroidApp();
  const { data: liveData, refetch: refetchLive } = useQuery({
    queryKey: ["live-build"],
    queryFn: async () => {
      const res = await fetch(`/api/android/pages?t=${Date.now()}`, { cache: "no-store", credentials: "omit" });
      if (!res.ok) throw new Error(`pages ${res.status}`);
      return res.json();
    },
    enabled: Boolean(BUILD_TIME) && inApp,
    refetchInterval: pollMs,
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: 60_000,
  });
  const live = inApp && typeof liveData?.buildTime === "string" ? liveData.buildTime : "";
  const coming = Boolean(live && BUILD_TIME && live !== BUILD_TIME && !updateReady);

  // 1.8.0+ reports the download itself (PageUpdates.java): a percent while it
  // runs, «failed» when it broke off. Older apps answer nothing (null).
  const pagesApp = usePagesState();
  const comingPct = coming && (pagesApp?.phase === "downloading" || pagesApp?.phase === "ready")
    ? apkPercent(pagesApp) : null;
  const comingFailed = coming && pagesApp?.phase === "failed";
  // The page saw the new build first: the app starts on it now instead of at
  // its next five-minute check. Once per build.
  useEffect(() => {
    if (coming) pagesAsk("check");
  }, [coming, live]);

  // A newer build is deployed: tell the service worker (browsers only; a no-op
  // where none is registered) to fetch its new copy now, so the new build is
  // precached BEFORE the user presses reload rather than during it.
  useEffect(() => {
    if (updateReady) updateWorker();
  }, [updateReady]);

  // Dismissal is per deployed build, so "later" silences THIS update and the
  // next deploy still gets to speak up. sessionStorage, not local: a fresh tab
  // is a fresh chance to land on the current build.
  const dismiss = useCallback(() => {
    if (!deployed) return;
    try {
      sessionStorage.setItem(DISMISS_KEY, deployed);
    } catch {
      /* storage blocked — the prompt simply reappears next mount */
    }
    setDismissed(deployed);
  }, [deployed]);

  // The «coming» notice is waved away under its own mark, so closing it never
  // silences the «ready — reload» that follows for the same build.
  const comingMark = live ? `coming:${live}` : "";
  const dismissComing = useCallback(() => {
    if (!comingMark) return;
    try {
      sessionStorage.setItem(DISMISS_KEY, comingMark);
    } catch {
      /* storage blocked — the notice simply reappears next mount */
    }
    setDismissed(comingMark);
  }, [comingMark]);

  /** Ask now: both the phone's held build and, in the app, the server's live one. */
  const checkNow = useCallback(() => {
    if (!BUILD_TIME) return;
    refetch();
    if (inApp) refetchLive();
    pagesAsk("check");
  }, [refetch, refetchLive, inApp]);

  const reload = useCallback(() => {
    window.location.reload();
  }, []);

  return {
    deployed,
    deployedVersion: typeof data?.version === "string" ? data.version : "",
    updateReady,
    /** The server no longer serves this bundle — not dismissible, not a hint. */
    incompatible,
    /**
     * Incompatible ALWAYS shows: it outranks a dismissal, and it does not wait
     * on the build.json poll, which a locked-down WebView may never answer.
     * Otherwise: updateReady AND not already waved away for this same build.
     */
    show: incompatible || (updateReady && dismissed !== deployed),
    dismiss,
    reload,
    /** App only: a newer build is live and the phone does not hold it yet. */
    coming,
    comingVersion: coming && typeof liveData?.version === "string" ? liveData.version : "",
    /** 1.8.0+ only: the download's whole percent, or null when the app says nothing. */
    comingPct,
    comingGot: comingPct === null ? 0 : Number(pagesApp?.got) || 0,
    comingTotal: comingPct === null ? 0 : Number(pagesApp?.total) || 0,
    /** 1.8.0+ only: the last attempt broke off (the app tries again by itself). */
    comingFailed,
    showComing: coming && !incompatible && dismissed !== comingMark,
    dismissComing,
    checkNow,
  };
}

export default useAppUpdate;
