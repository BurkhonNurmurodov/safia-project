import { useState, useMemo, useEffect } from "react";
import { Plus, Save, Globe, Check, Loader2 } from "lucide-react";
import SearchInput from "../../components/ui/SearchInput";
import dict from "../../i18n/translations";
import { useLang } from "../../context/LangContext";
import { usePersistentState } from "../../hooks/usePersistentState";
import { transliterate } from "../../utils/transliterate";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import Pagination from "../../components/ui/Pagination";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import FormField from "../../components/ui/FormField";
import StyledSelect from "../../components/ui/StyledSelect";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import { useToast } from "../../components/ui/Toast";
import { useAdminDirty } from "./AdminPanel";
import api from "../../utils/api";

const BASE_LANGS = ["uz", "uz_cyrl", "ru", "en"];

// Nice display names for the key-prefix groups (pages). Anything not listed
// falls back to a capitalised prefix.
const GROUP_LABELS = {
  nav: "Navigation", filter: "Filters", overview: "Overview", zagruzka: "Workload",
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
  const [group, setGroup] = usePersistentState("translations_group", "nav");
  const [search, setSearch] = usePersistentState("translations_search", "");
  // "Which keys are missing uz_cyrl?" had no answer short of eyeballing
  // placeholder-grey inputs across every group, 150 rows at a time.
  const [missing, setMissing] = usePersistentState("translations_missing", "");
  // Below md the 5-column grid collapses to ONE language at a time.
  const [mobileLang, setMobileLang] = usePersistentState("translations_mlang", "ru");
  const [keyModal, setKeyModal] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [keyError, setKeyError] = useState("");
  const [langModal, setLangModal] = useState(false);
  const [newLang, setNewLang] = useState({ code: "", name: "" });
  const [langError, setLangError] = useState("");
  const [langBusy, setLangBusy] = useState(false);
  const toast = useToast();
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
    const missingIn = (key) => missing && !((overrides[missing]?.[key] ?? dict[missing]?.[key] ?? "").trim());

    if (isNameGroup(group)) {
      const src = NAME_GROUPS.find((n) => n.g === group)?.src;
      return (dbNames[src] || [])
        .filter((n) => !q || n.toLowerCase().includes(q) || transliterate(n, "en").toLowerCase().includes(q))
        .map((n) => ({ key: `${NAME_PREFIX}${n}`, label: n, rawName: n }))
        .filter(({ key }) => !missing || missingIn(key));
    }

    // A live query searches EVERY group and matches translated VALUES too — you
    // rarely know the key of the string you just saw on a page.
    const inScope = q ? allKeys : allKeys.filter((k) => groupOf(k) === group);
    const matches = (k) => {
      if (!q) return true;
      if (k.toLowerCase().includes(q)) return true;
      return languages.some((l) =>
        String(overrides[l.code]?.[k] ?? dict[l.code]?.[k] ?? "").toLowerCase().includes(q));
    };
    return inScope
      .filter(matches)
      .filter(missingIn ? (k) => !missing || missingIn(k) : () => true)
      .sort()
      .map((k) => ({ key: k, label: k }));
  }, [allKeys, group, search, dbNames, missing, overrides, dict, languages]);

  const effective = (lang, key) => overrides[lang]?.[key] ?? dict[lang]?.[key] ?? "";
  const cellValue = (lang, key) => {
    const ek = `${lang}|${key}`;
    return ek in edits ? edits[ek] : effective(lang, key);
  };
  const setCell = (lang, key, value) => setEdits((e) => {
    const ek = `${lang}|${key}`;
    // Typing a character and deleting it again is not a change.
    if (value === effective(lang, key)) { const n = { ...e }; delete n[ek]; return n; }
    return { ...e, [ek]: value };
  });
  const dirtyCount = Object.keys(edits).length;
  // Dozens of painstaking cell edits used to vanish on a tab switch, silently.
  useAdminDirty(dirtyCount > 0);

  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / MAX_ROWS));
  const pageRows = useMemo(
    () => rows.slice((page - 1) * MAX_ROWS, page * MAX_ROWS),
    [rows, page],
  );
  useEffect(() => { setPage(1); }, [group, search, missing]);

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
    } catch (e) {
      // Edits are deliberately KEPT so a network blip doesn't cost the pass.
      toast.error(e?.response?.data?.detail || t("admin.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  function submitKey() {
    const k = newKey.trim();
    if (!/^[a-z0-9_]+\.[a-z0-9_.]+$/i.test(k)) { setKeyError(t("admin.tr.keyFormat")); return; }
    setExtraKeys((arr) => (arr.includes(k) ? arr : [...arr, k]));
    setGroup(groupOf(k));
    setKeyModal(false);
    setNewKey("");
  }

  async function submitLanguage() {
    const code = newLang.code.trim().toLowerCase();
    const name = newLang.name.trim();
    if (!/^[a-z]{2}(_[a-z]+)?$/.test(code)) { setLangError(t("admin.tr.langFormat")); return; }
    if (!name) { setLangError(t("admin.tr.langNameRequired")); return; }
    setLangBusy(true);
    try {
      await api.post("/api/admin/translations/languages", { code, name });
      load();
      reloadTranslations?.();
      setLangModal(false);
      setNewLang({ code: "", name: "" });
    } catch (e) {
      setLangError(e?.response?.data?.detail || t("admin.saveFailed"));
    } finally {
      setLangBusy(false);
    }
  }

  const inputCls = "w-full bg-[var(--bg-base)] border border-[var(--border-md)] rounded px-2 py-1.5 text-xs text-[var(--text-1)] focus:border-[var(--brand)] outline-none";

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("admin.tr.search")}
          className="flex-1 min-w-[180px]"
        />
        <StyledSelect
          value={missing}
          onChange={setMissing}
          triggerClassName="px-3 py-2 text-sm"
          className="w-full sm:w-48"
          options={[{ value: "", label: t("admin.tr.missingAny") },
            ...languages.map((l) => ({ value: l.code, label: t("admin.tr.missingIn").replace("{lang}", l.name) }))]}
        />
        <Button variant="secondary" size="lg" icon={<Globe size={13} />} onClick={() => { setLangError(""); setLangModal(true); }}>
          {t("admin.tr.addLang")}
        </Button>
        <Button variant="secondary" size="lg" icon={<Plus size={13} />} onClick={() => { setKeyError(""); setNewKey(isNameGroup(group) ? "general." : `${group}.`); setKeyModal(true); }}>
          {t("admin.tr.addKey")}
        </Button>
        <Button size="lg" icon={saved ? <Check size={13} /> : <Save size={13} />} loading={saving} disabled={!dirtyCount} onClick={save}>
          {dirtyCount ? `${t("admin.save")} (${dirtyCount})` : t("admin.save")}
        </Button>
      </div>

      {/* Phone: the group rail becomes a select, and the 5-language grid folds
          to one language at a time — the desktop layout was unusable at 390px,
          which is the device this app actually runs on. */}
      <div className="md:hidden flex flex-col gap-2">
        <StyledSelect
          value={group}
          onChange={setGroup}
          triggerClassName="px-3 py-2 text-sm"
          options={[
            ...nameGroups.map(({ g, label, count }) => ({ value: g, label: `${label} (${count})` })),
            ...groups.map(({ g, label, count }) => ({ value: g, label: `${label} (${count})` })),
          ]}
        />
        <SegmentedToggle
          scrollable
          value={mobileLang}
          onChange={setMobileLang}
          options={languages.map((l) => ({ value: l.code, label: l.name, title: l.code }))}
        />
      </div>

      <div className="flex gap-4">
        {/* Group sidebar */}
        <div className="hidden md:block w-44 flex-shrink-0 space-y-0.5">
          <div className="px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-4)]">{t("admin.tr.dbNames")}</div>
          {nameGroups.map(({ g, label, count }) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors"
              style={group === g
                ? { background: "var(--brand-bg)", color: "var(--brand-text)" }
                : { color: "var(--text-2)" }}
            >
              <span className="truncate">{label}</span>
              <span className="text-[10px] text-[var(--text-3)]">{count}</span>
            </button>
          ))}
          <div className="px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-4)]">{t("admin.tr.uiStrings")}</div>
          {groups.map(({ g, label, count }) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors"
              style={group === g
                ? { background: "var(--brand-bg)", color: "var(--brand-text)" }
                : { color: "var(--text-2)" }}
            >
              <span className="truncate">{label}</span>
              <span className="text-[10px] text-[var(--text-3)]">{count}</span>
            </button>
          ))}
        </div>

        {/* Key table */}
        <div className="flex-1 min-w-0 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--text-3)]" style={{ borderBottom: "1px solid var(--border)" }}>
                  {/* Sticky BOTH ways: after scrolling into a 150-row group the
                      four identical input columns had no labels, and uz sits
                      right next to uz_cyrl. */}
                  <th className="px-3 py-2 font-semibold sticky left-0 top-0 z-20 min-w-[180px]" style={{ background: "var(--bg-card)", boxShadow: "1px 0 0 var(--border)" }}>{t("admin.tr.key")}</th>
                  {languages.map((l) => (
                    <th
                      key={l.code}
                      className={`px-3 py-2 font-semibold min-w-[200px] sticky top-0 ${l.code === mobileLang ? "" : "hidden md:table-cell"}`}
                      style={{ background: "var(--bg-card)" }}
                    >
                      {l.name} <span className="text-[var(--text-4)]">({l.code})</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {initLoading && Array.from({ length: 10 }).map((_, i) => (
                  <tr key={`sk-${i}`} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-3 py-2 sticky left-0 bg-[var(--bg-card)]"><SkeletonBlock className="h-4 w-32" /></td>
                    {languages.map((l) => (
                      <td key={l.code} className={`px-2 py-2 ${l.code === mobileLang ? "" : "hidden md:table-cell"}`}><SkeletonBlock className="h-7 w-full" /></td>
                    ))}
                  </tr>
                ))}
                {!initLoading && rows.length === 0 && (
                  <tr><td colSpan={1 + languages.length} className="px-3 py-8 text-center text-[var(--text-3)]">{t("admin.tr.noKeys")}</td></tr>
                )}
                {!initLoading && pageRows.map(({ key, label, rawName }) => (
                  <tr key={key} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-[var(--text-2)] sticky left-0 align-top" style={{ background: "var(--bg-card)", boxShadow: "1px 0 0 var(--border)" }}>{label}</td>
                    {languages.map((l) => {
                      const ek = `${l.code}|${key}`;
                      const overridden = (l.code in overrides) && (key in (overrides[l.code] || {}));
                      const dirty = ek in edits;
                      return (
                        <td key={l.code} className={`px-2 py-1.5 align-top ${l.code === mobileLang ? "" : "hidden md:table-cell"}`}>
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

              </tbody>
            </table>
          </div>
        </div>
      </div>
      <Pagination page={page} pageCount={pageCount} total={rows.length} pageSize={MAX_ROWS} onPage={setPage} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--text-3)" }}>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded" style={{ border: "1px solid rgba(34,197,94,0.6)" }} />
          {t("admin.tr.legendSaved")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded" style={{ border: "1px solid var(--brand)" }} />
          {t("admin.tr.legendDirty")}
        </span>
        <span>{t("admin.tr.legendPlaceholder")}</span>
        <span>{t("admin.tr.legendEmpty")}</span>
      </div>

      {/* Both of these were window.prompt, which Telegram's WebView suppresses. */}
      {keyModal && (
        <Modal onClose={() => setKeyModal(false)} title={t("admin.tr.addKey")} maxWidth="max-w-sm" zIndex={60}
          footer={<>
            <Button variant="secondary" size="sm" onClick={() => setKeyModal(false)}>{t("common.cancel")}</Button>
            <Button size="sm" onClick={submitKey}>{t("admin.tr.addKey")}</Button>
          </>}>
          <FormField label={t("admin.tr.key")} required hint={t("admin.tr.keyHint")} error={keyError}>
            <input value={newKey} onChange={(e) => { setNewKey(e.target.value); setKeyError(""); }}
              placeholder="daily.title" className={inputCls} autoFocus />
          </FormField>
        </Modal>
      )}

      {langModal && (
        <Modal onClose={() => setLangModal(false)} dismissable={!langBusy} title={t("admin.tr.addLang")} maxWidth="max-w-sm" zIndex={60}
          footer={<>
            <Button variant="secondary" size="sm" disabled={langBusy} onClick={() => setLangModal(false)}>{t("common.cancel")}</Button>
            <Button size="sm" loading={langBusy} onClick={submitLanguage}>{t("admin.tr.addLang")}</Button>
          </>}>
          <FormField label={t("admin.tr.langCode")} required hint={t("admin.tr.langCodeHint")} error={langError}>
            <input value={newLang.code} onChange={(e) => { setNewLang((l) => ({ ...l, code: e.target.value })); setLangError(""); }}
              placeholder="kz" className={inputCls} autoFocus />
          </FormField>
          <FormField label={t("admin.tr.langName")} required>
            <input value={newLang.name} onChange={(e) => { setNewLang((l) => ({ ...l, name: e.target.value })); setLangError(""); }}
              placeholder="Qazaqsha" className={inputCls} />
          </FormField>
          {/* There is no UI anywhere to remove or rename a language afterwards. */}
          <p className="text-[11px] leading-snug" style={{ color: "#a16207" }}>{t("admin.tr.langWarn")}</p>
        </Modal>
      )}

      {toast.node}
    </div>
  );
}
