import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import Toast from "../ui/Toast";
import Button from "../ui/Button";
import { useLang } from "../../context/LangContext";
import { useAppUpdate } from "../../hooks/useAppUpdate";
import { inAndroidApp, inTelegram } from "../../utils/session";

/**
 * «Open in the app» — the website, opened in a phone's browser on a phone that
 * has the Safia IMS Android app installed, offers to open the same page there.
 *
 * WHETHER the app is installed is the browser's answer, never a guess:
 * navigator.getInstalledRelatedApps() (Chrome on Android) matches the
 * `related_applications` entry in public/manifest.webmanifest against an
 * installed package, and only counts it when that package's own
 * `asset_statements` (android/…/strings.xml) name this site — so a sideloaded
 * copy counts, a lookalike package does not. Where the browser cannot answer
 * (Samsung Internet without the API, a desktop, iOS) nothing is shown.
 *
 * The button is an Android intent link for the SAME page, pinned to the app's
 * package: the app opens it (MainActivity takes a production address as its
 * start page), and a browser with no such app falls back to this page.
 *
 * Not inside Telegram and not inside the app itself. The app keeps a session of
 * its own, so the person may have to sign in there once.
 *
 * Closeable, and a close is remembered on this browser for a week: the person
 * who keeps using the website on purpose must not be asked on every page load.
 * The Toast template carries it (portalled, safe-area aware, top-right); while
 * the «new version» prompt holds that same corner, this one waits.
 */

/** The Android app's package (android/app/build.gradle `applicationId`). */
const APP_ID = "uz.safiacorporate.ims";
const DISMISS_KEY = "openInAppDismissedAt";
const QUIET_MS = 7 * 24 * 60 * 60 * 1000;

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return at > 0 && Date.now() - at < QUIET_MS;
  } catch {
    return false; // storage blocked — the prompt simply asks again next time
  }
}

async function appInstalled() {
  if (inTelegram() || inAndroidApp()) return false;
  if (!/Android/i.test(navigator.userAgent || "")) return false;
  if (typeof navigator.getInstalledRelatedApps !== "function") return false;
  try {
    const apps = await navigator.getInstalledRelatedApps();
    return Array.isArray(apps) && apps.some((a) => a?.platform === "play" && a?.id === APP_ID);
  } catch {
    return false; // not a top-level page, or the browser refused to say
  }
}

/** This page, in the app — or this page again where the app is missing. */
function appLink() {
  const { host, pathname, search, href } = window.location;
  return `intent://${host}${pathname}${search}#Intent;scheme=https;package=${APP_ID};`
    + `S.browser_fallback_url=${encodeURIComponent(href)};end`;
}

export default function OpenInAppPrompt() {
  const [dismissed, setDismissed] = useState(dismissedRecently);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (dismissed) return undefined;
    let live = true;
    appInstalled().then((yes) => { if (live) setInstalled(yes); });
    return () => { live = false; };
  }, [dismissed]);

  if (dismissed || !installed) return null;

  const close = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* blocked — closed for this page load only */
    }
    setDismissed(true);
  };

  return <Prompt onClose={close} />;
}

/** Split out so the build poll behind useAppUpdate runs only where the prompt can show. */
function Prompt({ onClose }) {
  const { t } = useLang();
  const { show: updateShown } = useAppUpdate();
  // Opened once: coming back to this tab afterwards should not find the same offer.
  const [opened, setOpened] = useState(false);

  const open = () => {
    setOpened(true);
    window.location.href = appLink();
  };

  return (
    <Toast
      open={!updateShown && !opened}
      tone="info"
      icon={Smartphone}
      duration={0}
      closable
      onClose={onClose}
      message={
        <span className="block">
          <span className="block">{t("ui.openInApp.text")}</span>
          <span className="block mt-2">
            <Button variant="primary" size="sm" onClick={open}>
              {t("ui.openInApp.open")}
            </Button>
          </span>
        </span>
      }
    />
  );
}
