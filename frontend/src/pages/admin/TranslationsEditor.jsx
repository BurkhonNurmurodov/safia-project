import { useState, useMemo, useEffect } from "react";
import { Search, Plus, Save, Globe, Check, Loader2 } from "lucide-react";
import dict from "../../i18n/translations";
import { useLang } from "../../context/LangContext";
import { transliterate } from "../../utils/transliterate";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import api from "../../utils/api";

const BASE_LANGS = ["uz", "uz_cyrl", "ru", "en"];

// Nice display names for the key-prefix groups (pages). Anything not listed
// falls back to a capitalised prefix.
const GROUP_LABELS = {
  nav: "Navigation", filter: "Filters", overview: "Overview", zagruzka: "Zagruzka",
  workers: "Workers", plan: "Plan Fulfillment", downtime: "Idle Time", profile: "Brigadir Profile",
  attendance: "Attendance", login: "Login", auth: "Auth", admin: "Admin Panel",
  staff: "Staff", daily: "Daily", approvals: "Approvals", comment: "Comments",
  status: "Statuses", theme: "Theme", empty: "Empty states", general: "General", common: "Common",
};

// Dynamic DB-value groups (brigadir names, job titles, worker FIOs). These are
// auto-populated from the database and saved as "name.<raw value>" keys; the
// runtime tl() helper prefers them over automatic transliteration.
const NAME_PREFIX = "name.";
const NAME_GROUPS = [
  { g: "names:brigadirs", label: "Brigadir names", src: "brigadirs" },
  { g: "names:jobs",      label: "Job titles",     src: "job_titles" },
  { g: "names:workers",   label: "Worker names",   src: "workers" },
];
const isNameGroup = (g) => g.startsWith("names:");
const MAX_ROWS = 150; // render cap — worker lists can be huge, search narrows

function groupOf(key) {
  const i = key.indexOf(".");
  return i === -1 ? "general" : key.slice(0, i);
}
function labelOf(group) {
  return GROUP_LABELS[group] || group.charAt(0).toUpperCase() + group.slice(1);
}

