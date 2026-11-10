// «HR kontakti» — where JOB SEEKERS are sent (docs/registration.md «Job
// seekers go to HR»). People who want to work at Safia find the bot by
// searching «Safia» and file guest requests; the bot's welcome, its Telegram
// description, /login and a closed guest request all name this contact.
// Lives on the Users tab because that is where those guest requests are closed.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Briefcase } from "lucide-react";
import api from "../../utils/api";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import { useToast } from "../ui/Toast";
import { useLang } from "../../context/LangContext";

export default function HrContactButton() {
  const { t } = useLang();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const { data } = useQuery({
    queryKey: ["admin-hr-contact"],
    queryFn: () => api.get("/admin/hr-contact").then((r) => r.data),
  });

  const save = useMutation({
    mutationFn: (contact) => api.put("/admin/hr-contact", { contact }).then((r) => r.data),
    onSuccess: (res) => {
      qc.setQueryData(["admin-hr-contact"], { contact: res.contact });
      setOpen(false);
      if (res.bot_synced) toast.success(t("admin.hrContact.saved"));
      else toast.warning(t("admin.hrContact.savedNoBot"));
    },
    onError: (e) => setError(
      e?.response?.data?.detail === "hr_contact_invalid"
        ? t("admin.hrContact.invalid")
        : t("admin.hrContact.failed"),
    ),
  });

  function openModal() {
    setValue(data?.contact ?? "");
    setError("");
    setOpen(true);
  }

  return (
    <>
      {/* In a card header beside other actions: the word folds away on a phone. */}
      <Button variant="secondary" icon={<Briefcase size={13} />} onClick={openModal}
        title={t("admin.hrContact.button")} aria-label={t("admin.hrContact.button")}>
        <span className="hidden sm:inline">{t("admin.hrContact.button")}</span>
      </Button>

      {open && (
        <Modal
          onClose={() => setOpen(false)}
          dismissable={!save.isPending}
          title={t("admin.hrContact.title")}
          subtitle={t("admin.hrContact.subtitle")}
          icon={Briefcase}
          maxWidth="max-w-md"
          zIndex={60}
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={save.isPending}>
                {t("common.cancel")}
              </Button>
              <Button size="sm" loading={save.isPending} onClick={() => save.mutate(value)}>
                {t("admin.hrContact.save")}
              </Button>
            </>
          }
        >
          <FormField label={t("admin.hrContact.label")} hint={t("admin.hrContact.hint")} error={error || null}>
            <input
              type="text"
              value={value}
              maxLength={300}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => { setValue(e.target.value); setError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !save.isPending) save.mutate(value); }}
              placeholder="@safia_hr"
              aria-invalid={!!error}
              className="w-full rounded-xl px-3 py-2 text-base md:text-sm outline-none"
              style={{
                background: "var(--bg-inner)",
                border: `1px solid ${error ? "#ef4444" : "var(--border)"}`,
                color: "var(--text-1)",
              }}
            />
          </FormField>
        </Modal>
      )}

      {toast.node}
    </>
  );
}
