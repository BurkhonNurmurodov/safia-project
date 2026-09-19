import { useEffect, useState } from "react";
import { inTelegram } from "../utils/session";
import { installState, isIos, isStandalone, promptInstall, subscribeInstall } from "../utils/pwa";

/**
 * Can this tab be installed as an app, and how?
 *
 * `canInstall` — Chrome/Edge handed us a `beforeinstallprompt` (held in
 * utils/pwa.js) and the app is not already running installed; `install()`
 * shows the browser's dialog and must be called straight from the tap.
 * `iosHint` — an iPhone/iPad browser, where no event ever fires and the route
 * is the share sheet; the menu prints the instruction instead of a button that
 * would do nothing. Both answer false inside Telegram.
 */
export function usePwaInstall() {
  const [state, setState] = useState(installState);
  useEffect(() => {
    const off = subscribeInstall(() => setState(installState()));
    // The browser fires beforeinstallprompt whenever its checks finish — often
    // right around React's first commit, i.e. between the render that read the
    // initial state and this effect. Re-read once the subscription is live.
    setState(installState());
    return off;
  }, []);
  const browser = !inTelegram();
  const canInstall = browser && state.canInstall;
  const iosHint = browser && !canInstall && !state.installed && isIos() && !isStandalone();
  return { canInstall, iosHint, installed: state.installed, install: promptInstall };
}

export default usePwaInstall;
