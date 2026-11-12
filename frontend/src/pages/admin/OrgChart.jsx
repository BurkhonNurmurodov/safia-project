import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileText, KeyRound, Network } from "lucide-react";
import api from "../../utils/api";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import Modal from "../../components/ui/Modal";
import StyledSelect from "../../components/ui/StyledSelect";
import { FilterPanel, PickFilter } from "../../components/ui/ColumnFilter";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import OrgCanvas from "../../components/orgchart/OrgCanvas";
import { useNodeText } from "../../components/orgchart/orgNode";
import OrgDetails from "../../components/orgchart/OrgDetails";
import { useLang } from "../../context/LangContext";
import useIsMobile from "../../hooks/useIsMobile";
import { usePersistentState } from "../../hooks/usePersistentState";
import { PAGES } from "../../config/pages";
import { buildTree, pathTo, peopleUnder } from "../../utils/orgTree";
import { TXT, fill } from "./orgChartText";

/**
 * «Tashkiliy tuzilma» (/panel/orgchart) — the platform's people as one chart:
 * where each stands (plant → shift → brigadir → leader, and the roles that
 * hang on no unit), which pages they open and what was granted to them
 * personally, with the way to their «Xodim kartasi».
 *
 * Read-only. The server resolves every access answer by the guards' own rule
 * (services/org_chart.py); this page only draws it. Three ways in:
 *   - the picker brings one person to the middle and opens their panel;
 *   - «Sahifa» lights up everybody who may open one page;
 *   - «Belgi» lights up the exceptions (personal grants, a closed page, a
 *     position nobody claimed, a browser login).
 * A folded branch holding matches says how many on its pill, and the ‹ ›
 * on the lens's summary walk the matches one by one — each is brought to the
 * middle with its panel open. Nothing unfolds or zooms by itself: a lens that
 * opened forty branches under the reader left a tree nobody could read.
 *
 * `?n=<node id>` is the open panel, so «back» from the card it led to returns
 * to the same person. The opened branches are remembered per device.
 */

const PAGE_LABEL = Object.fromEntries(PAGES.map((p) => [p.key, p.labelKey]));
const MARKS = ["personal", "denied", "vacant", "web"];
const PANEL_W = 348;

const hasOwn = (x) => Object.keys(x.grants).length > 0 || x.denies.length > 0;
const MARK_TEST = {
  personal: (p) => hasOwn(p) || p.accounts.some(hasOwn),
  denied:   (p) => p.access.denied.length > 0 || p.accounts.some((a) => a.access?.denied.length > 0),
  vacant:   (p) => p.accounts.length === 0,
  web:      (p) => p.web,
};
const opens = (access, page) => access.all || access.pages.some((r) => r.page === page);

const defaultOpen = (tree) =>
  ["root", ...tree.root.children.filter((n) => n.kind === "factory").map((n) => n.id)];

