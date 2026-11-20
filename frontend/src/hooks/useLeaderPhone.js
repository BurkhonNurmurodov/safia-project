import { useAuth } from "../context/AuthContext";
import useIsMobile from "./useIsMobile";

// The leader on a phone (2026-11-20, the leader-phone redesign,
// docs/plan-leader-mobile.md): the viewer's ROLE is «Lider» and the screen is
// below md (768px). Everything the redesign changes for leaders alone — the
// «Bugun» landing, the job-named menu, the screens a leader has no use for — is
// gated on this, so a leader's desktop, and every other role's phone, stay as
// they were. Layout-only changes for every phone use `max-md:` classes instead.
export default function useLeaderPhone() {
  const { auth } = useAuth();
  const phone = useIsMobile(768);
  return phone && auth?.role === "leader";
}
