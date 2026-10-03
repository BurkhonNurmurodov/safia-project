import { useMemo, useState } from "react";
import { Cpu, UserX, ImageOff, TriangleAlert, MapPin, ListFilter, Fingerprint } from "lucide-react";
import Layout from "../../components/layout/Layout";
import KPICard from "../../components/ui/KPICard";
import SearchInput from "../../components/ui/SearchInput";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import { FilterPanel } from "../../components/ui/ColumnFilter";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import VfxTable from "../../components/verifix/VfxTable";
import PersonCard from "../../components/verifix/PersonCard";
import { VfxError, FetchedAt, RefreshButton } from "../../components/verifix/VfxState";
import { vfxError, fill, num } from "../../components/verifix/vfx";
import { SectionNote, Who, Flag } from "../../components/verifix/registers";
import { useRegister, facet, optsSection, pickSection, sk, dash, C_BAD } from "../../components/verifix/registerKit";

/* «Qurilmalar» — Verifix's terminals and, for every person a terminal should
 * know, whether their record, face photo and card are loaded on it
 * (`device$employee_statuses`). A person missing from a terminal cannot clock
 * in there; a failed photo upload says why. */

const ON = 1, PHOTO = 2, CARD = 4;

export default function VfxDevices() {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const [q, refresh] = useRegister(["devices"], "/devices");
  const d = q.data;
  const [tab, setTab] = usePersistentState("vfx_dev_tab", "devices");
  const [search, setSearch] = useState("");
  const [locSel, setLocSel] = usePersistentState("vfx_dev_loc", []);
  const [devSel, setDevSel] = usePersistentState("vfx_dev_dev", []);
  const [problem, setProblem] = usePersistentState("vfx_dev_problem", "all");
  const [open, setOpen] = useState(null);

  const devs = useMemo(() => new Map((d?.devices || []).map((x) => [x.id, x])), [d]);
  const pairs = useMemo(() => (d?.rows || []).map(([emp, dev, f, code]) => ({
    k: `${emp}:${dev}`, emp, dev, on: !!(f & ON), photo: !!(f & PHOTO), card: !!(f & CARD), code,
    err: !!code && !(f & PHOTO), loc: devs.get(dev)?.loc || null,
  })), [d, devs]);

  const devRows = useMemo(() => {
    const by = new Map((d?.devices || []).map((x) => [x.id, { ...x, people: 0, on: 0, photo: 0, card: 0, err: 0 }]));
    for (const p of pairs) {
      const r = by.get(p.dev);
      if (!r) continue;
      r.people += 1;
      r.on += p.on ? 1 : 0;
      r.photo += p.photo ? 1 : 0;
      r.card += p.card ? 1 : 0;
      r.err += p.err ? 1 : 0;
    }
    return [...by.values()];
  }, [d, pairs]);

  const name = (emp) => tl(d?.names?.[emp] || d?.people?.[emp]?.name || "");
  const locName = (id) => tx(devRows.find((x) => x.loc === id)?.loc_name || "") || (id ? `#${id}` : t("vfx.dev.noLoc"));

  const shownDevs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return devRows.filter((r) => (!locSel.length || locSel.includes(r.loc))
      && (!needle || `${r.name} ${r.id} ${r.loc_name || ""}`.toLowerCase().includes(needle)));
  }, [devRows, locSel, search]);
  const shownPairs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return pairs.filter((p) => (!locSel.length || locSel.includes(p.loc))
      && (!devSel.length || devSel.includes(p.dev))
      && (problem === "all" || (problem === "off" ? !p.on : problem === "nophoto" ? p.on && !p.photo
        : problem === "error" ? p.err : !p.card))
      && (!needle || `${d?.names?.[p.emp] || ""} ${name(p.emp)} ${p.emp}`.toLowerCase().includes(needle)));
  }, [pairs, locSel, devSel, problem, search, d]); // eslint-disable-line react-hooks/exhaustive-deps

  const people = (pred) => new Set(pairs.filter(pred).map((p) => p.emp)).size;
  const off = people((p) => !p.on);
  const noPhoto = people((p) => p.on && !p.photo);
  const errs = pairs.filter((p) => p.err).length;
  const locs = new Set(devRows.map((r) => r.loc).filter(Boolean)).size;

  const locOpts = useMemo(() => facet(devRows, (r) => r.loc, (v) => locName(v)), [devRows]); // eslint-disable-line react-hooks/exhaustive-deps
  const devOpts = useMemo(() => facet(pairs.filter((p) => !locSel.length || locSel.includes(p.loc)), (p) => p.dev,
    (v) => tx(devs.get(v)?.name || v)), [pairs, locSel, devs, tx]);
  const grp = t("vfx.dev.grpWhere");
  const sections = [
    { ...optsSection({ key: "loc", icon: MapPin, label: t("vfx.dev.f.loc"), opts: locOpts, sel: locSel, setSel: setLocSel, t }), group: grp },
    ...(tab === "people" ? [
      { ...optsSection({ key: "dev", icon: Cpu, label: t("vfx.dev.f.dev"), opts: devOpts, sel: devSel, setSel: setDevSel, t }), group: grp },
      pickSection({ key: "problem", icon: ListFilter, label: t("vfx.dev.f.problem"), value: problem, set: setProblem,
        group: t("vfx.dev.grpWhat"), opts: ["all", "off", "nophoto", "error", "nocard"].map((v) => [v, t(`vfx.dev.p.${v}`)]) }),
    ] : []),
  ];

  const share = (n, of) => (of ? Math.round((n / of) * 100) : 0);
  const countCell = (n, of) => (
    <span className="tabular-nums whitespace-nowrap">
      {num(n)}
      <span className="text-[11px] ml-1" style={{ color: "var(--text-3)" }}>{of ? `${share(n, of)}%` : ""}</span>
      {of - n > 0 && <span className="text-[11px] ml-1.5" style={{ color: C_BAD }}>−{num(of - n)}</span>}
    </span>
  );

  const devColumns = [
    { key: "name", label: t("vfx.dev.col.dev"), sort: (r) => r.name,
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate max-w-[220px] font-medium" style={{ color: "var(--text-1)" }}>{tx(r.name)}</div>
          <div className="text-[11px] font-mono" style={{ color: "var(--text-4)" }}>#{r.id}</div>
        </div>
      ) },
    { key: "loc", label: t("vfx.dev.col.loc"), sort: (r) => r.loc_name,
      render: (r) => <span className="truncate block max-w-[220px]" style={{ color: "var(--text-2)" }}>{tx(r.loc_name) || dash}</span> },
    { key: "people", label: t("vfx.dev.col.people"), align: "right", firstDir: "desc", sort: (r) => r.people, render: (r) => num(r.people),
      hint: t("vfx.dev.col.peopleHint") },
    { key: "on", label: t("vfx.dev.col.on"), align: "right", firstDir: "asc", sort: (r) => share(r.on, r.people), render: (r) => countCell(r.on, r.people) },
    { key: "photo", label: t("vfx.dev.col.photo"), align: "right", firstDir: "asc", sort: (r) => share(r.photo, r.people), render: (r) => countCell(r.photo, r.people) },
    { key: "card", label: t("vfx.dev.col.card"), align: "right", firstDir: "desc", sort: (r) => r.card,
      render: (r) => <span className="tabular-nums">{num(r.card)}</span> },
    { key: "err", label: t("vfx.dev.col.err"), align: "right", firstDir: "desc", sort: (r) => r.err,
      render: (r) => (r.err ? <span className="tabular-nums font-semibold" style={{ color: C_BAD }}>{num(r.err)}</span> : dash) },
  ];

  const pairColumns = [
    { key: "who", label: t("vfx.r.person"), sort: (p) => name(p.emp),
      render: (p) => <Who id={p.emp} name={d?.names?.[p.emp]} frame={d} sub={`ID ${p.emp}`} /> },
    { key: "dev", label: t("vfx.dev.col.dev"), sort: (p) => devs.get(p.dev)?.name,
      render: (p) => (
        <div className="min-w-0">
          <div className="truncate max-w-[200px]">{tx(devs.get(p.dev)?.name || "") || `#${p.dev}`}</div>
          <div className="text-[11px] truncate max-w-[200px]" style={{ color: "var(--text-3)" }}>{tx(devs.get(p.dev)?.loc_name || "")}</div>
        </div>
      ) },
    { key: "on", label: t("vfx.dev.col.onOne"), align: "center", sort: (p) => p.on, render: (p) => <Flag ok={p.on} /> },
    { key: "photo", label: t("vfx.dev.col.photoOne"), align: "center", sort: (p) => p.photo, render: (p) => <Flag ok={p.photo} /> },
    { key: "card", label: t("vfx.dev.col.cardOne"), align: "center", sort: (p) => p.card,
      render: (p) => (p.card ? <Flag ok /> : dash) },
    { key: "code", label: t("vfx.dev.col.upload"), sort: (p) => p.code,
      render: (p) => (p.code ? (
        <span className="text-xs block truncate max-w-[280px]" style={{ color: p.err ? C_BAD : "var(--text-2)" }}
          title={d?.codes?.[p.code] || p.code}>
          <span className="font-mono">{p.code}</span>{d?.codes?.[p.code] ? ` · ${d.codes[p.code]}` : ""}
        </span>
      ) : dash) },
  ];

  const toPeople = (patch) => { setTab("people"); patch(); };

  return (
    <Layout title={t("nav.vfx.devices")}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-sm flex-1 min-w-[240px] max-w-3xl" style={{ color: "var(--text-2)" }}>{t("vfx.dev.lead")}</p>
          <FetchedAt at={d?.section?.at} today={d?.today} />
          <RefreshButton busy={q.isFetching || !!d?.loading} onClick={refresh} />
        </div>

        {q.error ? <VfxError error={vfxError(q.error)} onRetry={() => q.refetch()} /> : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPICard label={t("vfx.dev.k.devices")} icon={Cpu} value={d ? num(devRows.length) : sk}
                sub={d ? fill(t("vfx.dev.k.devicesSub"), { n: num(locs), p: num(Object.keys(d.names || {}).length) }) : null} />
              <KPICard label={t("vfx.dev.k.off")} icon={UserX} color={off ? C_BAD : undefined} value={d ? num(off) : sk}
                tooltip={t("vfx.dev.k.offHint")} onValueClick={off ? () => toPeople(() => setProblem("off")) : undefined} />
              <KPICard label={t("vfx.dev.k.noPhoto")} icon={ImageOff} value={d ? num(noPhoto) : sk}
                tooltip={t("vfx.dev.k.noPhotoHint")} onValueClick={noPhoto ? () => toPeople(() => setProblem("nophoto")) : undefined} />
              <KPICard label={t("vfx.dev.k.err")} icon={TriangleAlert} color={errs ? C_BAD : undefined} value={d ? num(errs) : sk}
                tooltip={t("vfx.dev.k.errHint")} onValueClick={errs ? () => toPeople(() => setProblem("error")) : undefined} />
            </div>

            <SegmentedToggle asTabs value={tab} onChange={setTab} options={[
              { value: "devices", label: `${t("vfx.dev.tab.devices")} · ${num(devRows.length)}` },
              { value: "people", label: `${t("vfx.dev.tab.people")} · ${num(pairs.length)}` },
            ]} />
            <SectionNote s={d?.section} form="Устройство" />

            {tab === "devices" ? (
              <VfxTable icon={Cpu} title={t("vfx.dev.tab.devices")}
                right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{num(shownDevs.length)}</span>}
                toolbar={<>
                  <SearchInput value={search} onChange={setSearch} placeholder={t("vfx.dev.searchDev")} className="w-full sm:w-64" />
                  <FilterPanel sections={sections} />
                </>}
                rows={shownDevs} columns={devColumns} rowKey={(r) => r.id} loading={q.isLoading}
                defaultSort={{ key: "on", dir: "asc" }} sortStoreKey="vfx_dev_sort"
                empty={devRows.length ? t("vfx.noMatch") : t("vfx.dev.empty")}
                onRowClick={(r) => toPeople(() => setDevSel([r.id]))} />
            ) : (
              <VfxTable icon={Fingerprint} title={t("vfx.dev.tab.people")}
                right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{num(shownPairs.length)}</span>}
                toolbar={<>
                  <SearchInput value={search} onChange={setSearch} placeholder={t("vfx.r.searchPerson")} className="w-full sm:w-64" />
                  <FilterPanel sections={sections} />
                </>}
                rows={shownPairs} columns={pairColumns} rowKey={(p) => p.k} loading={q.isLoading}
                defaultSort={{ key: "on", dir: "asc" }} sortStoreKey="vfx_devp_sort"
                empty={pairs.length ? t("vfx.noMatch") : t("vfx.dev.empty")}
                onRowClick={(p) => setOpen(p.emp)} />
            )}
            {q.isLoading && <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("vfx.r.slowFirst")}</p>}
          </>
        )}
      </div>
      {open && <PersonCard id={open} onClose={() => setOpen(null)} />}
    </Layout>
  );
}