export default function OrgChart() {
  const { t, lang } = useLang();
  const P = TXT[lang] || TXT.uz;
  const wide = !useIsMobile(1024);
  const text = useNodeText(P);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin-org-chart"],
    queryFn: () => api.get("/admin/org-chart").then((r) => r.data),
    staleTime: 30_000,
  });
  const tree = useMemo(() => (data ? buildTree(data) : null), [data]);

  // ── what is open ────────────────────────────────────────────────────────
  const [open, setOpen] = usePersistentState("orgchart.open", null);
  const expanded = useMemo(
    () => new Set(open ?? (tree ? defaultOpen(tree) : [])),
    [open, tree],
  );
  const [command, setCommand] = useState(null);
  const seq = useRef(0);
  const ask = useCallback((type, id) => setCommand({ type, id, seq: ++seq.current }), []);

  const toggle = useCallback((id) => {
    setOpen((prev) => {
      const s = new Set(prev ?? (tree ? defaultOpen(tree) : []));
      if (s.has(id)) s.delete(id); else s.add(id);
      return [...s];
    });
  }, [setOpen, tree]);

  /** Unfold whatever hides these nodes (their ancestors — never the nodes). */
  const reveal = useCallback((ids) => {
    if (!tree) return;
    setOpen((prev) => {
      const s = new Set(prev ?? defaultOpen(tree));
      for (const id of ids) for (const a of pathTo(tree.index, id).slice(0, -1)) s.add(a);
      return [...s];
    });
  }, [setOpen, tree]);

  // ── the open panel lives in the address ─────────────────────────────────
  const [sp, setSp] = useSearchParams();
  const selected = sp.get("n");
  const node = tree && selected ? tree.index.get(selected) : null;
  const select = useCallback((id) => {
    setSp((prev) => {
      const q = new URLSearchParams(prev);
      if (id && q.get("n") !== id) q.set("n", id); else q.delete("n");
      return q;
    }, { replace: true });
  }, [setSp]);
  const close = useCallback(() => select(null), [select]);

  const go = useCallback((id) => {
    if (!id || !tree?.index.has(id)) return;
    reveal([id]);
    setSp((prev) => { const q = new URLSearchParams(prev); q.set("n", id); return q; }, { replace: true });
    ask("focus", id);
  }, [tree, reveal, setSp, ask]);

  // Arriving with ?n= (a link, or «back» from the card): show that person.
  const arrived = useRef(null);
  useEffect(() => {
    if (!tree || arrived.current === tree) return;
    arrived.current = tree;
    if (selected && tree.index.has(selected)) { reveal([selected]); ask("focus", selected); }
  }, [tree, selected, reveal, ask]);

  // ── the two lenses ──────────────────────────────────────────────────────
  const [page, setPage] = useState(null);
  const [mark, setMark] = useState(null);
  const lensOn = Boolean(page || mark);

  const { marks, hits, found } = useMemo(() => {
    if (!tree || !lensOn) return { marks: null, hits: null, found: [] };
    const m = new Map();
    for (const n of tree.index.values()) {
      if (n.kind !== "person") continue;
      const p = n.profile;
      let v = "on";
      if (page) {
        if (opens(p.access, page)) v = "on";
        else if (p.accounts.some((a) => a.access && opens(a.access, page))) v = "part";
        else continue;
      }
      if (mark && !MARK_TEST[mark](p)) continue;
      m.set(n.id, v);
    }
    const h = new Map();
    (function count(n) {
      let k = m.has(n.id) ? 1 : 0;
      for (const c of n.children) k += count(c);
      h.set(n.id, k);
      return k;
    })(tree.root);
    // In the chart's own order (left to right, top down), for the ‹ › walk.
    const order = peopleUnder(tree.root).map((n) => n.id).filter((id) => m.has(id));
    return { marks: m, hits: h, found: order };
  }, [tree, lensOn, page, mark]);
  const total = found.length;
  const at = selected ? found.indexOf(selected) : -1;
  const step = (d) => {
    if (!total) return;
    go(found[at < 0 ? (d > 0 ? 0 : total - 1) : (at + d + total) % total]);
  };

  // ── toolbar ─────────────────────────────────────────────────────────────
  const pageName = useCallback((p) => t(PAGE_LABEL[p] ?? `nav.${p}`), [t]);
  const people = useMemo(() => {
    if (!tree) return [];
    return [...tree.index.values()]
      .filter((n) => n.kind === "person")
      .map((n) => { const { title, sub } = text(n, tree.root); return { id: n.id, title, sub }; })
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((x) => ({
        value: x.id,
        title: `${x.title} · ${x.sub}`,
        short: x.title,
        label: (
          <span className="flex items-baseline gap-2 min-w-0">
            <span className="truncate">{x.title}</span>
            <span className="text-[11px] flex-shrink-0" style={{ color: "var(--text-3)" }}>{x.sub}</span>
          </span>
        ),
      }));
  }, [tree, text]);

  const sections = [
    {
      key: "page", icon: FileText, label: P.fPage,
      active: Boolean(page), display: page ? pageName(page) : "",
      onClear: () => setPage(null),
      render: ({ close: shut } = {}) => (
        <PickFilter
          searchable close={shut} value={page}
          opts={(data?.page_keys || []).map((p) => ({ value: p, label: pageName(p) }))}
          onChange={(v) => setPage(v === page ? null : v)}
        />
      ),
    },
    {
      key: "mark", icon: KeyRound, label: P.fMark,
      active: Boolean(mark), display: mark ? P.mark[mark] : "",
      onClear: () => setMark(null),
      render: ({ close: shut } = {}) => (
        <PickFilter
          close={shut} value={mark ?? "all"}
          opts={[{ value: "all", label: P.markAll }, ...MARKS.map((m) => ({ value: m, label: P.mark[m] }))]}
          onChange={(v) => setMark(v === "all" ? null : v)}
        />
      ),
    },
  ];

  // ── the canvas fills what is left of the screen ─────────────────────────
  const boxRef = useRef(null);
  const [top, setTop] = useState(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = boxRef.current;
      if (!el) return;
      const main = el.closest("main");
      setTop(Math.round(el.getBoundingClientRect().top + (main ? main.scrollTop : 0)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [isLoading, isError]);
  const height = `max(420px, calc(100dvh - ${top ?? 220}px - 2.75rem - var(--tg-safe-bottom, 0px)))`;

  const expandAll = useCallback(() => {
    if (!tree) return;
    setOpen([...tree.index.values()].filter((n) => n.children.length).map((n) => n.id));
    ask("fit");
  }, [tree, setOpen, ask]);
  const collapseAll = useCallback(() => { setOpen(["root"]); ask("fit"); }, [setOpen, ask]);

  if (isLoading) {
    return (
      <div>
        <div className="flex gap-2 mb-3">
          <SkeletonBlock className="h-[38px] w-full sm:w-72 rounded-lg" />
          <SkeletonBlock className="h-[38px] w-28 rounded-xl" />
        </div>
        <SkeletonBlock className="rounded-2xl" style={{ height: "max(420px, calc(100dvh - 17rem))" }} />
      </div>
    );
  }
  if (isError || !tree) {
    return (
      <EmptyState
        tone="danger" icon={Network} title={P.loadFail} message="" showUploadLink={false} height="h-64"
        action={<Button variant="secondary" size="md" loading={isFetching} onClick={() => refetch()}>{P.retry}</Button>}
      />
    );
  }
  if (!tree.root.people) {
    return <EmptyState icon={Network} title={P.empty} message="" showUploadLink={false} height="h-64" />;
  }

  const nodeText = node ? text(node, tree.root) : null;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <StyledSelect
          className="w-full sm:w-72"
          searchable searchPlaceholder={P.findSearch} placeholder={P.find} ariaLabel={P.find}
          value={node?.kind === "person" ? selected : ""}
          options={people}
          onChange={(v) => (v ? go(v) : close())}
        />
        <FilterPanel sections={sections} chipsWrap />
        <span className="ml-auto text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
          {fill(P.profiles, { n: tree.root.people })}
        </span>
      </div>

      <div ref={boxRef}>
        <OrgCanvas
          tree={tree} expanded={expanded} selected={node ? selected : null}
          marks={marks} hits={hits} lensOn={lensOn} P={P} command={command}
          insetLeft={wide && node ? PANEL_W + 24 : 0}
          onSelect={select} onToggle={toggle} onExpandAll={expandAll} onCollapseAll={collapseAll}
          height={height}
        >
          {lensOn && (
            <div
              data-org-nopan
              className="absolute right-3 top-3 max-w-[calc(100%-1.5rem)] flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-2)", cursor: "default", boxShadow: "0 2px 8px rgba(0,0,0,.08)" }}
              role="status"
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: total ? "#22c55e" : "#94a3b8" }} />
              <span className="truncate">
                {page
                  ? fill(P.lensPage, { page: pageName(page), n: total })
                  : fill(P.lensMark, { mark: P.mark[mark], n: total })}
                {page && mark ? ` · ${P.mark[mark]}` : ""}
              </span>
              {total > 0 && (
                <span className="flex items-center flex-shrink-0 -my-1 -mr-1.5">
                  <Button variant="ghost" size="sm" className="!px-1.5" icon={<ChevronLeft size={15} />} onClick={() => step(-1)} title={P.prev} aria-label={P.prev} />
                  <span className="min-w-[3ch] text-center tabular-nums font-semibold" style={{ color: "var(--text-1)" }}>
                    {at >= 0 ? at + 1 : "–"}
                  </span>
                  <Button variant="ghost" size="sm" className="!px-1.5" icon={<ChevronRight size={15} />} onClick={() => step(1)} title={P.next} aria-label={P.next} />
                </span>
              )}
            </div>
          )}
          {wide && node && (
            <aside
              data-org-nopan
              className="absolute left-3 top-3 overflow-y-auto rounded-2xl"
              style={{
                width: PANEL_W, maxHeight: "calc(100% - 4.75rem)", cursor: "default",
                background: "var(--bg-card)", border: "1px solid var(--border-md)",
                boxShadow: "0 10px 30px rgba(0,0,0,.14)", userSelect: "text",
              }}
            >
              <OrgDetails node={node} data={data} tree={tree} P={P} onSelect={go} onClose={close} />
            </aside>
          )}
        </OrgCanvas>
      </div>

      {!wide && node && (
        <Modal open onClose={close} title={nodeText.title} subtitle={nodeText.sub} bodyClassName="px-5 py-4">
          <OrgDetails bare node={node} data={data} tree={tree} P={P} onSelect={go} onClose={close} />
        </Modal>
      )}
    </div>
  );
}
