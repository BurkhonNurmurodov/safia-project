import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, CheckCircle2, XCircle, Loader2, Factory, Save } from "lucide-react";
import api from "../../utils/api";

// Pilot phase: only the one brigadir (manager 5). Extend this list as the
// rollout grows, or replace with a managers fetch.
const BRIGADIRS = [{ id: 5, name: "Абдугамитов Мухаммад (Sheet1 Торт)" }];

const todayISO = () => new Date().toISOString().slice(0, 10);

const card = "bg-[#1a1d27] border border-white/5 rounded-xl p-5";
const label = "text-[11px] font-semibold text-gray-500 uppercase tracking-wider";
const input = "bg-[#12151f] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-[var(--brand)]";

// ── штатка / capacity editor ─────────────────────────────────────────────────
function WorkCenters({ managerId }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["pp-wc", managerId],
    queryFn: () => api.get("/admin/production/work-centers", { params: { manager_id: managerId } }).then((r) => r.data),
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
        <table className="w-full text-sm text-gray-200">
          <thead>
            <tr className="text-gray-500 text-xs">
              <th className="text-left py-2">Команда</th>
              <th className="text-right py-2">Штатка (W)</th>
              <th className="text-right py-2">Мощность S</th>
              <th className="text-right py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.map((w) => (
              <tr key={w.id} className="border-t border-white/5">
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
      <div className="text-[11px] text-gray-600 mt-3">
        Людей = ОКРУГЛ(W × Σтруд / S). S ≈ W × 408 (85% от 480 мин/смена).
      </div>
    </div>
  );
}

// ── фаза upload ───────────────────────────────────────────────────────────────
export default function ProductionUpload() {
  const [managerId, setManagerId] = useState(BRIGADIRS[0].id);
  const [date, setDate] = useState(todayISO());
  const [mode, setMode] = useState("both");
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
          <div className={label}>Загрузка SAP «фаза»</div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <label className="flex flex-col gap-1.5">
            <span className={label}>Бригадир</span>
            <select value={managerId} onChange={(e) => setManagerId(Number(e.target.value))} className={input}>
              {BRIGADIRS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={label}>Дата</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={label}>Режим</span>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className={input}>
              <option value="both">План + Факт</option>
              <option value="plan">Только План (утро)</option>
              <option value="actual">Только Факт (вечер)</option>
            </select>
          </label>
        </div>

        <input
          type="file" accept=".xlsx" multiple
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
          className="block w-full text-sm text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[var(--brand)] file:text-white file:text-sm file:font-semibold"
        />
        <div className="text-[11px] text-gray-600 mt-1">Файл «План … фаза». Колонка F → План, M → Факт, J → дата.</div>

        <button
          onClick={doUpload}
          disabled={!files.length || state.status === "uploading"}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--brand)] text-white disabled:opacity-50"
        >
          {state.status === "uploading" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          Загрузить
        </button>

        {state.status === "ok" && (
          <div className="mt-4 bg-[#12151f] rounded-lg p-4 text-sm">
            <div className="flex items-center gap-2 text-green-400 font-semibold mb-2">
              <CheckCircle2 size={14} /> Записано строк: {state.data.rows_written}
            </div>
            <div className="text-xs text-gray-400">Даты в файле: {state.data.dates_in_file?.join(", ") || "—"}</div>
            {state.data.files?.map((f) => (
              <div key={f.file} className="text-xs text-gray-500 mt-1 font-mono">
                {f.file}: {f.rows} строк, совпадений на дату: {f.matched_keys_for_date}
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

      <WorkCenters managerId={managerId} />
    </div>
  );
}
