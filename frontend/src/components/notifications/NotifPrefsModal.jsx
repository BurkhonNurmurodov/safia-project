import { useEffect, useState } from "react";
import { BellOff, BellRing, Settings } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import SegmentedToggle from "../ui/SegmentedToggle";
import { SkeletonBlock } from "../ui/Skeleton";
import { useLang } from "../../context/LangContext";
import api from "../../utils/api";
import { pushEnable, pushSupported, pushTest, usePushStatus } from "../../utils/androidPush";
import { CATEGORIES, CATEGORY_ICON, errText, fmt, timeAgo } from "./notifMeta";
import { useNotifPrefs, useSaveNotifPrefs } from "./useNotifCenter";

const ALL_ON = Object.fromEntries(CATEGORIES.map((c) => [c, true]));

/**
 * Where each category of notification goes. The app always shows everything;
 * a switch here decides only where it ALSO goes:
 *   «Telegram» — the bot DMs it too (services/notification_center.telegram_muted).
 *     Approval cards with buttons are a separate mechanism and always arrive.
 *   «Telefon»  — inside the Android app only (utils/androidPush.js): the phone
 *     shows it as an Android notification. With the phone's own state on top —
 *     allowed or not, and a test that proves the whole path on this phone.
 * Every switch starts ON, so nothing changed for anybody until they chose here.
 */
export default function NotifPrefsModal({ onClose, onSaved }) {
  const { t } = useLang();
  const phone = pushSupported();
  const [tab, setTab] = useState(phone ? "phone" : "telegram");
  const { data, isLoading, isError, refetch } = useNotifPrefs(true);
  const save = useSaveNotifPrefs();
  const [draft, setDraft] = useState(null);
  const [pushDraft, setPushDraft] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (data && draft === null) {
      setDraft({ ...data.prefs });
      setPushDraft({ ...ALL_ON, ...(data.push || {}) });
    }
  }, [data, draft]);

  const editable = !!data?.editable;
  const dirty = !!draft && !!data && (
    CATEGORIES.some((c) => draft[c] !== data.prefs[c])
    || (phone && CATEGORIES.some((c) => pushDraft[c] !== (data.push?.[c] ?? true)))
  );

  const submit = () => {
    setError(null);
    save.mutate(phone ? { prefs: draft, push: pushDraft } : { prefs: draft }, {
      onSuccess: () => { onSaved?.(); onClose(); },
      onError: (e) => setError(errText(e, t)),
    });
  };

  const onPhone = tab === "phone";
  const values = onPhone ? pushDraft : draft;
  const setValues = onPhone ? setPushDraft : setDraft;

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
      {phone && (
        <SegmentedToggle
          asTabs
          fill
          ariaLabel={t("notif.settings")}
          value={tab}
          onChange={setTab}
          options={[["phone", t("notif.prefs.tabPhone")], ["telegram", "Telegram"]]}
        />
      )}
      {onPhone && <PhoneStatus />}
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-2)" }}>
        {t(onPhone ? "notif.prefs.introPhone" : "notif.prefs.intro")}
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
                  value={values[c] ? "both" : "app"}
                  onChange={(v) => editable && setValues((d) => ({ ...d, [c]: v === "both" }))}
                  options={[
                    ["both", t(onPhone ? "notif.prefs.phoneBoth" : "notif.prefs.both")],
                    ["app", t("notif.prefs.app")],
                  ]}
                />
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs" style={{ color: "var(--text-3)" }}>
        {t(onPhone ? "notif.push.every" : "notif.prefs.cardsNote")}
      </p>
      {data && !editable && (
        <p className="text-xs" style={{ color: "var(--status-warn)" }}>
          {t(data.reason === "exam" ? "notif.prefs.examNote" : "notif.prefs.noProfile")}
        </p>
      )}
      {error && <p role="alert" className="text-xs" style={{ color: "var(--status-bad)" }}>{error}</p>}
    </Modal>
  );
}

/**
 * This phone's side: are notifications allowed here, and one control — turn
 * them on, or send a test to prove they arrive. The second line is reserved
 * (the last check, then the test's outcome), so nothing under it moves.
 */
function PhoneStatus() {
  const { t } = useLang();
  const status = usePushStatus();
  const [test, setTest] = useState(null); // null | "sending" | "sent" | error text

  if (!status) return <SkeletonBlock className="h-[62px] w-full" />;

  const allowed = !!status.allowed;
  const sendTest = async () => {
    setTest("sending");
    try {
      const r = await api.post("/api/push/test");
      pushTest(r.data?.id);
      setTest("sent");
    } catch (e) {
      setTest(errText(e, t));
    }
  };

  let line;
  let lineColor = "var(--text-3)";
  if (!allowed) {
    line = t("notif.push.offHint");
  } else if (test === "sent") {
    line = t("notif.push.testSent");
    lineColor = "var(--status-ok)";
  } else if (test && test !== "sending") {
    line = test;
    lineColor = "var(--status-bad)";
  } else {
    line = fmt(t("notif.push.lastCheck"), {
      t: status.lastPoll ? timeAgo(new Date(status.lastPoll).toISOString(), t) : t("notif.push.never"),
    });
  }

  const Icon = allowed ? BellRing : BellOff;
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 flex-wrap"
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <Icon size={18} className="flex-shrink-0"
        style={{ color: allowed ? "var(--status-ok)" : "var(--status-warn)" }} aria-hidden="true" />
      <div className="flex-1 min-w-[160px]">
        <p className="text-sm font-medium" style={{ color: "var(--text-1)" }}>
          {t(allowed ? "notif.push.on" : "notif.push.off")}
        </p>
        <p className="text-xs mt-0.5 min-h-[16px]" role="status" style={{ color: lineColor }}>{line}</p>
      </div>
      {allowed ? (
        <Button variant="secondary" tint size="md" loading={test === "sending"} onClick={sendTest}>
          {t("notif.push.test")}
        </Button>
      ) : (
        <Button variant="primary" size="md" onClick={pushEnable}>{t("notif.push.enable")}</Button>
      )}
    </div>
  );
}
