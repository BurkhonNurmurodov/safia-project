import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Flame, X } from "lucide-react";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { errText, queueIcon, queueText, timeAgo } from "./notifMeta";
import { IconChip, StatusChip } from "./NotifParts";
import { useRefreshAfterDecision } from "./useNotifCenter";

/**
 * One item of «Sizdan kutilmoqda». The server DESCRIBES what can be done
 * (services/notif_queue: method + url + confirm + undo) and this row runs it
 * against the very endpoint /staff or /leaders calls, so the rights stay where
 * they are enforced and a refusal comes back in that endpoint's own words.
 *
 * A decided item STAYS where it is, showing its outcome, until the list is
 * opened again — an action taken in a list must never move the list. So the
 * decision lives with the LIST (`decided` / `onDecided`), not in this row.
 * Only a decision nothing here can take back asks first (`confirm`).
 */
export default function QueueItem({ item, decided, onDecided, onOpen }) {
  const { t, lang } = useLang();
  const { tl, tx } = useTranslit();
  const navigate = useNavigate();
  const refresh = useRefreshAfterDecision();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [confirmError, setConfirmError] = useState(null);

  const Icon = queueIcon(item);
  const { title, sub, subTone, quote, meta, urgent, tag } = queueText(item, { t, tl, tx, lang });
  const metaLine = [...meta, timeAgo(item.since, t)].filter(Boolean).join(" · ");
  const actions = item.actions || [];
  const isChat = item.kind === "dispute" || item.kind === "late_proof";
  // A deletion batch — /staff's or /staff-live's — approves by deleting rows,
  // so its approve confirm says so and wears the danger tone.
  const deletes = item.kind === "edit_batch" || item.kind === "live_batch";

  const call = (a) => api.request({ method: a.method || "post", url: a.url, data: a.body ?? undefined });

  async function run(action, fromDialog) {
    setBusy(action.id);
    setError(null);
    setConfirmError(null);
    try {
      await call(action);
      onDecided(item.key, { action: action.id, undo: action.undo || null });
      setConfirm(null);
      refresh();
    } catch (e) {
      if (fromDialog) setConfirmError(errText(e, t));
      else setError(errText(e, t));
    } finally {
      setBusy(null);
    }
  }

  async function undo() {
    if (!decided?.undo) return;
    setBusy("undo");
    setError(null);
    try {
      await call(decided.undo);
      onDecided(item.key, null);
      refresh();
    } catch (e) {
      setError(errText(e, t));
    } finally {
      setBusy(null);
    }
  }

  const open = () => {
    onOpen?.();
    navigate(item.link);
  };

  const confirmCopy = (a) => {
    if (a?.id === "reject") {
      return { title: t("notif.confirm.rejectTitle"), text: t("notif.confirm.rejectText") };
    }
    return {
      title: t("notif.confirm.approveTitle"),
      text: deletes ? t("notif.confirm.deleteText") : t("notif.confirm.rejectText"),
    };
  };

  return (
    <div className="flex gap-3 px-4 py-3 sm:py-2.5" style={{ borderTop: "1px solid var(--border)" }}>
      <IconChip Icon={Icon} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          {item.link ? (
            <Link
              to={item.link}
              onClick={() => onOpen?.()}
              className="text-sm sm:text-[13px] font-semibold leading-snug line-clamp-2 hover:underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2"
              style={{ color: "var(--text-1)", outlineColor: "var(--brand)" }}
            >
              {title}
            </Link>
          ) : (
            <p className="text-sm sm:text-[13px] font-semibold leading-snug line-clamp-2" style={{ color: "var(--text-1)" }}>
              {title}
            </p>
          )}
          {urgent && (
            <span className="flex-shrink-0 mt-0.5">
              <StatusChip tone="hot" icon={Flame}>{t("notif.q.urgent")}</StatusChip>
            </span>
          )}
          {tag && (
            /* The «Jonli» mark: a neutral tag — the live page is a source, not
               a status, so it borrows no traffic-light tone. */
            <span
              className="flex-shrink-0 mt-0.5 inline-flex items-center text-[11px] font-medium px-1.5 py-px rounded-md whitespace-nowrap"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }}
            >
              {tag}
            </span>
          )}
        </div>
        {sub && (
          <p className="text-[13px] sm:text-xs mt-0.5 leading-snug"
            style={{ color: subTone === "warn" ? "var(--status-warn)" : "var(--text-2)" }}>
            {sub}
          </p>
        )}
        {quote && (
          <p className="text-[13px] sm:text-xs mt-1 leading-snug line-clamp-2" style={{ color: "var(--text-2)" }}>
            «{quote}»
          </p>
        )}
        {metaLine && <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>{metaLine}</p>}

        {/* One fixed-height row for the controls AND the outcome that replaces
            them, so a decision changes nothing around it. */}
        <div className="flex items-center gap-2 flex-wrap mt-2.5 sm:mt-2 min-h-[32px] max-sm:min-h-[38px]">
          {decided ? (
            <>
              <StatusChip tone={decided.action === "reject" ? "bad" : "ok"}
                icon={decided.action === "reject" ? X : Check}>
                {decided.action === "reject" ? t("notif.done.reject") : t("notif.done.approve")}
              </StatusChip>
              {decided.undo && (
                <Button variant="ghost" size="md" className="max-sm:py-2.5" loading={busy === "undo"}
                  onClick={undo}>
                  {t("notif.undo")}
                </Button>
              )}
            </>
          ) : (
            <>
              {actions.map((a) => (
                <Button
                  key={a.id}
                  variant={a.tone === "danger" ? "danger" : "success"}
                  tint
                  size="md"
                  className="max-sm:py-2.5"
                  loading={busy === a.id}
                  disabled={!!busy && busy !== a.id}
                  onClick={() => (a.confirm ? setConfirm(a) : run(a, false))}
                >
                  {a.id === "reject" ? t("notif.reject") : t("notif.approve")}
                </Button>
              ))}
              {item.link && (
                <Button variant="secondary" tint size="md" className="max-sm:py-2.5"
                  disabled={!!busy} onClick={open}>
                  {isChat ? t("notif.openChat") : t("notif.open")}
                </Button>
              )}
            </>
          )}
        </div>
        {error && (
          <p role="alert" className="text-xs mt-1.5" style={{ color: "var(--status-bad)" }}>{error}</p>
        )}
      </div>

      <ConfirmDialog
        open={!!confirm}
        tone={confirm?.id === "reject" || deletes ? "danger" : "warning"}
        title={confirmCopy(confirm).title}
        message={<><span className="block font-medium mb-1" style={{ color: "var(--text-1)" }}>{title}</span>{confirmCopy(confirm).text}</>}
        confirmLabel={confirm?.id === "reject" ? t("notif.reject") : t("notif.approve")}
        loading={!!busy}
        error={confirmError}
        onCancel={() => { setConfirm(null); setConfirmError(null); }}
        onConfirm={() => run(confirm, true)}
        zIndex={1100}
      />
    </div>
  );
}
