import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Toast from "../ui/Toast";
import { useLang } from "../../context/LangContext";
import { isServerRestarting, onServerRestarting } from "../../utils/serverRestart";

// Defined once, not inline: a new component per render would remount the icon
// and restart its spin.
const Spinner = (props) => <Loader2 {...props} className="animate-spin" />;

/**
 * «The server is updating» — shown while requests are waiting for a backend
 * that a deploy is restarting (utils/serverRestart.js). It disappears by
 * itself on the first ordinary answer. No button: there is nothing to do but
 * wait, and the requests behind it are retried for the reader.
 */
export default function ServerRestartNotice() {
  const { t } = useLang();
  const [on, setOn] = useState(isServerRestarting);
  useEffect(() => onServerRestarting(setOn), []);
  return (
    <Toast
      open={on}
      tone="info"
      duration={0}
      closable={false}
      icon={Spinner}
      message={t("ui.version.serverRestarting")}
    />
  );
}
