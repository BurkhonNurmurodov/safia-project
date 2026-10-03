import { useEffect, useMemo, useState } from "react";
import { MapPin, Users, LogIn, Hourglass, ExternalLink, DoorOpen, Building2 } from "lucide-react";
import Layout from "../../components/layout/Layout";
import KPICard from "../../components/ui/KPICard";
import SearchInput from "../../components/ui/SearchInput";
import StyledSelect from "../../components/ui/StyledSelect";
import DayStepper from "../../components/ui/DayStepper";
import Pagination from "../../components/ui/Pagination";
import EmptyState from "../../components/ui/EmptyState";
import { localISO } from "../../components/ui/DateRangePicker";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import VfxPhoto from "../../components/verifix/VfxPhoto";
import PersonCard from "../../components/verifix/PersonCard";
import { VfxError, FetchedAt, RefreshButton } from "../../components/verifix/VfxState";
import { useVfx, vfxError, fill, num, hm, hmm, C_OK, C_BAD } from "../../components/verifix/vfx";

/* «Hozir ishda» — Verifix's «Работающие сотрудники в локации»: everybody with
 * an arrival and no departure at one location, with the photo the terminal
 * took when they came in. On a past day the same question lists the people
 * who never checked out. Locations are listed busiest first (by how many of
 * their assigned people are working); the busiest opens by default. */

const PAGE = 60;

