import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Lock, Check, Loader2, CheckCircle2, XCircle } from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { PAGES, TOGGLEABLE_ROLES, ROLE_LABEL_KEYS } from "../../config/pages";

export default function PageAccess() {
  const { t } = useLang();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-page-access"],
    queryFn: () => api.get("/admin/page-access").then((r) => r.data),
  });

  // Local editable copy: { pageKey: [roles] }
  const [matrix, setMatrix] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle");

  useEffect(() => {
    if (data?.pages) {
      // Clone so edits don't mutate the cached query data
      const clone = {};
      for (const p of PAGES) clone[p.key] = [...(data.pages[p.key] || [])];
      setMatrix(clone);
    }
  }, [data]);

  function toggle(pageKey, role) {
    setMatrix((prev) => {
      const current = prev[pageKey] || [];
      const next = current.includes(role)
        ? current.filter((r) => r !== role)
        : [...current, role];
      return { ...prev, [pageKey]: next };
    });
  }

  async function save() {
    setSaveStatus("saving");
    try {
      await api.put("/admin/page-access", { pages: matrix });
      qc.invalidateQueries({ queryKey: ["admin-page-access"] });
      qc.invalidateQueries({ queryKey: ["page-access"] }); // refresh live nav/guards
      setSaveStatus("ok");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }

  // Admin is always-on; render it as a locked leading column.
  const COLUMNS = ["admin", ...TOGGLEABLE_ROLES];

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8">
      <div className="bg-[#1a1d27] border border-white/5 rounded-xl p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-[var(--brand-text)]" />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {t("admin.access.title")}
            </span>
          </div>
          <button
            onClick={save}
            disabled={saveStatus === "saving" || !matrix}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              saveStatus === "ok"     ? "bg-green-500/20 text-green-400 border border-green-500/30" :
              saveStatus === "error"  ? "bg-red-500/20 text-red-400 border border-red-500/30" :
              saveStatus === "saving" ? "bg-white/5 text-gray-500 border border-white/10 cursor-not-allowed" :
                                        "bg-[var(--brand)] hover:bg-[var(--brand-text)] text-gray-900 border border-transparent"
            }`}
          >
            {saveStatus === "saving" ? <Loader2 size={12} className="animate-spin" /> :
             saveStatus === "ok"     ? <CheckCircle2 size={12} /> :
             saveStatus === "error"  ? <XCircle size={12} /> : null}
            {saveStatus === "ok"    ? t("admin.saved") :
             saveStatus === "error" ? t("admin.refreshFailed") : t("admin.save")}
          </button>
        </div>
        <p className="text-[11px] text-gray-500 mb-5">{t("admin.access.hint")}</p>

        {isLoading || !matrix ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="text-[var(--brand-text)] animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs min-w-[520px]">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    {t("admin.access.colPage")}
                  </th>
                  {COLUMNS.map((role) => (
                    <th
                      key={role}
                      className="py-2 px-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-center whitespace-nowrap"
                    >
                      <span className="inline-flex items-center gap-1 justify-center">
                        {role === "admin" && <Lock size={9} className="text-gray-600" />}
                        {t(ROLE_LABEL_KEYS[role])}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PAGES.map((p) => (
                  <tr
                    key={p.key}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    className="hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-2.5 px-3 font-medium text-gray-200 whitespace-nowrap">
                      {t(p.labelKey)}
                    </td>
                    {COLUMNS.map((role) => {
                      const locked = role === "admin";
                      const checked = locked || (matrix[p.key] || []).includes(role);
                      return (
                        <td key={role} className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => toggle(p.key, role)}
                            aria-label={`${t(p.labelKey)} — ${t(ROLE_LABEL_KEYS[role])}`}
                            className="inline-flex items-center justify-center w-6 h-6 rounded-md border transition-colors"
                            style={
                              checked
                                ? { background: locked ? "var(--brand-bg)" : "var(--brand)",
                                    borderColor: "transparent",
                                    cursor: locked ? "not-allowed" : "pointer" }
                                : { background: "transparent",
                                    borderColor: "rgba(255,255,255,0.15)",
                                    cursor: "pointer" }
                            }
                          >
                            {checked && <Check size={13} className={locked ? "text-[var(--brand-text)]" : "text-white"} />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
