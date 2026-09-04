import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Timer } from "lucide-react";
import api from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LangContext";
import { usePageAccess } from "../../hooks/usePageAccess";
import { useCapabilities } from "../../hooks/useCapabilities";
import { canAccessPage } from "../../config/pages";

// The second line of the close-day confirm — on Daily and on the Staff
// calendar, ONE component so the two dialogs cannot drift into asking
// different questions about the same day.
//
// Closing used to be REFUSED while a leader's ojidaniya sat undecided. The
// approval step is gone (2026-08-22): a leader's entry counts the moment it is
// saved, so nothing can block the close any more — but the brigadir is still
// the one person who can correct a wrong entry, and the moment the day shuts is
// the last moment that is cheap. This asks the question the old 409 used to
// force, and nothing more: the close proceeds on confirm whatever the answer.
//
// It renders INSIDE ConfirmDialog's `message`, so it mounts only while the
// dialog stands — the day-summary is fetched for a close actually being
// considered, never for every day the calendar paints. Silent on any failure
// (a 403 for a viewer the endpoint does not scope, a dead request): a warning
// that cannot be computed is not a warning, and the dialog still has its own
// sentence. The link is offered only to somebody who can OPEN /idle-cell,
// decided by the same helper the sidebar uses for the nav entry, so the dialog
// never points at a page that would answer «no access».
//
// The sentence NAMES the day it counted. It used to say «today» in all four
// languages while the dialog is opened for whatever day is being closed — and
// closing a past day is ordinary here, the Staff calendar's whole point — so a
// brigadir shutting the 30th read a correct count of the 30th as today's
// figure and reported it as a bug. The count was never wrong; the one word
// that said which day it was about was.
const ddmmyyyy = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join(".") : "");

export default function CloseDayIdleNote({ managerId, date }) {
  const { t } = useLang();
  const { auth } = useAuth();
  const { access } = usePageAccess();
  const { capPages, deniedPages } = useCapabilities();
  const canOpen = canAccessPage(auth?.role, "idle-cell", access, capPages, deniedPages);

  const { data } = useQuery({
    queryKey: ["idle-day-summary", managerId, date],
    queryFn: () => api.get("/api/idle-cell/day-summary", { params: { manager_id: managerId, date } }).then((r) => r.data),
    enabled: !!managerId && !!date,
    retry: false,
    staleTime: 0,
  });

  const n = data?.leader_entries ?? 0;
  if (!n) return null;
  return (
    <div
      className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2"
      style={{ background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.35)", color: "var(--text-2)" }}
    >
      <Timer size={13} className="flex-shrink-0 mt-0.5" style={{ color: "#eab308" }} />
      <span className="min-w-0 leading-snug">
        <span className="font-semibold">{t("daily.closeLeaderIdleN").replace("{n}", n).replace("{date}", ddmmyyyy(date))}</span>
        {canOpen && (
          <>
            {" "}
            <Link
              to="/idle-cell"
              className="font-semibold underline underline-offset-2"
              style={{ color: "var(--brand-text)" }}
            >
              {t("daily.closeLeaderIdleLink")}
            </Link>
          </>
        )}
      </span>
    </div>
  );
}
