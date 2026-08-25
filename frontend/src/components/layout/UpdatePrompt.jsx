import Toast from "../ui/Toast";
import Button from "../ui/Button";
import { useLang } from "../../context/LangContext";
import { useAppUpdate } from "../../hooks/useAppUpdate";

/**
 * "A new version is ready" — offered, never imposed.
 *
 * Rendered once from Layout, so it covers every page a signed-in user can be
 * sitting on. It deliberately does NOT reload by itself: half the surfaces in
 * this app hold unsaved state (attendance drafts, admin forms, a half-typed
 * comment), and a reload that eats a shift's typing to deliver a CSS change is
 * a worse bug than the staleness it fixes.
 *
 * Uses the Toast template rather than a bespoke banner: it already portals past
 * `.page-enter`'s transform, offsets by the Telegram safe area and announces
 * itself to assistive tech — the three things every hand-rolled fixed box in
 * this codebase got wrong before Toast existed. `duration={0}` keeps it up (an
 * update notice you can miss is an update notice that does nothing) and the ×
 * dismisses it for this build only.
 *
 * It says one of TWO things, and the difference is the whole point. Normally a
 * newer build merely exists: info tone, dismissible, take it when you like.
 * But once the server says this bundle is below its compatibility floor
 * (`incompatible` — see utils/compat.js), the tab is not behind, it is no
 * longer served: warning tone, no × at all, because "later" is not an outcome
 * this state has. It still does not reload by itself — the reason for the
 * prompt is precisely that some of what is on screen may be unsaved.
 */
export default function UpdatePrompt() {
  const { t } = useLang();
  const { show, incompatible, dismiss, reload } = useAppUpdate();

  return (
    <Toast
      open={show}
      tone={incompatible ? "warning" : "info"}
      duration={0}
      closable={!incompatible}
      onClose={incompatible ? undefined : dismiss}
      message={
        <span className="block">
          <span className="block">
            {t(incompatible ? "ui.version.incompatible" : "ui.version.updateReady")}
          </span>
          <span className="block mt-2">
            <Button variant="primary" size="sm" onClick={reload}>
              {t("ui.version.reload")}
            </Button>
          </span>
        </span>
      }
    />
  );
}
