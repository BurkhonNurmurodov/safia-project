import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, CheckCircle2, XCircle, Loader2, Factory, Save, BookOpen } from "lucide-react";
import api from "../../utils/api";
import StyledSelect from "../../components/ui/StyledSelect";
import DateRangePicker from "../../components/ui/DateRangePicker";
import FormField from "../../components/ui/FormField";

// Timezone-safe (toISOString() drops a day east of UTC, e.g. Tashkent +5).
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const card = "bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5";
const label = "text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider";
const input = "bg-[var(--bg-inner)] border border-[var(--border-md)] rounded-lg px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--brand)]";

// ── штатка / capacity editor ─────────────────────────────────────────────────
function WorkCenters({ managerId }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["pp-wc", managerId],
    queryFn: () => api.get("/admin/production/work-centers", { params: { manager_id: managerId } }).then((r) => r.data),
    enabled: managerId != null,
  });
  const save = useMutation({
    mutationFn: ({ id, body }) => api.put(`/admin/production/work-centers/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pp-wc", managerId] }),
  });
  const [draft, setDraft] = useState({});
  const val = (w, f) => (draft[w.id]?.[f] ?? w[f] ?? "");
  const set = (id, f, v) => setDraft((d) => ({ ...d, [id]: { ...d[id], [f]: v === "" ? null : Number(v) } }));

  return (
    <div className={card}>
      <div className="flex items-center gap-2 mb-4">
        <Factory size={15} className="text-[var(--brand-text)]" />
        <div className={label}>Команды — штатка и мощность (S)</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-[var(--text-1)]">
          <thead>
            <tr className="text-[var(--text-3)] text-xs">
              <th className="text-left py-2">Команда</th>
              <th className="text-right py-2">Штатка (W)</th>
              <th className="text-right py-2">Мощность S</th>
              <th className="text-right py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.map((w) => (
              <tr key={w.id} className="border-t border-[var(--border)]">
                <td className="py-2 font-semibold">{w.code}</td>
                <td className="py-2 text-right">
                  <input type="number" value={val(w, "shtatka")} onChange={(e) => set(w.id, "shtatka", e.target.value)}
                    className={`${input} w-20 text-right`} />
                </td>
                <td className="py-2 text-right">
                  <input type="number" value={val(w, "capacity")} onChange={(e) => set(w.id, "capacity", e.target.value)}
                    className={`${input} w-24 text-right`} />
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => save.mutate({ id: w.id, body: { shtatka: val(w, "shtatka"), capacity: val(w, "capacity") } })}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--brand)] text-white">
                    <Save size={11} /> Сохр.
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-[var(--text-4)] mt-3">
        Людей = ОКРУГЛ(W × Σтруд / S). S ≈ W × 408 (85% от 480 мин/смена).
      </div>
    </div>
  );
}

// ── catalog import (Sheet1 …) ────────────────────────────────────────────────
function CatalogImport({ managerId, setManagerId, brigadirs }) {
  const qc = useQueryClient();
  const [sheet, setSheet] = useState("Sheet1 Торт");
  const [file, setFile] = useState(null);
  const [state, setState] = useState({ status: "idle" });

  async function doImport() {
    if (!file) return;
    setState({ status: "uploading" });
    const form = new FormData();
    form.append("file", file);
    form.append("manager_id", managerId);
    if (sheet.trim()) form.append("sheet_name", sheet.trim());
    try {
      const { data } = await api.post("/admin/production/catalog/import", form);
      setState({ status: "ok", data });
      qc.invalidateQueries({ queryKey: ["pp-wc", managerId] });
    } catch (e) {
      setState({ status: "error", detail: e?.response?.data?.detail || "Ошибка импорта" });
    }
  }

  return (
    <div className={card}>
      <div className="flex items-center gap-2 mb-4">
        <BookOpen size={15} className="text-[var(--brand-text)]" />
        <div className={label}>Импорт каталога (лист «Sheet1 …»)</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <FormField label="Бригадир">
          <StyledSelect
            value={managerId != null ? String(managerId) : ""}
            onChange={(v) => setManagerId(Number(v))}
            options={brigadirs.map((b) => ({
              value: String(b.manager_id),
              label: b.name + (b.shift ? ` · Смена ${b.shift}` : ""),
            }))}
            placeholder="Выберите бригадира"
          />
        </FormField>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Имя листа</span>
          <input value={sheet} onChange={(e) => setSheet(e.target.value)} placeholder="Sheet1 Торт" className={input} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Файл (.xlsx)</span>
          <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="text-sm text-[var(--text-2)] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[var(--brand)] file:text-white file:text-sm file:font-semibold" />
        </label>
      </div>
      <div className="text-[11px] text-[var(--text-4)] mb-3">
        Заменяет товары и обновляет штатку/мощность из листа. Строки без SAP-кода («0») отбрасываются. Снимки данных не затрагиваются.
      </div>
      <button onClick={doImport} disabled={!file || state.status === "uploading"}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--brand)] text-white disabled:opacity-50">
        {state.status === "uploading" ? <Loader2 size={14} className="animate-spin" /> : <BookOpen size={14} />}
        Импортировать
      </button>
      {state.status === "ok" && (
        <div className="mt-3 flex items-center gap-2 text-green-400 text-sm">
          <CheckCircle2 size={14} /> Лист «{state.data.sheet}»: {state.data.products} товаров, команд +{state.data.work_centers_added}/~{state.data.work_centers_updated}
        </div>
      )}
      {state.status === "error" && (
        <div className="mt-3 flex items-center gap-2 text-red-400 text-sm">
          <XCircle size={14} /> {state.detail}
        </div>
      )}
    </div>
  );
}

// ── фаза upload ───────────────────────────────────────────────────────────────
export default function ProductionUpload() {
  const [managerId, setManagerId] = useState(BRIGADIRS[0].id);
  const [date, setDate] = useState(todayISO());
  const [mode, setMode] = useState("both");
  const [fileType, setFileType] = useState("auto"); // auto | faza | zaga
  const [files, setFiles] = useState([]);
  const [state, setState] = useState({ status: "idle" });

  async function doUpload() {
    if (!files.length) return;
    setState({ status: "uploading" });
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    form.append("manager_id", managerId);
    form.append("date", date);
    form.append("mode", mode);
    if (fileType !== "auto") form.append("file_type", fileType);
    try {
      const { data } = await api.post("/admin/production/upload", form);
      setState({ status: "ok", data });
    } catch (e) {
      setState({ status: "error", detail: e?.response?.data?.detail || "Ошибка загрузки" });
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-6">
      <div className={card}>
        <div className="flex items-center gap-2 mb-4">
          <Upload size={15} className="text-[var(--brand-text)]" />
          <div className={label}>Загрузка SAP файлов (фаза + заголовок)</div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <FormField label="Дата">
            <DateRangePicker
              single
              dateFrom={date} dateTo={date}
              setDateFrom={setDate} setDateTo={() => {}}
              triggerClassName="px-3 py-2 text-sm w-full"
            />
          </FormField>
          <FormField label="Режим">
            <StyledSelect
              value={mode}
              onChange={setMode}
              options={[
                { value: "both", label: "План + Факт" },
                { value: "plan", label: "Только План (утро)" },
                { value: "actual", label: "Только Факт (вечер)" },
              ]}
            />
          </FormField>
          <FormField label="Тип файла">
            <StyledSelect
              value={fileType}
              onChange={setFileType}
              options={[
                { value: "auto", label: "Авто-определение" },
                { value: "faza", label: "Фаза (операции)" },
                { value: "zaga", label: "Заголовок (заказы)" },
              ]}
            />
          </FormField>
        </div>

        <input
          type="file" accept=".xlsx" multiple
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
          className="block w-full text-sm text-[var(--text-2)] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[var(--brand)] file:text-white file:text-sm file:font-semibold"
        />
        <div className="text-[11px] text-[var(--text-4)] mt-1">
          Выберите оба файла: «фаза» (операции) и «заголовок» (заказы→SKU). Тип определяется автоматически; соединяются по номеру заказа.
        </div>

        <button
          onClick={doUpload}
          disabled={!files.length || state.status === "uploading"}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--brand)] text-white disabled:opacity-50"
        >
          {state.status === "uploading" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          Загрузить
        </button>

        {state.status === "ok" && (
          <div className="mt-4 bg-[var(--bg-inner)] rounded-lg p-4 text-sm">
            <div className="flex items-center gap-2 text-green-400 font-semibold mb-2">
              <CheckCircle2 size={14} /> Записано строк (SKU×команда): {state.data.rows_written}
            </div>
            <div className="text-xs text-[var(--text-2)]">
              Операций «фаза»: {state.data.faza_operations} · Заказов в карте: {state.data.zaga_orders}
              {state.data.unmapped_operations > 0 && (
                <span className="text-yellow-500"> · без SKU: {state.data.unmapped_operations} (загрузите «заголовок»)</span>
              )}
            </div>
            {state.data.files?.map((f, i) => (
              <div key={i} className="text-xs text-[var(--text-3)] mt-1 font-mono">
                {f.file}: {f.faza ? `фаза — ${f.faza.operations} опер.` : f.zaga ? `заголовок — ${f.zaga.orders} заказов` : "не распознан"}
              </div>
            ))}
          </div>
        )}
        {state.status === "error" && (
          <div className="mt-4 flex items-center gap-2 text-red-400 text-sm">
            <XCircle size={14} /> {state.detail}
          </div>
        )}
      </div>

      <CatalogImport managerId={managerId} setManagerId={setManagerId} />
      <WorkCenters managerId={managerId} />
    </div>
  );
}
