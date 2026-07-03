import { useState, useEffect } from "react";
import { Pencil, Loader2, Check } from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit, transliterate } from "../../utils/transliterate";

const ROLE_TKEYS = {
  "admin":         "role.admin",
  "top-manager":   "role.topManager",
  "shift-manager": "role.manager",
  "supervisor":    "role.supervisor",
  "leader":        "role.leader",
};

/**
 * Settings-modal section: the caller's approved profiles with editable names.
 * The canonical (Uzbek) name is a real rename — it cascades app-wide; the
 * other languages are display overrides on top of automatic transliteration.
 * Renders nothing while the user has no approved profile.
 */
export default function MyNameEditor() {
  const { t, languages, reloadTranslations } = useLang();
  const { tl } = useTranslit();
  const [profiles, setProfiles] = useState(null);
  const [editing, setEditing]   = useState(null);   // index into profiles
  const [form, setForm]         = useState({ name: "", overrides: {} });
  const [saving, setSaving]     = useState(false);
  const [savedIdx, setSavedIdx] = useState(null);
  const [error, setError]       = useState("");

  const load = () =>
    api.get("/api/profiles/mine")
      .then((r) => setProfiles(r.data.profiles || []))
      .catch(() => setProfiles([]));

  useEffect(() => { load(); }, []);

  if (!profiles?.length) return null;

  function openEditor(i) {
    const p = profiles[i];
    const ov = {};
    for (const l of languages) ov[l.code] = p.overrides?.[l.code] || "";
    setForm({ name: p.canonical, overrides: ov });
    setEditing(i);
    setSavedIdx(null);
    setError("");
  }

  function save() {
    const p = profiles[editing];
    const name = (form.name || "").trim();
    if (!name) { setError(t("admin.profiles.nameRequired")); return; }
    setSaving(true);
    setError("");
    api.put("/api/profiles/mine", {
      kind: p.kind,
      role_ref: p.role_ref,
      name,
      overrides: form.overrides,
    })
      .then(() => {
        reloadTranslations();
        setSavedIdx(editing);
        setEditing(null);
        return load();
      })
      .catch((e) => setError(e?.response?.data?.detail || t("settings.error")))
      .finally(() => setSaving(false));
  }

  const inputCls = "w-full rounded-lg px-2.5 py-1.5 text-xs outline-none";
  const inputStyle = { background: "var(--input-bg)", border: "1px solid var(--border-md)", color: "var(--text-1)" };

  return (
    <div className="px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
      <span className="text-[10px] font-semibold uppercase tracking-wider block mb-2" style={{ color: "var(--text-4)" }}>
        {t("settings.myName")}
      </span>

      <div className="space-y-1.5">
        {profiles.map((p, i) => (
          <div key={`${p.kind}-${p.role_ref ?? "admin"}`}
               className="rounded-xl overflow-hidden"
               style={{ border: "1px solid var(--border-md)", background: "var(--bg-inner)" }}>
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate" style={{ color: "var(--text-1)" }}>
                  {tl(p.canonical)}
                </div>
                <div className="text-[10px]" style={{ color: "var(--text-3)" }}>
                  {t(ROLE_TKEYS[p.role]) || p.role}
                </div>
              </div>
              {savedIdx === i && <Check size={13} style={{ color: "#22c55e" }} />}
              <button
                onClick={() => (editing === i ? setEditing(null) : openEditor(i))}
                className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
                style={{ color: editing === i ? "var(--brand-text)" : "var(--text-3)" }}
                title={t("admin.profiles.edit")}
              >
                <Pencil size={13} />
              </button>
            </div>

            {editing === i && (
              <div className="px-3 pb-3 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
                <label className="block pt-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
                    {t("settings.canonicalLabel")}
                  </span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className={inputCls + " mt-1"}
                    style={inputStyle}
                  />
                  {p.role === "supervisor" && form.name.trim() !== p.canonical && (
                    <p className="mt-1 text-[10px] leading-snug" style={{ color: "#eab308" }}>
                      {t("settings.supRenameWarn")}
                    </p>
                  )}
                </label>

                {languages.map((l) => (
                  <label key={l.code} className="flex items-center gap-2">
                    <span className="w-12 flex-shrink-0 text-[10px] font-mono uppercase" style={{ color: "var(--text-4)" }}>
                      {l.code}
                    </span>
                    <input
                      type="text"
                      value={form.overrides[l.code] || ""}
                      onChange={(e) => setForm((f) => ({
                        ...f, overrides: { ...f.overrides, [l.code]: e.target.value },
                      }))}
                      placeholder={transliterate(form.name.trim(), l.code)}
                      className={inputCls}
                      style={inputStyle}
                    />
                  </label>
                ))}

                {error && <p className="text-[10px] font-medium" style={{ color: "#ef4444" }}>{error}</p>}

                <div className="flex justify-end pt-1">
                  <button
                    onClick={save}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-colors"
                    style={{ background: "var(--brand)" }}
                  >
                    {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                    {t("settings.save")}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
