import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import api from "../../utils/api";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import { SkeletonBlock } from "../ui/Skeleton";
import useAT from "./useAT";

/**
 * Admins only: the assistant's OWN Gemini key — the operator's call, so a busy
 * chat day never spends the quota the checklist photo reviews depend on — and
 * what it has been used for this month. With no own key it spends the proof
 * reviewer's, and the card says so. The key is sealed on the server and never
 * read back; only its first and last four characters are shown.
 */
export default function AssistantSettings({ open, onClose }) {
  const t = useAT();
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");

  const q = useQuery({
    queryKey: ["assistant", "settings"],
    queryFn: () => api.get("/api/assistant/settings").then((r) => r.data),
    enabled: open,
  });
  const s = q.data;

  const save = async (value) => {
    setBusy(value ? "save" : "clear");
    setErr("");
    try {
      await api.put("/api/assistant/settings", { key: value });
      setKey("");
      qc.invalidateQueries({ queryKey: ["assistant"] });
      if (value) onClose();
    } catch {
      setErr(t("assistant.settings.failed"));
    } finally {
      setBusy(null);
    }
  };

  const fmt = (n) => Number(n || 0).toLocaleString("ru-RU").replace(/,/g, " ");

  return (
    <Modal open={open} onClose={onClose} title={t("assistant.settings.title")}
      subtitle={t("assistant.settings.subtitle")} icon={<KeyRound size={18} />}
      dirty={!!key}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => save(key.trim())} disabled={!key.trim()} loading={busy === "save"}>
            {t("assistant.settings.save")}
          </Button>
        </>
      )}>
      {q.isLoading || !s ? (
        <SkeletonBlock className="h-24 w-full rounded-xl" />
      ) : (
        <>
          <div className="rounded-xl px-3.5 py-3 space-y-1"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>
              {t(`assistant.settings.src.${s.key_source}`)}
              {s.key_source === "own" && s.own_preview ? ` · ${s.own_preview}` : ""}
            </p>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              {t("assistant.settings.model", { model: s.model, voice: s.voice_model })}
            </p>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              {t("assistant.settings.usage", { n: fmt(s.month?.replies), p: fmt(s.month?.people), tok: fmt(s.month?.tokens) })}
            </p>
          </div>
          <FormField label={t("assistant.settings.keyLabel")} hint={t("assistant.settings.keyHint")}>
            <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)}
              placeholder="AIza…" maxLength={400}
              className="w-full rounded-xl px-3 py-2 text-base md:text-sm outline-none"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }} />
          </FormField>
          {s.key_source === "own" && (
            <Button variant="danger" tint size="sm" onClick={() => save("")} loading={busy === "clear"}>
              {t("assistant.settings.clear")}
            </Button>
          )}
          {err && <p className="text-xs" style={{ color: "var(--status-bad, #ef4444)" }}>{err}</p>}
        </>
      )}
    </Modal>
  );
}
