import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import SegmentedToggle from "../ui/SegmentedToggle";
import { SkeletonBlock } from "../ui/Skeleton";
import { useLang } from "../../context/LangContext";
import { CATEGORIES, CATEGORY_ICON, errText } from "./notifMeta";
import { useNotifPrefs, useSaveNotifPrefs } from "./useNotifCenter";

/**
 * Where each category of notification goes. The app always shows everything;
 * a switch here decides only whether the bot ALSO sends it to Telegram
 * (services/notification_center.telegram_muted). Every switch starts on
 * «Telegram va ilova», so nobody's Telegram changed until they chose here.
 * Approval cards with buttons are a separate mechanism and always arrive.
 */
export default function NotifPrefsModal({ onClose, onSaved }) {
  const { t } = useLang();
  const { data, isLoading, isError, refetch } = useNotifPrefs(true);
  const save = useSaveNotifPrefs();
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (data && draft === null) setDraft({ ...data.prefs });
  }, [data, draft]);

  const editable = !!data?.editable;
  const dirty = !!draft && !!data && CATEGORIES.some((c) => draft[c] !== data.prefs[c]);

  const submit = () => {
    setError(null);
    save.mutate(draft, {
      onSuccess: () => { onSaved?.(); onClose(); },
      onError: (e) => setError(errText(e, t)),
    });
  };

  return (
    <Modal
      onClose={onClose}
      title={t("notif.settings")}
      icon={<Settings size={16} style={{ color: "var(--brand-text)" }} />}
      maxWidth="max-w-xl"
      zIndex={950}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" onClick={submit} loading={save.isPending}
            disabled={!editable || !dirty}>
            {t("common.save")}
          </Button>
        </>
      )}
    >
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-2)" }}>
        {t("notif.prefs.intro")}
      </p>
      {isLoading || !draft ? (
        isError ? (
          <div className="py-6 text-center">
            <p className="text-sm" style={{ color: "var(--text-2)" }}>{t("notif.loadError")}</p>
            <button type="button" className="text-sm font-medium mt-2 underline underline-offset-2"
              style={{ color: "var(--brand-text)" }} onClick={() => refetch()}>{t("notif.retry")}</button>
          </div>
        ) : (
          <div className="space-y-3 py-1" aria-hidden="true">
            {CATEGORIES.map((c) => <SkeletonBlock key={c} className="h-9 w-full" />)}
          </div>
        )
      ) : (
        <ul className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          {CATEGORIES.map((c, i) => {
            const Icon = CATEGORY_ICON[c];
            return (
              <li key={c} className="flex items-center gap-3 px-3 py-2.5 flex-wrap"
                style={{ borderTop: i ? "1px solid var(--border)" : undefined }}>
                <Icon size={16} className="flex-shrink-0" style={{ color: "var(--text-3)" }} aria-hidden="true" />
                <span className="flex-1 min-w-[140px] text-sm" style={{ color: "var(--text-1)" }}>
                  {t(`notif.cat.${c}`)}
                </span>
                <SegmentedToggle
                  size="sm"
                  ariaLabel={t(`notif.cat.${c}`)}
                  value={draft[c] ? "both" : "app"}
                  onChange={(v) => editable && setDraft((d) => ({ ...d, [c]: v === "both" }))}
                  options={[["both", t("notif.prefs.both")], ["app", t("notif.prefs.app")]]}
                />
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("notif.prefs.cardsNote")}</p>
      {data && !editable && (
        <p className="text-xs" style={{ color: "var(--status-warn)" }}>
          {t(data.reason === "exam" ? "notif.prefs.examNote" : "notif.prefs.noProfile")}
        </p>
      )}
      {error && <p role="alert" className="text-xs" style={{ color: "var(--status-bad)" }}>{error}</p>}
    </Modal>
  );
}