export default function TranslationsEditor() {
  const { reloadTranslations, t } = useLang();

  const [overrides, setOverrides] = useState({});
  const [languages, setLanguages] = useState(BASE_LANGS.map((c) => ({ code: c, name: c.toUpperCase() })));
  const [extraKeys, setExtraKeys] = useState([]);          // newly-added keys not in the static dict
  const [dbNames, setDbNames] = useState({ brigadirs: [], job_titles: [], workers: [] });
  const [edits, setEdits] = useState({});                  // { "lang|key": value }
  const [group, setGroup] = useState("nav");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [initLoading, setInitLoading] = useState(true);

  const mergeOverrides = (prev, incoming) => {
    const next = { ...prev };
    Object.entries(incoming).forEach(([lang, kv]) => {
      next[lang] = { ...(next[lang] || {}), ...kv };
    });
    return next;
  };

  function load() {
    // UI-string overrides + language list (public) and name.* overrides (auth)
    // arrive separately — merge both into the same overrides map.
    setInitLoading(true);
    Promise.allSettled([
      api.get("/api/translations").then((r) => {
        setOverrides((prev) => mergeOverrides(prev, r.data?.overrides || {}));
        if (r.data?.languages?.length) {
          setLanguages(r.data.languages.map((l) => ({ code: l.code, name: l.name })));
        }
      }),
      api.get("/api/translations/names").then((r) => {
        setOverrides((prev) => mergeOverrides(prev, r.data?.overrides || {}));
      }),
      api.get("/api/admin/translations/names").then((r) => {
        setDbNames({ brigadirs: [], job_titles: [], workers: [], ...(r.data || {}) });
      }),
    ]).finally(() => setInitLoading(false));
  }
  useEffect(() => { load(); }, []);

  // Union of all keys (static dict + DB overrides + locally-added).
  // name.* keys are excluded — they live in the dedicated name groups.
  const allKeys = useMemo(() => {
    const set = new Set();
    BASE_LANGS.forEach((l) => Object.keys(dict[l] || {}).forEach((k) => set.add(k)));
    Object.values(overrides).forEach((obj) => Object.keys(obj).forEach((k) => {
      if (!k.startsWith(NAME_PREFIX)) set.add(k);
    }));
    extraKeys.forEach((k) => set.add(k));
    return [...set];
  }, [overrides, extraKeys]);

  const groups = useMemo(() => {
    const counts = {};
    allKeys.forEach((k) => { const g = groupOf(k); counts[g] = (counts[g] || 0) + 1; });
    return Object.keys(counts).sort().map((g) => ({ g, label: labelOf(g), count: counts[g] }));
  }, [allKeys]);

  const nameGroups = useMemo(
    () => NAME_GROUPS.map(({ g, label, src }) => ({ g, label, count: (dbNames[src] || []).length })),
    [dbNames]
  );

  // Rows: { key, label, rawName? }. For name groups the label is the raw DB
  // value and the key is its "name."-prefixed storage key.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (isNameGroup(group)) {
      const src = NAME_GROUPS.find((n) => n.g === group)?.src;
      return (dbNames[src] || [])
        .filter((n) => !q || n.toLowerCase().includes(q) || transliterate(n, "en").toLowerCase().includes(q))
        .map((n) => ({ key: `${NAME_PREFIX}${n}`, label: n, rawName: n }));
    }
    return allKeys
      .filter((k) => groupOf(k) === group)
      .filter((k) => !q || k.toLowerCase().includes(q))
      .sort()
      .map((k) => ({ key: k, label: k }));
  }, [allKeys, group, search, dbNames]);

  const effective = (lang, key) => overrides[lang]?.[key] ?? dict[lang]?.[key] ?? "";
  const cellValue = (lang, key) => {
    const ek = `${lang}|${key}`;
    return ek in edits ? edits[ek] : effective(lang, key);
  };
  const setCell = (lang, key, value) => setEdits((e) => ({ ...e, [`${lang}|${key}`]: value }));
  const dirtyCount = Object.keys(edits).length;

  async function save() {
    if (!dirtyCount) return;
    setSaving(true);
    const items = Object.entries(edits).map(([ek, value]) => {
      const [lang, ...rest] = ek.split("|");
      return { lang, key: rest.join("|"), value };
    });
    try {
      await api.put("/api/admin/translations", { items });
      // merge locally
      setOverrides((prev) => {
        const next = { ...prev };
        items.forEach(({ lang, key, value }) => {
          next[lang] = { ...(next[lang] || {}) };
          if (value === "") delete next[lang][key]; else next[lang][key] = value;
        });
        return next;
      });
      setEdits({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      reloadTranslations?.();
    } finally {
      setSaving(false);
    }
  }

  function addKey() {
    const key = window.prompt("New key (use a page prefix, e.g. \"daily.title\"):", isNameGroup(group) ? "general." : `${group}.`);
    if (!key || !key.trim()) return;
    const k = key.trim();
    setExtraKeys((arr) => arr.includes(k) ? arr : [...arr, k]);
    setGroup(groupOf(k));
  }

  async function addLanguage() {
    const code = window.prompt("New language code (e.g. \"kz\", \"tr\"):");
    if (!code || !code.trim()) return;
    const name = window.prompt("Language display name (e.g. \"Qazaqsha\"):", code.trim());
    if (!name) return;
    await api.post("/api/admin/translations/languages", { code: code.trim().toLowerCase(), name: name.trim() });
    load();
    reloadTranslations?.();
  }

  const inputCls = "w-full bg-[#0f1117] border border-white/10 rounded px-2 py-1.5 text-xs text-gray-100 focus:border-[var(--brand)] outline-none";

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin.tr.search")}
            className="w-full bg-[#1a1d27] border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-gray-100 outline-none focus:border-[var(--brand)]"
          />
        </div>
        <button onClick={addLanguage} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[#1a1d27] border border-white/10 text-gray-300 hover:border-[var(--brand-border)]">
          <Globe size={13} /> {t("admin.tr.addLang")}
        </button>
        <button onClick={addKey} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[#1a1d27] border border-white/10 text-gray-300 hover:border-[var(--brand-border)]">
          <Plus size={13} /> {t("admin.tr.addKey")}
        </button>
        <button
          onClick={save} disabled={!dirtyCount || saving}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
          style={{ background: dirtyCount ? "var(--brand)" : "#2a2e3a", color: dirtyCount ? "#fff" : "#6b7280" }}
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : <Save size={13} />}
          {saved ? t("admin.saved") : dirtyCount ? `${t("admin.save")} (${dirtyCount})` : t("admin.saved")}
        </button>
      </div>

      <div className="flex gap-4">
        {/* Group sidebar */}
        <div className="w-44 flex-shrink-0 space-y-0.5">
          <div className="px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-600">{t("admin.tr.dbNames")}</div>
          {nameGroups.map(({ g, label, count }) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors"
              style={group === g
                ? { background: "var(--brand-bg)", color: "var(--brand-text)" }
                : { color: "#9ca3af" }}
            >
              <span className="truncate">{label}</span>
              <span className="text-[10px] text-gray-500">{count}</span>
            </button>
          ))}
          <div className="px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-600">{t("admin.tr.uiStrings")}</div>
          {groups.map(({ g, label, count }) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors"
              style={group === g
                ? { background: "var(--brand-bg)", color: "var(--brand-text)" }
                : { color: "#9ca3af" }}
            >
              <span className="truncate">{label}</span>
              <span className="text-[10px] text-gray-500">{count}</span>
            </button>
          ))}
        </div>

        {/* Key table */}
        <div className="flex-1 min-w-0 bg-[#1a1d27] border border-white/5 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <th className="px-3 py-2 font-semibold sticky left-0 bg-[#1a1d27] min-w-[180px]">{t("admin.tr.key")}</th>
                  {languages.map((l) => (
                    <th key={l.code} className="px-3 py-2 font-semibold min-w-[200px]">
                      {l.name} <span className="text-gray-600">({l.code})</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={1 + languages.length} className="px-3 py-8 text-center text-gray-500">{t("admin.tr.noKeys")}</td></tr>
                )}
                {rows.slice(0, MAX_ROWS).map(({ key, label, rawName }) => (
                  <tr key={key} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-gray-400 sticky left-0 bg-[#1a1d27] align-top">{label}</td>
                    {languages.map((l) => {
                      const ek = `${l.code}|${key}`;
                      const overridden = (l.code in overrides) && (key in (overrides[l.code] || {}));
                      const dirty = ek in edits;
                      return (
                        <td key={l.code} className="px-2 py-1.5 align-top">
                          <input
                            value={cellValue(l.code, key)}
                            onChange={(e) => setCell(l.code, key, e.target.value)}
                            placeholder={rawName ? transliterate(rawName, l.code) : (dict.en?.[key] || "")}
                            className={inputCls}
                            style={dirty
                              ? { borderColor: "var(--brand)" }
                              : overridden ? { borderColor: "rgba(34,197,94,0.4)" } : undefined}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {rows.length > MAX_ROWS && (
                  <tr>
                    <td colSpan={1 + languages.length} className="px-3 py-3 text-center text-gray-500">
                      Showing first {MAX_ROWS} of {rows.length} — use search to narrow down.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="text-[10px] text-gray-600">
        Green border = customised value saved in DB · Blue border = unsaved edit · placeholder = English default (UI strings) or automatic transliteration (database names) · empty value = reset to automatic.
      </div>
    </div>
  );
}
