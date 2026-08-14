import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BUILD_TIME } from "../utils/version";

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

  const { data } = useQuery({
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

  const deployed = typeof data?.buildTime === "string" ? data.buildTime : "";
  const updateReady = Boolean(deployed && BUILD_TIME && deployed !== BUILD_TIME);

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

  const reload = useCallback(() => {
    window.location.reload();
  }, []);

  return {
    deployed,
    deployedVersion: typeof data?.version === "string" ? data.version : "",
    updateReady,
    /** updateReady AND not already waved away for this same build. */
    show: updateReady && dismissed !== deployed,
    dismiss,
    reload,
  };
}

export default useAppUpdate;
