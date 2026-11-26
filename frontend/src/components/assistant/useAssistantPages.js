import { useMemo } from "react";
import useAT from "./useAT";
import { useAuth } from "../../context/AuthContext";
import { usePageAccess } from "../../hooks/usePageAccess";
import { useCapabilities } from "../../hooks/useCapabilities";
import { PAGES, canAccessPage } from "../../config/pages";

/** The pages this person can open, in their own words — sent with every
 *  message (typed in the chat or spoken to the orb), so a link the model
 *  offers is one the reader can follow. */
export default function useAssistantPages() {
  const t = useAT();
  const { auth } = useAuth();
  const { access } = usePageAccess();
  const { capPages, deniedPages } = useCapabilities();
  return useMemo(() => (auth?.role ? PAGES.filter((p) => p.key !== "assistant"
      && canAccessPage(auth.role, p.key, access, capPages, deniedPages))
    .map((p) => ({ path: p.route, label: t(p.labelKey) })) : []),
  [auth?.role, access, capPages, deniedPages, t]);
}
