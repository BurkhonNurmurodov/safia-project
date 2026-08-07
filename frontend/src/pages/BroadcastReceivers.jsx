import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Users, Send, CheckCircle, AlertTriangle } from "lucide-react";
import api from "../utils/api";
import Button from "../components/ui/Button";
import SearchInput from "../components/ui/SearchInput";
import Modal from "../components/ui/Modal";
import CheckboxTree, { collectLeafKeys } from "../components/ui/CheckboxTree";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { buildRecipientGroups } from "../utils/broadcastTree";

const CLOSE_SEC = 5;
const closeApp = () => window.Telegram?.WebApp?.close?.();

/**
 * /broadcast mini-app — the second step of the bot's /broadcast flow. Opened
 * from the "Choose recipients" inline button with a draft token (?d=). Nothing
 * but the role ▸ profile ▸ user picker and a Send button; on send it shows a
 * result modal that auto-closes the mini-app after a short countdown.
 */
export default function BroadcastReceivers() {
  const { t } = useLang();
  const { tl } = useTranslit();

  const token = useMemo(
    () => new URLSearchParams(window.location.search).get("d") || "",
    [],
  );

  const [selected, setSelected] = useState([]);
  const [treeFilter, setTreeFilter] = useState("");
  const [result, setResult] = useState(null); // { sent, failed, total }
  const [countdown, setCountdown] = useState(CLOSE_SEC);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["broadcast-recipients"],
    queryFn: () => api.get("/api/broadcast/recipients").then((r) => r.data),
  });

  const groups = useMemo(
    () => buildRecipientGroups(data?.tree, t, tl, t("admin.broadcast.notRegistered")),
    [data, t, tl],
  );
  const allKeys = useMemo(() => collectLeafKeys(groups), [groups]);

  const sendMut = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("token", token);
      form.append("targets", JSON.stringify(selected.map(Number)));
      return api.post("/api/broadcast/send-draft", form).then((r) => r.data);
    },
    onSuccess: (res) => setResult(res),
    onError: (e) => alert(e?.response?.data?.detail || t("admin.broadcast.sendFailed")),
  });

  // Result-modal countdown → close the mini-app.
  useEffect(() => {
    if (!result) return;
    if (countdown <= 0) { closeApp(); return; }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [result, countdown]);

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "var(--bg-base)" }}>
      <div className="w-full max-w-lg mx-auto flex-1 flex flex-col p-3 sm:p-4"
           style={{ paddingTop: "calc(var(--tg-safe-top, 0px) + 0.75rem)" }}>
        <div className="rounded-2xl overflow-hidden flex-1 flex flex-col"
             style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>

          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 flex-shrink-0"
               style={{ borderBottom: "1px solid var(--border)" }}>
            <Users size={16} style={{ color: "var(--brand-text)" }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
              {t("admin.broadcast.recipientsTitle")}
            </span>
            <span
              className="ml-auto text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full"
              style={selected.length
                ? { background: "var(--brand-bg)", color: "var(--brand-text)" }
                : { background: "var(--bg-inner)", color: "var(--text-4)" }}
            >
              {selected.length}/{allKeys.length}
            </span>
          </div>

          {/* Search + bulk actions */}
          <div className="px-3 py-3 space-y-2 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            <SearchInput value={treeFilter} onChange={setTreeFilter} placeholder={t("admin.broadcast.searchPh")} />
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setSelected(allKeys)}>
                {t("admin.broadcast.selectAll")}
              </Button>
              <Button variant="ghost" size="sm" disabled={!selected.length} onClick={() => setSelected([])}>
                {t("admin.broadcast.clearAll")}
              </Button>
            </div>
          </div>

          {/* Tree */}
          <div className="px-2 py-2 overflow-y-auto flex-1">
            {isLoading ? (
              <div className="space-y-2 px-2 py-1">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-7 w-full" />)}
              </div>
            ) : isError ? (
              <div className="py-10 text-center text-xs" style={{ color: "#ef4444" }}>
                {t("admin.broadcast.sendFailed")}
              </div>
            ) : (
              <CheckboxTree
                groups={groups}
                selected={selected}
                onChange={setSelected}
                filter={treeFilter}
                emptyText={t("admin.broadcast.noMatch")}
              />
            )}
          </div>
        </div>

        {/* Send */}
        <div className="flex items-center gap-3 pt-3 flex-shrink-0">
          <span className="text-xs" style={{ color: selected.length ? "var(--text-3)" : "var(--text-4)" }}>
            {t("admin.broadcast.selected").replace("{n}", selected.length)}
          </span>
          <Button
            size="lg"
            className="ml-auto"
            icon={<Send size={14} />}
            disabled={!selected.length || !token}
            loading={sendMut.isPending}
            onClick={() => sendMut.mutate()}
          >
            {t("admin.broadcast.send")}
          </Button>
        </div>
      </div>

      {/* Result — auto-closes the mini-app */}
      {result && (
        <Modal
          open
          dismissable={false}
          maxWidth="max-w-xs"
          title={t("broadcast.recv.resultTitle")}
          icon={result.failed
            ? <AlertTriangle size={18} style={{ color: "#eab308" }} />
            : <CheckCircle size={18} style={{ color: "#22c55e" }} />}
          footer={<Button variant="secondary" onClick={closeApp}>{t("broadcast.recv.closeNow")}</Button>}
        >
          <div className="text-center py-2">
            <div className="text-3xl font-bold tabular-nums" style={{ color: "var(--text-1)" }}>
              {result.sent}<span style={{ color: "var(--text-4)" }}>/{result.total}</span>
            </div>
            <div className="text-xs mt-1" style={{ color: "#22c55e" }}>
              {t("broadcast.recv.delivered")}
            </div>
            {result.failed > 0 && (
              <div className="text-xs mt-1" style={{ color: "#ef4444" }}>
                {t("admin.broadcast.failedN").replace("{n}", result.failed)}
              </div>
            )}
          </div>
          <div className="text-center text-[11px]" style={{ color: "var(--text-4)" }}>
            {t("broadcast.recv.closingIn").replace("{n}", countdown)}
          </div>
        </Modal>
      )}
    </div>
  );
}