export default function VfxOnSite() {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const today = localISO(new Date());
  const [locsQ, refreshLocs] = useVfx(["locations"], "/locations");
  const [picked, setPicked] = usePersistentState("vfx_onsite_loc", "");
  const locs = locsQ.data?.rows || [];
  const locId = (picked && locs.some((l) => l.id === picked) ? picked : "") || locsQ.data?.default_id || "";
  const [day, setDay] = useState(today);
  const [q, refresh] = useVfx(["onsite"], "/onsite", { location_id: locId, day }, { enabled: !!locId });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [person, setPerson] = useState(null);
  const d = q.data;
  const live = day === (d?.today || today);
  const all = d?.rows || [];

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((r) => `${r.name} ${tl(r.name)} ${r.emp} ${d?.cells?.[r.unit]?.code || ""} ${r.div_name || ""}`.toLowerCase().includes(needle));
  }, [all, search, d, tl]);
  useEffect(() => { setPage(1); }, [locId, day, search]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);

  const lastHour = all.filter((r) => r.minutes != null && r.minutes <= 60).length;
  const loc = d?.location || locs.find((l) => l.id === locId);
  const latlng = (loc?.latlng || "").split(",").slice(0, 2).join(",");
  const sk = <SkeletonBlock className="h-7 w-14 mt-1" />;
  const options = locs.map((l) => ({ value: l.id, label: `${tx(l.name)} · ${num(l.working)}`, title: tx(l.name) }));

  return (
    <Layout title={t("nav.vfx.onsite")}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <StyledSelect value={locId} onChange={setPicked} options={options} searchable
            placeholder={t("vfx.os.pick")} className="w-full sm:w-80" triggerClassName="px-3 py-2 text-sm min-h-[38px]" />
          <DayStepper value={day} onChange={setDay} />
          <div className="flex-1" />
          <FetchedAt at={d?.fetched_at} today={today} />
          <RefreshButton busy={q.isFetching || locsQ.isFetching} onClick={() => { refresh(); refreshLocs(); }} />
        </div>

        {locsQ.error ? <VfxError error={vfxError(locsQ.error)} onRetry={() => locsQ.refetch()} />
          : !locsQ.isLoading && !locs.length ? (
            <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <EmptyState icon={MapPin} title={t("vfx.os.noLocs")} message={t("vfx.os.noLocsMsg")} showUploadLink={false} />
            </div>
          ) : (
            <>
              {loc && (
                <div className="rounded-2xl p-4 flex items-start gap-3 flex-wrap" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <span className="w-10 h-10 rounded-xl grid place-items-center flex-shrink-0" style={{ background: "var(--bg-inner)", color: "var(--brand-text)" }}>
                    <MapPin size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold" style={{ color: "var(--text-1)" }}>{tx(loc.name)}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
                      {[tx(loc.address), fill(t("vfx.os.assigned"), { n: num(loc.assigned) })].filter(Boolean).join(" · ")}
                    </div>
                    {loc.divisions?.length > 0 && (
                      <div className="text-xs mt-1 inline-flex items-start gap-1.5" style={{ color: "var(--text-2)" }}>
                        <Building2 size={12} className="mt-0.5 flex-shrink-0" style={{ color: "var(--text-4)" }} />
                        <span>{loc.divisions.map((x) => tx(x)).join(", ")}{loc.divisions_n > loc.divisions.length ? " …" : ""}</span>
                      </div>
                    )}
                  </div>
                  {latlng && (
                    <a href={`https://www.google.com/maps?q=${encodeURIComponent(latlng)}`} target="_blank" rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-xs font-medium hover:underline underline-offset-2"
                      style={{ color: "var(--brand-text)" }}>
                      {t("vfx.os.map")}<ExternalLink size={12} />
                    </a>
                  )}
                </div>
              )}

              {!live && (
                <p className="text-xs px-1" style={{ color: "var(--text-2)" }}>{t("vfx.os.pastHint")}</p>
              )}

              {q.error ? <VfxError error={vfxError(q.error)} onRetry={() => q.refetch()} /> : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <KPICard label={t(live ? "vfx.os.k.inside" : "vfx.os.k.noOut")} icon={live ? Users : DoorOpen}
                      color={live ? C_OK : all.length ? C_BAD : undefined} value={d ? num(all.length) : sk} />
                    <KPICard label={t("vfx.os.k.assigned")} icon={MapPin} value={loc ? num(loc.assigned) : sk}
                      tooltip={t("vfx.os.k.assignedHint")} />
                    <KPICard label={t("vfx.os.k.lastHour")} icon={LogIn} value={d ? (live ? num(lastHour) : "—") : sk} />
                    <KPICard label={t("vfx.os.k.longest")} icon={Hourglass}
                      value={d ? (live && all.length ? hmm(Math.max(...all.map((r) => r.minutes || 0)) / 60) : "—") : sk} />
                  </div>

                  <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center gap-2 flex-wrap px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                      <Users size={14} style={{ color: "var(--brand-text)" }} />
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                        {t(live ? "vfx.os.title" : "vfx.os.titlePast")}
                      </span>
                      <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{num(rows.length)}</span>
                      <div className="flex-1" />
                      <SearchInput value={search} onChange={setSearch} placeholder={t("vfx.os.search")} className="w-full sm:w-64" />
                    </div>
                    <div className="p-3">
                      {q.isLoading || !d ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                          {Array.from({ length: 8 }).map((_, i) => <SkeletonBlock key={i} className="h-[76px] rounded-xl" />)}
                        </div>
                      ) : shown.length === 0 ? (
                        <EmptyState icon={live ? Users : DoorOpen} showUploadLink={false} height="h-40"
                          title={all.length ? t("vfx.noMatch") : t(live ? "vfx.os.emptyNow" : "vfx.os.emptyPast")}
                          message={all.length ? "" : t(live ? "vfx.os.emptyNowMsg" : "vfx.os.emptyPastMsg")} />
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                          {shown.map((r) => {
                            const cell = d.cells?.[r.unit];
                            return (
                              <button key={r.emp} type="button" onClick={() => setPerson(r.emp)}
                                className="text-left rounded-xl p-2.5 flex items-center gap-3 transition-colors hover:bg-[var(--bg-inner)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
                                style={{ border: "1px solid var(--border)" }}>
                                <VfxPhoto sha={r.photo || r.face} name={tl(r.name)} px={56} square
                                  title={r.photo ? t("vfx.os.entryPhoto") : tl(r.name)} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium" style={{ color: "var(--text-1)" }}>{tl(r.name)}</span>
                                  <span className="block truncate text-[11px]" style={{ color: "var(--text-3)" }}>
                                    {cell ? <span className="font-mono font-semibold" style={{ color: "var(--text-2)" }}>{cell.code}</span> : null}
                                    {cell ? " · " : ""}{tx(r.div_name || d.divisions?.[r.unit]) || "—"}
                                  </span>
                                  <span className="block text-[11px] tabular-nums mt-0.5" style={{ color: "var(--text-2)" }}>
                                    {r.at ? fill(t(live ? "vfx.os.since" : "vfx.os.cameAt"), { at: hm(r.at), dur: r.minutes != null ? hmm(r.minutes / 60) : "" }) : "—"}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  <Pagination page={Math.min(page, pageCount)} pageCount={pageCount} total={rows.length} pageSize={PAGE} onPage={setPage} />
                </>
              )}
            </>
          )}
      </div>
      {person && <PersonCard id={person} onClose={() => setPerson(null)} />}
    </Layout>
  );
}
