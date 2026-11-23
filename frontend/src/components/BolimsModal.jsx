// «Bo'limlar» — the register of the rooms the teams work in, each with its
// block and floor (2026-11-23, backend `services/bolims.py`). Opened from the
// /cells toolbar by whoever may edit cells. A cell is placed in a bo'lim on its
// own form; here the rooms themselves are added, renamed, moved or deleted.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import FormField from "./ui/FormField";
import StyledSelect from "./ui/StyledSelect";
import LangTextInput from "./ui/LangTextInput";
import ActionMenu from "./ui/ActionMenu";
import ConfirmDialog from "./ui/ConfirmDialog";
import EmptyState from "./ui/EmptyState";
import { useToast } from "./ui/Toast";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { bolimName, bolimWhere } from "../utils/bolim";
import api from "../utils/api";

const BLOCKS = ["A", "B", "C", "D"];
const FLOORS = [-2, -1, 0, 1, 2, 3, 4, 5, 6];
const errText = (e, t) => e?.response?.data?.detail || t("admin.profiles.error");
// The /cells door; the container app's «Bo'limlar» page passes its own
// (`/api/container-flow/bolims`, its page key) — the same register.
const CELLS_DOOR = "/api/profiles/admin/bolims";

export function BolimForm({ item, onClose, onSaved, endpoint = CELLS_DOOR, zIndex = 60 }) {
  const { t } = useLang();
  const [form, setForm] = useState(() => ({
    uz: item?.name_uz || "", uz_cyrl: item?.name_uz_cyrl || "",
    ru: item?.name_ru || "", en: item?.name_en || "",
    code: item?.code || "", block: item?.block || "",
    floor: item?.floor == null ? "" : String(item.floor),
  }));
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: (body) => (item
      ? api.put(`${endpoint}/${item.id}`, body)
      : api.post(endpoint, body)),
    onSuccess: (res) => onSaved(res?.data),
    onError: (e) => setError(errText(e, t)),
  });
  const submit = () => {
    setError("");
    if (![form.uz, form.uz_cyrl, form.ru, form.en].some((v) => v.trim())) {
      setError(t("bolim.nameRequired"));
      return;
    }
    save.mutate({
      name_uz: form.uz, name_uz_cyrl: form.uz_cyrl, name_ru: form.ru, name_en: form.en,
      code: form.code, block: form.block,
      floor: form.floor === "" ? null : Number(form.floor),
    });
  };
  const floorLabel = (f) => bolimWhere(t, { floor: f });
  return (
    <Modal
      onClose={onClose}
      zIndex={zIndex}
      icon={item ? <Pencil size={18} /> : <Plus size={18} />}
      title={t(item ? "bolim.edit" : "bolim.add")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={submit} loading={save.isPending}>{t("common.save")}</Button>
        </>
      }
    >
      <FormField label={t("bolim.name")} required error={error || undefined}>
        <LangTextInput
          className="mt-1"
          value={{ uz: form.uz, uz_cyrl: form.uz_cyrl, ru: form.ru, en: form.en }}
          onChange={(l, v) => setForm((f) => ({ ...f, [l]: v }))}
        />
      </FormField>
      <div className="grid grid-cols-3 gap-3">
        <FormField label={t("bolim.block")}>
          <StyledSelect
            value={form.block}
            onChange={(v) => setForm((f) => ({ ...f, block: v }))}
            options={[{ value: "", label: "—" }, ...BLOCKS.map((b) => ({ value: b, label: b }))]}
          />
        </FormField>
        <FormField label={t("bolim.floor")}>
          <StyledSelect
            value={form.floor}
            onChange={(v) => setForm((f) => ({ ...f, floor: v }))}
            options={[{ value: "", label: "—" }, ...FLOORS.map((f) => ({ value: String(f), label: floorLabel(f) }))]}
          />
        </FormField>
        <FormField label={t("bolim.code")}>
          <input
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            placeholder="2.07"
            className="w-full mt-1 px-3 py-2 text-sm rounded-xl outline-none"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }}
          />
        </FormField>
      </div>
    </Modal>
  );
}

export default function BolimsModal({ bolims, onClose, onChanged, endpoint = CELLS_DOOR, canDelete = true }) {
  const { t, lang } = useLang();
  const { tx } = useTranslit();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(null);          // {item?} — add or edit
  const [confirm, setConfirm] = useState(null);    // the bo'lim to delete
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-bolims"] });
    onChanged?.();
  };
  const del = useMutation({
    mutationFn: (id) => api.delete(`${endpoint}/${id}`),
    onSuccess: () => { setConfirm(null); refresh(); toast.success(t("bolim.deleted")); },
  });
  // Block, then the floor from the top down, then the name.
  const rows = [...bolims].sort((a, b) =>
    String(a.block || "~").localeCompare(String(b.block || "~"))
    || (b.floor ?? -99) - (a.floor ?? -99)
    || tx(bolimName(a, lang)).localeCompare(tx(bolimName(b, lang))));
  return (
    <>
      <Modal
        onClose={onClose}
        maxWidth="max-w-2xl"
        icon={<MapPin size={18} />}
        title={t("bolim.manage")}
        subtitle={t("bolim.manageSub")}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>{t("ui.modal.close")}</Button>
            <Button icon={<Plus size={14} />} onClick={() => setForm({})}>{t("bolim.add")}</Button>
          </>
        }
      >
        {!rows.length ? (
          <EmptyState icon={MapPin} title={t("bolim.empty")} message="" showUploadLink={false} />
        ) : (
          <ul className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            {rows.map((b, i) => {
              const where = [b.code, bolimWhere(t, b)].filter(Boolean).join(" · ");
              return (
                <li key={b.id} className="flex items-center gap-3 pl-3 pr-1.5 py-2"
                  style={i ? { borderTop: "1px solid var(--border)" } : undefined}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate" style={{ color: "var(--text-1)" }}>
                      {tx(bolimName(b, lang)) || "—"}
                    </div>
                    <div className="text-xs truncate" style={{ color: "var(--text-3)" }}>
                      {[where, t("bolim.cells").replace("{n}", b.cells ?? 0)].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <ActionMenu
                    label={`${t("admin.profiles.colActions")}: ${tx(bolimName(b, lang))}`}
                    items={[
                      { key: "edit", label: t("admin.profiles.edit"), icon: Pencil, onSelect: () => setForm({ item: b }) },
                      canDelete && { key: "delete", label: t("bolim.delete"), icon: Trash2, tone: "danger", onSelect: () => { del.reset(); setConfirm(b); } },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
      {form && (
        <BolimForm
          endpoint={endpoint}
          item={form.item}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); refresh(); toast.success(t("bolim.saved")); }}
        />
      )}
      <ConfirmDialog
        open={!!confirm}
        tone="danger"
        title={t("bolim.deleteTitle")}
        message={confirm && t("bolim.deleteMsg")
          .replace("{name}", tx(bolimName(confirm, lang)))
          .replace("{n}", confirm.cells ?? 0)}
        confirmLabel={t("bolim.delete")}
        onCancel={() => setConfirm(null)}
        onConfirm={() => del.mutate(confirm.id)}
        loading={del.isPending}
        error={del.isError ? errText(del.error, t) : null}
      />
      {toast.node}
    </>
  );
}
