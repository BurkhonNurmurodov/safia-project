import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, History, Maximize2, Settings, SquarePen, BotMessageSquare, X } from "lucide-react";
import api from "../../utils/api";
import useAT from "./useAT";
import { useAssistant } from "../../context/AssistantContext";
import { hasOpenDialog } from "../ui/dialogLayers";
import Chat from "./Chat";
import ThreadList from "./ThreadList";
import AssistantSettings from "./AssistantSettings";

const DOCK_QUERY = "(min-width: 1280px)";
const PHONE_QUERY = "(max-width: 767px)";
export const PANEL_W = 420;

function useMedia(query) {
  const [on, setOn] = useState(() => window.matchMedia?.(query)?.matches ?? false);
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return undefined;
    const fn = () => setOn(m.matches);
    m.addEventListener?.("change", fn);
    return () => m.removeEventListener?.("change", fn);
  }, [query]);
  return on;
}

/** The ✦ in the header — opens and closes the panel. Only for those the
 *  server says may use the assistant, and not on its own full page. */
export function AssistantButton() {
  const t = useAT();
  const A = useAssistant();
  if (!A?.allowed || A.onPage) return null;
  const label = t("nav.assistant");
  return (
    <button type="button" onClick={A.toggle}
      className="relative flex items-center justify-center p-1.5 rounded-lg transition-colors flex-shrink-0"
      style={{
        background: A.open ? "var(--brand)" : "var(--bg-inner)",
        border: `1px solid ${A.open ? "var(--brand)" : "var(--border)"}`,
        color: A.open ? "var(--on-brand)" : "var(--text-2)",
      }}
      title={label} aria-label={label} aria-expanded={A.open} aria-controls="assistant-panel">
      <BotMessageSquare size={15} />
    </button>
  );
}

/**
 * The assistant beside every page. On a wide screen (≥1280px) it DOCKS — the
 * page narrows to make room, so nothing is hidden behind it; on a laptop it
 * lies over the page's right edge; on a phone it is the whole screen. It is
 * not a modal: the page stays usable, and a page the assistant opens appears
 * beside the conversation that asked for it.
 */
export default function AssistantPanel() {
  const t = useAT();
  const A = useAssistant();
  const navigate = useNavigate();
  const dock = useMedia(DOCK_QUERY);
  const phone = useMedia(PHONE_QUERY);
  const [view, setView] = useState("chat");
  const [settings, setSettings] = useState(false);
  const show = !!A?.allowed && A.open && !A.onPage;

  // Docking: the content column reads --assistant-dock (Layout).
  useEffect(() => {
    const root = document.documentElement;
    if (show && dock) root.style.setProperty("--assistant-dock", `${PANEL_W}px`);
    else root.style.removeProperty("--assistant-dock");
    return () => root.style.removeProperty("--assistant-dock");
  }, [show, dock]);

  useEffect(() => {
    if (!show) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented || hasOpenDialog()) return;
      // Only an Escape pressed IN the panel closes it — a page's own popover
      // closing on the same key must not take the conversation with it.
      if (!document.getElementById("assistant-panel")?.contains(document.activeElement)) return;
      if (view === "history") setView("chat");
      else A.setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, view, A]);

  const titleQ = useQuery({
    queryKey: ["assistant", "thread", A?.threadId],
    queryFn: () => api.get(`/api/assistant/threads/${A.threadId}`).then((r) => r.data),
    enabled: false,
  });
  const chatTitle = titleQ.data?.thread?.title;

  if (!show) return null;

  const go = (path) => {
    navigate(path);
    if (phone) A.setOpen(false);
  };

  const icon = "w-8 h-8 max-sm:w-10 max-sm:h-10 flex items-center justify-center rounded-lg hover:bg-[var(--bg-inner)] flex-shrink-0";

  return createPortal(
    <aside id="assistant-panel" aria-label={t("nav.assistant")}
      className="fixed z-[45] inset-0 md:inset-auto md:top-0 md:right-0 md:bottom-0 flex flex-col"
      style={{
        width: phone ? "100%" : `${PANEL_W}px`,
        background: "var(--bg-card)",
        borderLeft: phone ? "none" : "1px solid var(--border)",
        boxShadow: dock || phone ? "none" : "-12px 0 32px rgba(0,0,0,0.18)",
        paddingTop: "var(--tg-safe-top, 0px)",
      }}>
      <header className="flex items-center gap-1.5 px-3 py-2.5 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}>
        {view === "history" ? (
          <button type="button" onClick={() => setView("chat")} className={icon}
            aria-label={t("assistant.back")} title={t("assistant.back")} style={{ color: "var(--text-2)" }}>
            <ArrowLeft size={17} />
          </button>
        ) : (
          <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(var(--brand-rgb),0.14)", color: "var(--brand-text)" }}>
            <BotMessageSquare size={15} />
          </span>
        )}
        <div className="min-w-0 flex-1 px-1">
          <p className="text-sm font-semibold leading-tight truncate" style={{ color: "var(--text-1)" }}>
            {view === "history" ? t("assistant.history") : t("nav.assistant")}
          </p>
          {view === "chat" && (
            <p className="text-[11px] leading-tight truncate mt-0.5" style={{ color: "var(--text-3)" }}>
              {A.threadId ? (chatTitle || t("assistant.untitled")) : t("assistant.newChat")}
            </p>
          )}
        </div>
        {view === "chat" && (
          <>
            <button type="button" onClick={() => setView("history")} className={icon}
              aria-label={t("assistant.history")} title={t("assistant.history")} style={{ color: "var(--text-2)" }}>
              <History size={16} />
            </button>
            <button type="button" onClick={A.newChat} className={icon}
              aria-label={t("assistant.newChat")} title={t("assistant.newChat")} style={{ color: "var(--text-2)" }}>
              <SquarePen size={16} />
            </button>
            {!phone && (
              <button type="button" onClick={() => navigate("/assistant")} className={icon}
                aria-label={t("assistant.expand")} title={t("assistant.expand")} style={{ color: "var(--text-2)" }}>
                <Maximize2 size={15} />
              </button>
            )}
            {A.me?.can_configure && (
              <button type="button" onClick={() => setSettings(true)} className={icon}
                aria-label={t("assistant.settings.open")} title={t("assistant.settings.open")} style={{ color: "var(--text-2)" }}>
                <Settings size={16} />
              </button>
            )}
          </>
        )}
        <button type="button" onClick={() => A.setOpen(false)} className={icon}
          aria-label={t("assistant.close")} title={t("assistant.close")} style={{ color: "var(--text-2)" }}>
          <X size={17} />
        </button>
      </header>

      <div className="flex-1 min-h-0">
        {view === "history" ? (
          <div className="h-full overflow-y-auto px-3 py-3" style={{ paddingBottom: "calc(0.75rem + var(--tg-safe-bottom, 0px))" }}>
            <ThreadList compact onPick={() => setView("chat")} />
          </div>
        ) : (
          <Chat variant="panel" onNavigate={go} onConfigure={() => setSettings(true)} />
        )}
      </div>
      <AssistantSettings open={settings} onClose={() => setSettings(false)} />
    </aside>,
    document.body,
  );
}
