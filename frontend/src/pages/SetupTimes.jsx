import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wrench, CircleUserRound, LayoutGrid, Timer, MessageSquareText, Barcode,
  Plus, Pencil, Trash2,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import TableCard, { Th } from "../components/ui/DataTable";
import SearchInput from "../components/ui/SearchInput";
import StyledSelect from "../components/ui/StyledSelect";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import FormField from "../components/ui/FormField";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { SkeletonBlock } from "../components/ui/Skeleton";
import api from "../utils/api";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";

// ── i18n copy, 4 platform languages ──────────────────────────────────────────
const TXT = {
  uz: {
    title: "Perenaladka vaqtlari", subtitle: "Har bir yacheyka bo'yicha o'rtacha perenaladka vaqti, sababi va SKU",
    secTable: "Yacheykalar ro'yxati",
    colSupervisor: "Supervayzer", colCell: "Yacheyka", colMinutes: "Vaqt (min)", colReason: "Sabab", colSku: "SKU",
    searchPh: "Supervayzer, yacheyka yoki SKU…", allSups: "Barcha supervayzerlar",
    noMatch: "Mos qator topilmadi", empty: "Hozircha ma'lumot yo'q",
    add: "Qo'shish", edit: "Tahrirlash", del: "O'chirish", save: "Saqlash", cancel: "Bekor qilish",
    addTitle: "Yangi qator", editTitle: "Qatorni tahrirlash",
    delTitle: "Qatorni o'chirish", delMsg: "{cell} yacheykasining qatori o'chiriladi. Davom etasizmi?",
    fSupervisor: "Supervayzer", fCustom: "Ism (ro'yxatda yo'q)", fCell: "Yacheyka", fMinutes: "Perenaladka vaqti (min)",
    fSku: "SKU raqami", fReason: "Sabab", customOpt: "Boshqa ism…", minSuffix: "min",
    fCellCustom: "Yacheyka (ro'yxatda yo'q)", customCellOpt: "Boshqa yacheyka…",
  },
  uz_cyrl: {
    title: "Переналадка вақтлари", subtitle: "Ҳар бир ячейка бўйича ўртача переналадка вақти, сабаби ва SKU",
    secTable: "Ячейкалар рўйхати",
    colSupervisor: "Супервайзер", colCell: "Ячейка", colMinutes: "Вақт (мин)", colReason: "Сабаб", colSku: "SKU",
    searchPh: "Супервайзер, ячейка ёки SKU…", allSups: "Барча супервайзерлар",
    noMatch: "Мос қатор топилмади", empty: "Ҳозирча маълумот йўқ",
    add: "Қўшиш", edit: "Таҳрирлаш", del: "Ўчириш", save: "Сақлаш", cancel: "Бекор қилиш",
    addTitle: "Янги қатор", editTitle: "Қаторни таҳрирлаш",
    delTitle: "Қаторни ўчириш", delMsg: "{cell} ячейкасининг қатори ўчирилади. Давом этасизми?",
    fSupervisor: "Супервайзер", fCustom: "Исм (рўйхатда йўқ)", fCell: "Ячейка", fMinutes: "Переналадка вақти (мин)",
    fSku: "SKU рақами", fReason: "Сабаб", customOpt: "Бошқа исм…", minSuffix: "мин",
    fCellCustom: "Ячейка (рўйхатда йўқ)", customCellOpt: "Бошқа ячейка…",
  },
  ru: {
    title: "Время переналадки", subtitle: "Среднее время переналадки по ячейкам — с причиной и SKU",
    secTable: "Реестр ячеек",
    colSupervisor: "Супервайзер", colCell: "Ячейка", colMinutes: "Время (мин)", colReason: "Причина", colSku: "SKU",
    searchPh: "Супервайзер, ячейка или SKU…", allSups: "Все супервайзеры",
    noMatch: "Нет подходящих строк", empty: "Данных пока нет",
    add: "Добавить", edit: "Изменить", del: "Удалить", save: "Сохранить", cancel: "Отмена",
    addTitle: "Новая строка", editTitle: "Изменить строку",
    delTitle: "Удалить строку", delMsg: "Строка ячейки {cell} будет удалена. Продолжить?",
    fSupervisor: "Супервайзер", fCustom: "Имя (не из списка)", fCell: "Ячейка", fMinutes: "Время переналадки (мин)",
    fSku: "Номер SKU", fReason: "Причина", customOpt: "Другое имя…", minSuffix: "мин",
    fCellCustom: "Ячейка (не из списка)", customCellOpt: "Другая ячейка…",
  },
  en: {
    title: "Setup times", subtitle: "Average changeover time per production cell — with reason and SKU",
    secTable: "Cells register",
    colSupervisor: "Supervisor", colCell: "Cell", colMinutes: "Time (min)", colReason: "Reason", colSku: "SKU",
    searchPh: "Supervisor, cell or SKU…", allSups: "All supervisors",
    noMatch: "No matching rows", empty: "No data yet",
    add: "Add", edit: "Edit", del: "Delete", save: "Save", cancel: "Cancel",
    addTitle: "New row", editTitle: "Edit row",
    delTitle: "Delete row", delMsg: "The row for cell {cell} will be deleted. Continue?",
    fSupervisor: "Supervisor", fCustom: "Name (not on the list)", fCell: "Cell", fMinutes: "Setup time (min)",
    fSku: "SKU number", fReason: "Reason", customOpt: "Custom name…", minSuffix: "min",
    fCellCustom: "Cell (not on the list)", customCellOpt: "Custom cell…",
  },
};

