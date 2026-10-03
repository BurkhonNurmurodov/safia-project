import { useMemo, useState } from "react";
import {
  FolderTree, ChevronRight, ChevronDown, Building2, Hash, Grid3x3, Users, UserX, MapPin, Phone, Globe, Send, Mail,
} from "lucide-react";
import Layout from "../../components/layout/Layout";
import KPICard from "../../components/ui/KPICard";
import Button from "../../components/ui/Button";
import SearchInput from "../../components/ui/SearchInput";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import TableCard, { Th } from "../../components/ui/DataTable";
import { SkeletonBlock, SkeletonTable } from "../../components/ui/Skeleton";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import VfxTable from "../../components/verifix/VfxTable";
import VfxPhoto from "../../components/verifix/VfxPhoto";
import { VfxError, CellChip, Chip, FetchedAt, RefreshButton } from "../../components/verifix/VfxState";
import { useVfx, vfxError, fill, num, dmy, C_OK, C_WARN, C_NONE } from "../../components/verifix/vfx";

/* «Tuzilma» — Verifix's division tree: departments («департамент») and org
 * units («отдел») are nodes of ONE tree. A node whose code is a verifix cell
 * code IS one of our cells (connection test, 2026-10-01), so this is where the
 * two registers meet: every cell found, every cell missing, and every node
 * where people work that is no cell of ours. People are counted where they
 * sit — their org unit, else their department — so each person once. */

