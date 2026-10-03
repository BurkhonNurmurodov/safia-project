import { useMemo, useState } from "react";
import { BookMarked, Lock, CircleSlash, Loader2 } from "lucide-react";
import Layout from "../../components/layout/Layout";
import SearchInput from "../../components/ui/SearchInput";
import StyledSelect from "../../components/ui/StyledSelect";
import { useLang } from "../../context/LangContext";
import { usePersistentState } from "../../hooks/usePersistentState";
import { VfxError, FetchedAt, RefreshButton } from "../../components/verifix/VfxState";
import { vfxError, num } from "../../components/verifix/vfx";
import { SectionNote, GenericTable } from "../../components/verifix/registers";
import { useRegister } from "../../components/verifix/registerKit";

/* «Ma'lumotnomalar» — the small lists the registers refer to (reasons,
 * kinds, IIKO matches), each whole and as Verifix sends it. Person-record
 * dictionaries (education, family, languages) are deliberately not here — the
 * operator kept personal records off — and neither are the payroll module's
 * own lists: wages are off (2026-10-03). */

const GROUPS = [
  ["hr", ["dismissal_reason", "request_kind", "sick_leave_reason", "business_trip_reason", "vacation_type",
    "employment_source", "fixed_term_base"]],
  ["iiko", ["division_match", "job_match"]],
];
const FORMS = {
  dismissal_reason: "Причины увольнения (API)", request_kind: "Вид отсутствия", sick_leave_reason: "Причины ухода на больничный",
  business_trip_reason: "Причини командировки", vacation_type: "Виды отпусков", employment_source: "Источник занятости",
  fixed_term_base: "Основания срочного трудового договора",
  division_match: "Сопоставление подразделений", job_match: "Сопоставление должностей",
};

export default function VfxDictionaries() {
  const { t } = useLang();
  const [q, refresh] = useRegister(["dictionaries"], "/dictionaries");
  const d = q.data;
  const [pick, setPick] = usePersistentState("vfx_dic_pick", "dismissal_reason");
  const [search, setSearch] = useState("");
  const s = d?.lists?.[pick];
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const all = s?.rows || [];
    return needle ? all.filter((r) => JSON.stringify(r).toLowerCase().includes(needle)) : all;
  }, [s, search]);

  const badge = (k) => {
    const x = d?.lists?.[k];
    if (!x) return null;
    if (x.loading) return <Loader2 size={12} className="animate-spin" style={{ color: "var(--text-4)" }} />;
    if (x.error && !x.rows?.length) {
      const Icon = x.error.code === "missing" ? CircleSlash : Lock;
      return <Icon size={12} style={{ color: "var(--text-4)" }} />;
    }
    return <span className="tabular-nums text-[11px]" style={{ color: "var(--text-3)" }}>{num(x.rows.length)}</span>;
  };

  return (
    <Layout title={t("nav.vfx.dictionaries")}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-sm flex-1 min-w-[240px] max-w-3xl" style={{ color: "var(--text-2)" }}>{t("vfx.dic.lead")}</p>
          <FetchedAt at={s?.at} />
          <RefreshButton busy={q.isFetching || !!d?.loading} onClick={refresh} />
        </div>
        {q.error ? <VfxError error={vfxError(q.error)} onRetry={() => q.refetch()} /> : (
          <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-4 items-start">
            <div className="lg:hidden">
              <StyledSelect value={pick} onChange={setPick} className="w-full" triggerClassName="px-3 py-2 text-sm min-h-[38px]"
                options={GROUPS.flatMap(([, keys]) => keys).map((k) => ({
                  value: k, label: `${t(`vfx.dic.${k}`)}${d?.lists?.[k]?.rows ? ` · ${num(d.lists[k].rows.length)}` : ""}`,
                }))} />
            </div>
            <nav className="hidden lg:block rounded-2xl p-2 space-y-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
              aria-label={t("nav.vfx.dictionaries")}>
              {GROUPS.map(([g, keys]) => (
                <div key={g}>
                  <div className="px-2 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{t(`vfx.dic.g.${g}`)}</div>
                  {keys.map((k) => (
                    <button key={k} type="button" onClick={() => setPick(k)} aria-current={pick === k ? "true" : undefined}
                      className="w-full flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-left transition-colors hover:bg-[var(--bg-inner)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
                      style={pick === k ? { background: "var(--bg-inner)", color: "var(--text-1)", fontWeight: 600 } : { color: "var(--text-2)" }}>
                      <span className="truncate">{t(`vfx.dic.${k}`)}</span>
                      {badge(k)}
                    </button>
                  ))}
                </div>
              ))}
            </nav>
            <div className="space-y-2 min-w-0">
              <SectionNote s={s} form={FORMS[pick]} />
              {!(s?.error && !s?.rows?.length) && (
                <GenericTable icon={BookMarked} title={t(`vfx.dic.${pick}`)} rows={rows} loading={q.isLoading || (s?.loading && !rows.length)}
                  right={<span className="font-mono text-[11px]" style={{ color: "var(--text-4)" }}>{s?.source}</span>}
                  toolbar={<SearchInput value={search} onChange={setSearch} placeholder={t("vfx.dic.search")} className="w-full sm:w-64" />}
                  empty={s?.rows?.length ? t("vfx.noMatch") : t("vfx.raw.empty")} />
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
