import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { History, Settings } from "lucide-react";
import Layout from "../components/layout/Layout";
import Chat from "../components/assistant/Chat";
import ThreadList from "../components/assistant/ThreadList";
import AssistantSettings from "../components/assistant/AssistantSettings";
import { SkeletonBlock } from "../components/ui/Skeleton";
import useAT from "../components/assistant/useAT";
import { useAssistant } from "../context/AssistantContext";

/**
 * «Yordamchi» on a page of its own — the same chat as the side panel, with
 * room: the reader's chats on the left, the conversation on the right. On a
 * phone the two are one step apart (list → chat → back).
 */
export default function Assistant() {
  const t = useAT();
  const A = useAssistant();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(false);
  const [phoneList, setPhoneList] = useState(false);
  const box = useRef(null);
  const [height, setHeight] = useState(null);

  // The chat fills the screen below the header: its own scroller, its own
  // composer docked at the bottom — measured, so a Telegram safe area, the
  // «open as» bar or a taller header can never push the composer off-screen.
  useLayoutEffect(() => {
    const fit = () => {
      const el = box.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const main = el.closest("main");
      const pad = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      const safe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--tg-safe-bottom")) || 0;
      setHeight(Math.max(360, window.innerHeight - top - pad - safe - 16));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [A?.allowed]);

  const go = useCallback((path) => navigate(path), [navigate]);

  if (!A?.me) return <Layout title={t("nav.assistant")}><SkeletonBlock className="h-[60vh] w-full rounded-2xl" /></Layout>;
  if (!A.allowed) return <Navigate to="/" replace />;

  return (
    <Layout title={t("nav.assistant")}>
      <div ref={box} className="grid md:grid-cols-[17rem_minmax(0,1fr)] gap-4"
        style={{ height: height ? `${height}px` : "70vh" }}>
        <aside className={`${phoneList ? "flex" : "hidden"} md:flex flex-col min-h-0 rounded-2xl p-3`}
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: "var(--text-3)" }}>
              {t("assistant.history")}
            </p>
            {A.me?.can_configure && (
              <button type="button" onClick={() => setSettings(true)}
                aria-label={t("assistant.settings.open")} title={t("assistant.settings.open")}
                className="w-8 h-8 max-sm:w-10 max-sm:h-10 flex items-center justify-center rounded-lg hover:bg-[var(--bg-inner)]"
                style={{ color: "var(--text-3)" }}>
                <Settings size={16} />
              </button>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <ThreadList onPick={() => setPhoneList(false)} />
          </div>
        </aside>

        <section className={`${phoneList ? "hidden" : "flex"} md:flex flex-col min-h-0 rounded-2xl overflow-hidden`}
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="md:hidden flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
            <button type="button" onClick={() => setPhoneList(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-2 py-2 rounded-lg hover:bg-[var(--bg-inner)]"
              style={{ color: "var(--text-2)" }}>
              <History size={16} /> {t("assistant.history")}
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <Chat variant="page" onNavigate={go} onConfigure={() => setSettings(true)} />
          </div>
        </section>
      </div>
      <AssistantSettings open={settings} onClose={() => setSettings(false)} />
    </Layout>
  );
}