export default function VfxStructure() {
  const { t } = useLang();
  const { tx } = useTranslit();
  const [q, refresh] = useVfx(["structure"], "/structure");
  const [view, setView] = usePersistentState("vfx_str_view", "tree");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(() => new Set());
  const d = q.data;

  const tree = useMemo(() => {
    const nodes = d?.nodes || [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const kids = new Map();
    const roots = [];
    for (const n of nodes) {
      if (n.parent && byId.has(n.parent)) {
        if (!kids.has(n.parent)) kids.set(n.parent, []);
        kids.get(n.parent).push(n);
      } else roots.push(n);
    }
    const byName = (a, b) => a.name.localeCompare(b.name, "ru");
    roots.sort(byName);
    for (const list of kids.values()) list.sort(byName);
    const total = new Map();
    const path = new Map();
    const depth = new Map();
    const walk = (n, trail, lvl, seen) => {
      if (seen.has(n.id)) return 0;          // a cycle in the data must not hang the page
      seen.add(n.id);
      path.set(n.id, trail);
      depth.set(n.id, lvl);
      let sum = n.people;
      for (const c of kids.get(n.id) || []) sum += walk(c, [...trail, n.name], lvl + 1, seen);
      total.set(n.id, sum);
      return sum;
    };
    const seen = new Set();
    for (const r of roots) walk(r, [], 0, seen);
    return { byId, kids, roots, total, path, depth };
  }, [d]);

  const visible = useMemo(() => {
    if (view !== "tree" || search.trim()) return [];
    const out = [];
    const add = (n) => {
      out.push(n);
      if (open.has(n.id)) for (const c of tree.kids.get(n.id) || []) add(c);
    };
    tree.roots.forEach(add);
    return out;
  }, [tree, open, view, search]);

  const flat = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const nodes = d?.nodes || [];
    let list = nodes;
    if (view === "cells") list = nodes.filter((n) => n.cell);
    else if (view === "unplaced") list = nodes.filter((n) => n.people > 0 && !n.cell);
    if (needle) list = list.filter((n) => `${n.name} ${n.raw_code || ""} ${n.cell?.code || ""}`.toLowerCase().includes(needle));
    return list;
  }, [d, view, search]);

  const toggle = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const expandAll = () => setOpen(new Set((d?.nodes || []).filter((n) => tree.kids.has(n.id)).map((n) => n.id)));

  const sm = d?.summary;
  const pathOf = (n) => (tree.path.get(n.id) || []).map((x) => tx(x)).join(" › ");

  const flatColumns = [
    {
      key: "name", label: t("vfx.str.col.name"), sort: (n) => n.name,
      render: (n) => (
        <div className="min-w-0 max-w-[420px]">
          <div className="truncate font-medium" style={{ color: "var(--text-1)" }}>{tx(n.name)}</div>
          {pathOf(n) && <div className="truncate text-[11px]" style={{ color: "var(--text-3)" }}>{pathOf(n)}</div>}
        </div>
      ),
    },
    { key: "code", label: t("vfx.str.col.code"), sort: (n) => n.raw_code || null,
      render: (n) => <span className="font-mono">{n.raw_code || "—"}</span> },
    { key: "cell", label: t("vfx.str.col.cell"), sort: (n) => n.cell?.code || null, render: (n) => <CellChip cell={n.cell} /> },
    { key: "people", label: t("vfx.str.col.people"), align: "right", firstDir: "desc", sort: (n) => n.people,
      render: (n) => (n.people ? num(n.people) : <span style={{ color: "var(--text-4)" }}>0</span>) },
    { key: "total", label: t("vfx.str.col.total"), align: "right", firstDir: "desc", sort: (n) => tree.total.get(n.id) ?? 0,
      hint: t("vfx.str.col.totalHint"), render: (n) => num(tree.total.get(n.id) ?? 0) },
    { key: "opened", label: t("vfx.str.col.opened"), sort: (n) => n.opened || null,
      render: (n) => <span className="tabular-nums" style={{ color: "var(--text-2)" }}>{n.opened ? dmy(n.opened) : "—"}</span> },
    { key: "state", label: t("vfx.str.col.state"), sort: (n) => n.state,
      render: (n) => (n.state === "A" ? <span style={{ color: "var(--text-2)" }}>{t("vfx.active")}</span>
        : <Chip color={C_NONE}>{t("vfx.passive")}</Chip>) },
  ];

  const toolbar = (
    <>
      <SearchInput value={search} onChange={setSearch} placeholder={t("vfx.str.search")} className="w-full sm:w-64" />
      <SegmentedToggle value={view} onChange={setView} options={[
        { value: "tree", label: t("vfx.str.view.tree") },
        { value: "cells", label: t("vfx.str.view.cells") },
        { value: "unplaced", label: t("vfx.str.view.unplaced") },
      ]} />
      {view === "tree" && !search.trim() && (
        <div className="flex gap-2">
          <Button size="lg" variant="ghost" onClick={expandAll}>{t("vfx.str.expandAll")}</Button>
          <Button size="lg" variant="ghost" onClick={() => setOpen(new Set())}>{t("vfx.str.collapseAll")}</Button>
        </div>
      )}
    </>
  );

  return (
    <Layout title={t("nav.vfx.structure")}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-sm flex-1 min-w-[240px] max-w-3xl" style={{ color: "var(--text-2)" }}>{t("vfx.str.lead")}</p>
          <FetchedAt at={d?.fetched_at} />
          <RefreshButton busy={q.isFetching} onClick={refresh} />
        </div>

        {q.error && !d ? <VfxError error={vfxError(q.error)} onRetry={() => q.refetch()} /> : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <KPICard label={t("vfx.str.k.nodes")} icon={FolderTree} value={sm ? num(sm.total) : <SkeletonBlock className="h-7 w-14 mt-1" />}
                sub={sm ? fill(t("vfx.str.k.nodesSub"), { n: num(sm.active) }) : null} />
              <KPICard label={t("vfx.str.k.coded")} icon={Hash} value={sm ? num(sm.coded) : <SkeletonBlock className="h-7 w-14 mt-1" />}
                tooltip={t("vfx.str.k.codedHint")} />
              <KPICard label={t("vfx.str.k.cells")} icon={Grid3x3} color={sm && sm.cells_missing_n ? C_WARN : C_OK}
                value={sm ? `${num(sm.cells_found)} / ${num(sm.cells)}` : <SkeletonBlock className="h-7 w-20 mt-1" />}
                tooltip={t("vfx.str.k.cellsHint")} />
              <KPICard label={t("vfx.str.k.people")} icon={Users} value={sm ? num(sm.people) : <SkeletonBlock className="h-7 w-16 mt-1" />}
                sub={sm && sm.people_lost ? fill(t("vfx.str.k.peopleLost"), { n: num(sm.people_lost) }) : null} />
              <KPICard label={t("vfx.str.k.unplaced")} icon={UserX}
                value={sm ? num(sm.unplaced_nodes) : <SkeletonBlock className="h-7 w-12 mt-1" />}
                tooltip={t("vfx.str.k.unplacedHint")}
                onValueClick={sm?.unplaced_nodes ? () => { setView("unplaced"); setSearch(""); } : undefined} />
            </div>

            {sm?.cells_missing_n > 0 && (
              <div className="rounded-xl px-3 py-2.5 text-xs flex items-start gap-2"
                style={{ background: `${C_WARN}14`, border: `1px solid ${C_WARN}55`, color: "var(--text-1)" }}>
                <Grid3x3 size={14} className="flex-shrink-0 mt-px" style={{ color: C_WARN }} />
                <span>
                  {fill(t("vfx.str.missingCells"), { n: sm.cells_missing_n })}{" "}
                  <span className="font-mono">{sm.cells_missing.join(", ")}{sm.cells_missing_n > sm.cells_missing.length ? " …" : ""}</span>
                </span>
              </div>
            )}

            {d?.filial && <FilialCard f={d.filial} />}

            {view === "tree" && !search.trim() ? (
              <TableCard icon={FolderTree} title={t("vfx.str.treeTitle")}
                right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{num(d?.nodes?.length || 0)}</span>}
                toolbar={toolbar}>
                <thead>
                  <tr>
                    <Th label={t("vfx.str.col.name")} />
                    <Th label={t("vfx.str.col.code")} />
                    <Th label={t("vfx.str.col.cell")} />
                    <Th label={t("vfx.str.col.people")} align="right" hint={t("vfx.str.col.peopleHint")} />
                    <Th label={t("vfx.str.col.total")} align="right" hint={t("vfx.str.col.totalHint")} />
                    <Th label={t("vfx.str.col.opened")} />
                  </tr>
                </thead>
                <tbody>
                  {!d ? (
                    <tr><td colSpan={6} className="p-3"><SkeletonTable rows={8} cols={5} /></td></tr>
                  ) : visible.map((n) => {
                    const kids = tree.kids.get(n.id) || [];
                    const isOpen = open.has(n.id);
                    const lvl = tree.depth.get(n.id) || 0;
                    return (
                      <tr key={n.id}>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1 min-w-0" style={{ paddingLeft: lvl * 16 }}>
                            {kids.length ? (
                              <button type="button" onClick={() => toggle(n.id)} aria-expanded={isOpen}
                                aria-label={fill(t(isOpen ? "vfx.str.collapse" : "vfx.str.expand"), { name: n.name })}
                                className="w-6 h-6 grid place-items-center rounded-md hover:bg-[var(--bg-accent)] flex-shrink-0"
                                style={{ color: "var(--text-3)" }}>
                                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                            ) : <span className="w-6 flex-shrink-0" />}
                            <span className="truncate max-w-[380px]" style={{ color: n.state === "A" ? "var(--text-1)" : "var(--text-3)",
                              fontWeight: lvl === 0 ? 600 : 400 }}>{tx(n.name)}</span>
                            {kids.length > 0 && <span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>{kids.length}</span>}
                            {n.state !== "A" && <Chip color={C_NONE}>{t("vfx.passive")}</Chip>}
                          </div>
                        </td>
                        <td className="px-3 py-1.5 font-mono">{n.raw_code || <span style={{ color: "var(--text-4)" }}>—</span>}</td>
                        <td className="px-3 py-1.5"><CellChip cell={n.cell} compact /></td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{n.people ? num(n.people) : <span style={{ color: "var(--text-4)" }}>0</span>}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: "var(--text-2)" }}>{num(tree.total.get(n.id) ?? 0)}</td>
                        <td className="px-3 py-1.5 tabular-nums" style={{ color: "var(--text-3)" }}>{n.opened ? dmy(n.opened) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableCard>
            ) : (
              <VfxTable icon={FolderTree}
                title={t(search.trim() && view === "tree" ? "vfx.str.searchTitle" : `vfx.str.view.${view}`)}
                right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{num(flat.length)}</span>}
                toolbar={toolbar} rows={flat} columns={flatColumns} rowKey={(n) => n.id} loading={!d}
                defaultSort={view === "cells" ? { key: "cell", dir: "asc" } : { key: "people", dir: "desc" }}
                empty={t(view === "unplaced" ? "vfx.str.emptyUnplaced" : "vfx.noMatch")} />
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

function FilialCard({ f }) {
  const { t } = useLang();
  const { tx } = useTranslit();
  const facts = [
    [MapPin, [f.region_name, f.address, f.address_guide].filter(Boolean).join(" · ")],
    [Phone, f.main_phone], [Mail, f.email], [Globe, f.web], [Send, f.telegram],
  ].filter(([, v]) => v);
  return (
    <div className="rounded-2xl p-4 flex items-start gap-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      {f.photo_sha ? <VfxPhoto sha={f.photo_sha} name={f.filial_name} px={48} square zoom />
        : <span className="w-12 h-12 rounded-lg grid place-items-center flex-shrink-0"
          style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}><Building2 size={20} /></span>}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{t("vfx.str.filial")}</div>
        <div className="text-base font-semibold" style={{ color: "var(--text-1)" }}>{tx(f.filial_name) || "—"}</div>
        {facts.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-2)" }}>
            {facts.map(([Icon, v], i) => (
              <span key={i} className="inline-flex items-center gap-1.5 min-w-0">
                <Icon size={12} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
                <span className="truncate">{tx(v)}</span>
              </span>
            ))}
          </div>
        )}
        {f.note && <p className="mt-1.5 text-xs" style={{ color: "var(--text-3)" }}>{tx(f.note)}</p>}
      </div>
    </div>
  );
}