// Traffic-light accent for the minutes pill: quick setups green, 3–5 amber,
// longer red; missing values grey (platform status-color convention).
const minColor = (v) =>
  v == null ? "#94a3b8" : v < 3 ? "#22c55e" : v <= 5 ? "#eab308" : "#ef4444";
const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
const fmtMin = (v) => (v == null ? "—" : String(parseFloat(Number(v).toFixed(2))));

// The standard full-width modal text input (matches the Production/Concerns forms).
function ModalInput({ value, onChange, type = "text", className = "" }) {
  return (
    <input
      value={value}
      type={type}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-lg px-3 py-2 text-sm outline-none ${className}`}
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
    />
  );
}

const EMPTY_DRAFT = { manager_id: null, supervisor: "", cell: "", minutes: "", sku: "", reason: "" };

// Cell-registry helpers: pick the workshop name for the viewer language (falling
// back across languages) and label a picker option "code — name".
const CELL_LANGS = ["ru", "uz", "uz_cyrl", "en"];
const CUSTOM_CELL = "__custom__";
const pickName = (obj, lang) => {
  if (!obj) return "";
  for (const l of [lang, ...CELL_LANGS]) if (obj[l]) return obj[l];
  return "";
};
const cellOptLabel = (c, lang) => {
  const nm = pickName(c, lang);
  return nm ? `${c.code} — ${nm}` : c.code;
};

export default function SetupTimes() {
  const { lang } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const T = TXT[lang] || TXT.ru;

  const [search, setSearch] = useState("");
  const [supSel, setSupSel] = useState("all");
  const [sort, setSort] = useState({ key: null, dir: "asc" });
  const onSort = (k) => setSort((s) =>
    s.key !== k ? { key: k, dir: "asc" } : s.dir === "asc" ? { key: k, dir: "desc" } : { key: null, dir: "asc" });

  const [modal, setModal] = useState(null);      // null | { id?, draft }
  const [confirmDel, setConfirmDel] = useState(null); // row to delete

  const { data, isLoading } = useQuery({
    queryKey: ["setup-times"],
    queryFn: () => api.get("/api/setup-times").then((r) => r.data),
  });
  const canEdit = data?.can_edit;
  const allRows = data?.rows ?? [];
  const managers = data?.supervisors ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["setup-times"] });
  const saveRow = useMutation({
    mutationFn: ({ id, body }) =>
      id ? api.patch(`/api/setup-times/${id}`, body) : api.post("/api/setup-times", body),
    onSuccess: () => { setModal(null); invalidate(); },
  });
  const deleteRow = useMutation({
    mutationFn: (id) => api.delete(`/api/setup-times/${id}`),
    onSuccess: () => { setConfirmDel(null); invalidate(); },
  });

  // Filter options come from the rows themselves so unlinked free-text
  // supervisors (no manager unit) are filterable too.
  const supOpts = useMemo(() => {
    const names = [...new Set(allRows.map((r) => r.supervisor).filter(Boolean))]
      .sort((a, b) => tl(a).localeCompare(tl(b)));
    return [{ value: "all", label: T.allSups }, ...names.map((n) => ({ value: n, label: tl(n) }))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, lang]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = allRows;
    if (supSel !== "all") list = list.filter((r) => r.supervisor === supSel);
    if (q) list = list.filter((r) =>
      `${tl(r.supervisor)} ${r.supervisor} ${r.cell} ${r.sku} ${r.reason}`.toLowerCase().includes(q));
    if (!sort.key) return list;
    const val = (r) => ({
      supervisor: tl(r.supervisor || ""), cell: r.cell,
      minutes: r.minutes ?? -1, sku: r.sku, reason: r.reason,
    }[sort.key]);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, search, supSel, sort, tl, lang]);

  // ── edit modal helpers ─────────────────────────────────────────────────────
  const openCreate = () => setModal({ draft: { ...EMPTY_DRAFT } });
  const openEdit = (r) => setModal({
    id: r.id,
    draft: {
      manager_id: r.manager_id,
      supervisor: r.manager_id ? "" : r.supervisor,
      cell: r.cell, minutes: r.minutes ?? "", sku: r.sku, reason: r.reason,
    },
  });
  const setDraft = (key) => (v) => setModal((m) => ({ ...m, draft: { ...m.draft, [key]: v } }));

  const supValue = modal?.draft.manager_id != null ? `m${modal.draft.manager_id}` : "custom";
  const supSelectOpts = [
    ...managers.map((m) => ({ value: `m${m.id}`, label: tl(m.name) })),
    { value: "custom", label: T.customOpt },
  ];
  const onSupPick = (v) => setModal((m) => ({
    ...m,
    draft: { ...m.draft, manager_id: v === "custom" ? null : Number(v.slice(1)) },
  }));

  const canSave =
    (modal?.draft.cell ?? "").trim() !== "" &&
    (modal?.draft.manager_id != null || (modal?.draft.supervisor ?? "").trim() !== "");
  const submit = () => {
    const d = modal.draft;
    saveRow.mutate({
      id: modal.id,
      body: {
        manager_id: d.manager_id,
        supervisor: d.manager_id != null ? "" : d.supervisor.trim(),
        cell: d.cell.trim(),
        minutes: d.minutes === "" ? null : Number(d.minutes),
        sku: d.sku.trim(),
        reason: d.reason.trim(),
      },
    });
  };

  return (
    <Layout title={T.title}>
      {/* Header */}
      <div className="flex items-end justify-between gap-3 mb-5 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold leading-tight flex items-center gap-2" style={{ color: "var(--text-1)" }}>
            <Wrench size={20} style={{ color: "var(--brand-text)" }} /> {T.title}
          </h2>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: "var(--text-3)" }}>{T.subtitle}</p>
        </div>
      </div>

      <TableCard
        icon={LayoutGrid}
        title={T.secTable}
        right={
          <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-4)" }}>
            {isLoading ? "…" : rows.length}
          </span>
        }
        toolbar={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder={T.searchPh} className="w-full sm:w-56" />
            <StyledSelect value={supSel} onChange={setSupSel} options={supOpts} searchable className="w-full sm:w-56" />
            <div className="flex-grow" />
            {canEdit && (
              <Button size="lg" icon={<Plus size={14} />} onClick={openCreate}>{T.add}</Button>
            )}
          </>
        }
      >
        <thead>
          <tr>
            <Th icon={CircleUserRound} label={T.colSupervisor} k="supervisor" sort={sort} onSort={onSort} />
            <Th icon={LayoutGrid} label={T.colCell} k="cell" sort={sort} onSort={onSort} />
            <Th icon={Timer} label={T.colMinutes} k="minutes" sort={sort} onSort={onSort} align="right" />
            <Th icon={MessageSquareText} label={T.colReason} k="reason" sort={sort} onSort={onSort} />
            <Th icon={Barcode} label={T.colSku} k="sku" sort={sort} onSort={onSort} />
            {canEdit && <Th label="" />}
          </tr>
        </thead>
        <tbody>
          {isLoading &&
            Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: canEdit ? 6 : 5 }).map((_, j) => (
                  <td key={j} className="px-3 py-2"><SkeletonBlock className="h-3 w-full" /></td>
                ))}
              </tr>
            ))}
          {!isLoading && rows.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2">
                <span className="font-medium" style={{ color: "var(--text-1)" }}>{tl(r.supervisor)}</span>
              </td>
              <td className="px-3 py-2 font-mono tabular-nums" style={{ color: "var(--text-2)" }}>{r.cell}</td>
              <td className="px-3 py-2 text-right">
                <span
                  className="inline-block min-w-[42px] text-center px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums"
                  style={{ background: hexA(minColor(r.minutes), 0.13), color: minColor(r.minutes) }}
                >
                  {fmtMin(r.minutes)}
                </span>
              </td>
              <td className="px-3 py-2 whitespace-normal min-w-[180px] max-w-[320px] text-[11px] leading-snug"
                style={{ color: r.reason ? "var(--text-2)" : "var(--text-4)" }}>
                {r.reason || "—"}
              </td>
              <td className="px-3 py-2 font-mono" style={{ color: r.sku ? "var(--text-2)" : "var(--text-4)" }}>
                {r.sku || "—"}
              </td>
              {canEdit && (
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1">
                    <button title={T.edit} onClick={() => openEdit(r)}
                      className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-accent)]"
                      style={{ color: "var(--text-3)" }}>
                      <Pencil size={13} />
                    </button>
                    <button title={T.del} onClick={() => setConfirmDel(r)}
                      className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-accent)]"
                      style={{ color: "#ef4444" }}>
                      <Trash2 size={13} />
                    </button>
                  </span>
                </td>
              )}
            </tr>
          ))}
          {!isLoading && rows.length === 0 && (
            <tr>
              <td colSpan={canEdit ? 6 : 5} className="px-4 py-8 text-center" style={{ color: "var(--text-4)" }}>
                {search || supSel !== "all" ? T.noMatch : T.empty}
              </td>
            </tr>
          )}
        </tbody>
      </TableCard>

      {/* Create / edit modal */}
      {modal && (
        <Modal
          title={modal.id ? T.editTitle : T.addTitle}
          icon={<Wrench size={18} style={{ color: "var(--brand-text)" }} />}
          onClose={() => setModal(null)}
          dismissable={!saveRow.isPending}
          footer={
            <>
              <Button variant="secondary" onClick={() => setModal(null)} disabled={saveRow.isPending}>{T.cancel}</Button>
              <Button onClick={submit} disabled={!canSave} loading={saveRow.isPending}>{T.save}</Button>
            </>
          }
        >
          <FormField label={T.fSupervisor} required>
            <StyledSelect value={supValue} onChange={onSupPick} options={supSelectOpts} searchable />
          </FormField>
          {modal.draft.manager_id == null && (
            <FormField label={T.fCustom} required>
              <ModalInput value={modal.draft.supervisor} onChange={setDraft("supervisor")} />
            </FormField>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField label={T.fCell} required>
              <ModalInput value={modal.draft.cell} onChange={setDraft("cell")} className="font-mono" />
            </FormField>
            <FormField label={T.fMinutes}>
              <ModalInput value={modal.draft.minutes} onChange={setDraft("minutes")} type="number" />
            </FormField>
          </div>
          <FormField label={T.fSku}>
            <ModalInput value={modal.draft.sku} onChange={setDraft("sku")} className="font-mono" />
          </FormField>
          <FormField label={T.fReason}>
            <textarea
              value={modal.draft.reason}
              onChange={(e) => setDraft("reason")(e.target.value)}
              rows={3}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
            />
          </FormField>
        </Modal>
      )}

      {/* Delete confirmation */}
      {confirmDel && (
        <ConfirmDialog
          tone="danger"
          title={T.delTitle}
          message={T.delMsg.replace("{cell}", confirmDel.cell)}
          confirmLabel={T.del}
          cancelLabel={T.cancel}
          loading={deleteRow.isPending}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => deleteRow.mutate(confirmDel.id)}
        />
      )}
    </Layout>
  );
}
