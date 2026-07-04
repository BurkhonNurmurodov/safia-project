import { useState, useEffect } from "react";
import { Languages, Loader2, Check } from "lucide-react";
import api from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LangContext";
import { transliterate, convertFromUz } from "../../utils/transliterate";
import { SkeletonBlock } from "./Skeleton";
import { ROLE_LABEL_KEYS } from "../../config/pages";

const langLabel = (code) => (code === "uz_cyrl" ? "ЎЗ" : code.toUpperCase());

/**
 * Settings-modal section: the ACTIVE profile's name in every language.
 * The Uzbek (Latin) input is the canonical name — a real rename that cascades
 * app-wide; the other languages are display overrides, each with a translate
 * button that derives the value from the Uzbek text by alphabet switching.
 * Renders nothing when the caller's active profile has no editable name.
 */
export default function MyNameEditor() {
  const { auth } = useAuth();
  const { t, languages, reloadTranslations } = useLang();
  const [profile, setProfile] = useState(null);   // active /mine entry
  const [loading, setLoading] = useState(true);
  const [name, setName]       = useState("");     // canonical (uz)
  const [ov, setOv]           = useState({});     // lang → display override
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState("");

  const otherLangs = languages.filter((l) => l.code !== "uz");

  useEffect(() => {
    api.get("/api/profiles/mine")
      .then((r) => {
        const list = r.data.profiles || [];
        const p = auth?.role === "admin"
          ? list.find((e) => e.kind === "admin")
          : list.find((e) => e.kind === "role" && e.role_ref === auth?.active_role_ref)
            || list.find((e) => e.role === auth?.role);
        if (p) {
          setProfile(p);
          setName(p.canonical || "");
          setOv(p.overrides || {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [auth?.role, auth?.active_role_ref]);

  if (loading) {
    return (
      <div className="px-5 py-4 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
        <SkeletonBlock className="h-3 w-16 mb-3" />
        {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-8 w-full rounded-lg" />)}
      </div>
    );
  }
  if (!profile) return null;

  function save() {
    const clean = (name || "").trim();
    if (!clean) { setError(t("admin.profiles.nameRequired")); return; }
    setSaving(true);
    setError("");
    const overrides = { uz: "" };  // canonical IS the Uzbek name — clear stale uz overrides
    for (const l of otherLangs) overrides[l.code] = ov[l.code] || "";
    api.put("/api/profiles/mine", {
      kind: profile.kind,
      role_ref: profile.role_ref,
      name: clean,
      overrides,
    })
      .then((r) => {
        reloadTranslations();
        setProfile((p) => ({ ...p, canonical: r.data?.canonical || clean }));
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      })
      .catch((e) => setError(e?.response?.data?.detail || t("settings.error")))
      .finally(() => setSaving(false));
  }

  const inputCls = "w-full rounded-lg px-2.5 py-1.5 text-xs outline-none";
  const inputStyle = { background: "var(--input-bg)", border: "1px solid var(--border-md)", color: "var(--text-1)" };

  return (
    <div className="px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
          {t("settings.myName")}
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
          {t(ROLE_TKEYS[profile.role]) || profile.role}
        </span>
      </div>

      <div className="space-y-2">
        {/* Canonical Uzbek name — the source the other languages derive from */}
        <div className="flex items-center gap-2">
          <span className="w-8 flex-shrink-0 text-[10px] font-mono font-semibold" style={{ color: "var(--text-4)" }}>
            UZ
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setSaved(false); }}
            className={inputCls}
            style={inputStyle}
          />
          <span className="w-7 flex-shrink-0" />
        </div>
        {profile.role === "supervisor" && name.trim() !== profile.canonical && (
          <p className="text-[10px] leading-snug pl-10" style={{ color: "#eab308" }}>
            {t("settings.supRenameWarn")}
          </p>
        )}

        {otherLangs.map((l) => (
          <div key={l.code} className="flex items-center gap-2">
            <span className="w-8 flex-shrink-0 text-[10px] font-mono font-semibold" style={{ color: "var(--text-4)" }}>
              {langLabel(l.code)}
            </span>
            <input
              type="text"
              value={ov[l.code] || ""}
              onChange={(e) => { setOv((o) => ({ ...o, [l.code]: e.target.value })); setSaved(false); }}
              placeholder={transliterate(name.trim(), l.code)}
              className={inputCls}
              style={inputStyle}
            />
            <button
              onClick={() => { setOv((o) => ({ ...o, [l.code]: convertFromUz(name.trim(), l.code) })); setSaved(false); }}
              className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10"
              style={{ color: "var(--text-3)", border: "1px solid var(--border-md)" }}
              title={t("settings.translate")}
            >
              <Languages size={12} />
            </button>
          </div>
        ))}

        {error && <p className="text-[10px] font-medium" style={{ color: "#ef4444" }}>{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-1">
          {saved && (
            <span className="flex items-center gap-1 text-[10px] font-medium" style={{ color: "#22c55e" }}>
              <Check size={11} /> {t("settings.saved")}
            </span>
          )}
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
    </div>
  );
}
