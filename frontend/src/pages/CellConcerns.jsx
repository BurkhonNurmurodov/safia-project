// «Yacheyka havotirlari» — the page a WORKER types into.
//
// A PC stands on each production cell with its LEADER's profile open here, and
// the cell's workers write their concerns straight into the platform, replacing
// the per-cell Google sheets. Three tabs, and the ENTRY tab is the default one:
// the page's most frequent user is a worker who walks up to it, not the leader
// who reads it afterwards.
//
// Rows live in leader_concerns at level="leader" (see backend
// routers/cell_concerns.py), so every action here is the ordinary concerns
// machinery reached under this page's grant:
//   status / text  → PUT    /api/concerns/{id}
//   uplift         → POST   /api/concerns/{id}/escalate  (direction "up")
//   thread         → CommentsModal on /api/concerns/{id}/comments
//   delete         → DELETE /api/concerns/{id}
// Uplifting moves the level, which is what makes the row LEAVE this page — it
// belongs to the brigadir on /concerns from that moment (the operator's ruling,
// 2026-09-04). Nothing here re-implements any of it.
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquarePlus, ListChecks, ChartNoAxesColumn, Check, AlertTriangle,
  Trash2, ArrowUp, Loader2, Inbox, UserRound, CircleDot, Clock, CheckCheck,
  Users, LayoutGrid, TrendingUp, Info,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import DateRangePicker, { localISO } from "../components/ui/DateRangePicker";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Button from "../components/ui/Button";
import Field from "../components/ui/FormField";
import SearchInput from "../components/ui/SearchInput";
import StyledSelect from "../components/ui/StyledSelect";
import TableCard, { Th, SectionHead } from "../components/ui/DataTable";
import CommentsModal, { CommentsButton } from "../components/ui/CommentsModal";
import { FilterPanel, PickFilter } from "../components/ui/ColumnFilter";
import { SkeletonBlock } from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import CellLink from "../components/ui/CellLink";
import { useToast } from "../components/ui/Toast";
import api from "../utils/api";
import { useLang } from "../context/LangContext";
import { usePersistentState } from "../hooks/usePersistentState";
import { CATEGORIES, CATEGORY_COLOR, CATEGORY_ICON } from "../utils/concernCategories";
// A cell is its CODE; where a code alone is too thin the second fact is its
// LEADER — never the workshop name (utils/cellName.js).
import { cellLabel } from "../utils/cellName";

// Traffic light, the platform's own semantics: "not started" is GREY (it is not
// a fault), doing is amber, done is green. Red is reserved for OVERDUE, which
// is a FLAG on an open row and never a fourth bucket — pulling overdue rows out
// of their status is how a board of twelve overdue «todo» rows prints «todo: 0».
const ST = {
  todo:  { color: "#94a3b8", icon: CircleDot },
  doing: { color: "#eab308", icon: Clock },
  done:  { color: "#22c55e", icon: CheckCheck },
};
const STATUSES = ["todo", "doing", "done"];
const DEADLINE_CHIPS = [1, 3, 7, 14];
const MAX_DEADLINE_DAYS = 365;   // twin of cell_concerns.MAX_DEADLINE_DAYS
const RESET_AFTER_MS = 15000;

// Above this many cells the tile grid stops being an affordance and becomes an
// obstacle: the register holds 108 cells, and rendering them as tiles pushed the
// rest of the form two and a half screens down for anyone who is not a single
// leader. Past the threshold the picker becomes the platform's own searchable
// dropdown instead.
//
// The switch is on COUNT, not on ROLE. A leader who happens to own twenty cells
// has exactly the same problem as an admin who can see every one of them, and a
// role test would leave that leader scrolling while claiming to have fixed it.
const MANY_CELLS = 8;

// LangContext's t() takes a KEY and nothing else — there is no interpolation in
// it, so a second argument is silently dropped and the placeholder renders
// literally ("{n} kun", which is exactly what shipped). The codebase's idiom is
// t(key).replace("{n}", v); with fifteen parameterised strings on this page
// that is fifteen chains to get wrong, so this does it in one place.
const tp = (t, key, params) =>
  Object.entries(params).reduce(
    (out, [k, v]) => out.split(`{${k}}`).join(String(v)),
    t(key),
  );

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

const isOverdue = (r) =>
  r.status !== "done" && r.deadline_days && r.entry_date &&
  new Date(r.entry_date).getTime() + r.deadline_days * 864e5 < Date.now();

const initials = (n) =>
  String(n || "").trim().split(/\s+/).slice(0, 2).map((p) => p[0] || "").join("").toUpperCase();

export default function CellConcerns() {
  const { t } = useLang();
  const qc = useQueryClient();
  // position="bottom" — this page is a dense editing surface, and a toast at
  // the top would sit behind the entry form the worker is looking at.
  const { show, node: toastNode } = useToast({ position: "bottom" });

  const [tab, setTab] = usePersistentState("cellConcerns.tab", "write");
  const [dateFrom, setDateFrom] = usePersistentState("cellConcerns.from", "");
  const [dateTo, setDateTo] = usePersistentState("cellConcerns.to", "");
  const [fCell, setFCell] = usePersistentState("cellConcerns.cell", "");
  const [fCat, setFCat] = usePersistentState("cellConcerns.cat", "");
  const [fSt, setFSt] = usePersistentState("cellConcerns.st", "");
  const [q, setQ] = useState("");

  const { data: meta } = useQuery({
    queryKey: ["cell-concerns", "meta"],
    queryFn: () => api.get("/api/cell-concerns/meta").then((r) => r.data),
  });
  const cells = meta?.cells || [];

  const params = useMemo(() => {
    const p = {};
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    if (fCell) p.cell = fCell;
    if (fCat) p.category = fCat;
    if (fSt) p.status = fSt;
    return p;
  }, [dateFrom, dateTo, fCell, fCat, fSt]);

  const listKey = ["cell-concerns", "list", params];
  const { data: list, isLoading } = useQuery({
    queryKey: listKey,
    queryFn: () => api.get("/api/cell-concerns", { params }).then((r) => r.data),
  });
  const { data: stats } = useQuery({
    queryKey: ["cell-concerns", "stats", params],
    queryFn: () => api.get("/api/cell-concerns/stats", { params }).then((r) => r.data),
    enabled: tab === "analysis",
  });

  const rows = useMemo(() => {
    const all = list?.rows || [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((r) =>
      `${r.seq} ${r.worker_name || ""} ${r.concern_text || ""}`.toLowerCase().includes(needle)
    );
  }, [list, q]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["cell-concerns"] });

  const [detail, setDetail] = useState(null);
  const [comments, setComments] = useState(null);

  const tabs = [
    { value: "write",    label: <span className="inline-flex items-center gap-1.5"><MessageSquarePlus size={15} />{t("cellConcerns.tab.write")}</span> },
    { value: "register", label: <span className="inline-flex items-center gap-1.5"><ListChecks size={15} />{t("cellConcerns.tab.register")}</span> },
    { value: "analysis", label: <span className="inline-flex items-center gap-1.5"><ChartNoAxesColumn size={15} />{t("cellConcerns.tab.analysis")}</span> },
  ];

  // Scope controls live INSIDE the FilterPanel, never as loose selects above
  // the table. The period control stays inline beside it.
  const sections = [
    cells.length > 1 && {
      key: "cell", label: t("cellConcerns.f.cell"), active: !!fCell,
      display: fCell, onClear: () => setFCell(""),
      render: ({ close }) => (
        <PickFilter
          value={fCell} close={close} onChange={setFCell}
          opts={[{ value: "", label: t("cellConcerns.all") },
                 ...cells.map((c) => ({ value: c.code, label: c.code }))]}
        />
      ),
    },
    {
      key: "cat", label: t("cellConcerns.f.category"), active: !!fCat,
      display: fCat ? t(`concerns.category.${fCat}`) : "", onClear: () => setFCat(""),
      render: ({ close }) => (
        <PickFilter
          value={fCat} close={close} onChange={setFCat} searchable
          opts={[{ value: "", label: t("cellConcerns.all") },
                 ...CATEGORIES.map((k) => ({ value: k, label: t(`concerns.category.${k}`) }))]}
        />
      ),
    },
    {
      key: "st", label: t("cellConcerns.f.status"), active: !!fSt,
      display: fSt ? t(`cellConcerns.st.${fSt}`) : "", onClear: () => setFSt(""),
      render: ({ close }) => (
        <PickFilter
          value={fSt} close={close} onChange={setFSt}
          opts={[{ value: "", label: t("cellConcerns.all") },
                 ...STATUSES.map((s) => ({ value: s, label: t(`cellConcerns.st.${s}`) }))]}
        />
      ),
    },
  ].filter(Boolean);

  const toolbar = (
    <>
      <DateRangePicker
        dateFrom={dateFrom} dateTo={dateTo}
        setDateFrom={setDateFrom} setDateTo={setDateTo}
        compactLabel triggerClassName="px-3 py-2 text-sm"
      />
      <FilterPanel sections={sections} />
      <div className="flex-1 min-w-0" />
      <SearchInput value={q} onChange={setQ} placeholder={t("cellConcerns.searchPh")} />
    </>
  );

  return (
    <Layout>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-1)" }}>
            {t("cellConcerns.title")}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
            {t("cellConcerns.subtitle")}
          </p>
        </div>

        <SegmentedToggle
          value={tab} onChange={setTab} options={tabs} asTabs
          ariaLabel={t("cellConcerns.title")}
        />

        {tab === "write" && (
          <WriteTab
            cells={cells} t={t}
            onFiled={(row) => { refresh(); show(tp(t, "cellConcerns.filed", { no: row.seq }), "success"); }}
            onError={(msg) => show(msg, "error")}
          />
        )}

        {tab === "register" && (
          <RegisterTab
            t={t} rows={rows} loading={isLoading} toolbar={toolbar}
            onOpen={setDetail} onComments={setComments}
            anyFilter={!!(fCell || fCat || fSt || q)}
            onClearFilters={() => { setFCell(""); setFCat(""); setFSt(""); setQ(""); }}
          />
        )}

        {tab === "analysis" && (
          <AnalysisTab t={t} stats={stats} toolbar={toolbar} />
        )}
      </div>

      {detail && (
        <DetailModal
          t={t} row={detail} onClose={() => setDetail(null)}
          onComments={() => setComments(detail)}
          onDone={(msg, tone = "success") => { refresh(); setDetail(null); show(msg, tone); }}
          onError={(msg) => show(msg, "error")}
        />
      )}

      {comments && (
        <CommentsModal
          endpoint={`/api/concerns/${comments.id}/comments`}
          queryKey={["concern-comments", comments.id]}
          refreshKeys={[["cell-concerns"]]}
          title={tp(t, "cellConcerns.commentsTitle", { no: comments.seq })}
          subtitle={comments.cell_code}
          onClose={() => setComments(null)}
          zIndex={detail ? 60 : 50}
        />
      )}

      {toastNode}
    </Layout>
  );
}

/* ── Tab 1 · the worker's form ─────────────────────────────────────────── */

function WriteTab({ cells, t, onFiled, onError }) {
  const only = cells.length === 1 ? cells[0].code : "";
  const [cell, setCell] = useState(only);
  const [name, setName] = useState("");
  const [cat, setCat] = useState("");
  const [text, setText] = useState("");
  const [days, setDays] = useState(null);
  const [errs, setErrs] = useState({});
  const [done, setDone] = useState(null);
  const [left, setLeft] = useState(0);
  const nameRef = useRef(null);

  useEffect(() => { if (cells.length === 1) setCell(cells[0].code); }, [cells]);

  const reset = () => {
    setCell(cells.length === 1 ? cells[0].code : "");
    setName(""); setCat(""); setText(""); setDays(null); setErrs({}); setDone(null);
    nameRef.current?.focus();
  };

  // The form clears itself so the NEXT worker never finds the last one's
  // answers, and the countdown says so rather than wiping under their hands.
  useEffect(() => {
    if (!done) return;
    setLeft(RESET_AFTER_MS / 1000);
    const iv = setInterval(() => setLeft((s) => (s <= 1 ? (reset(), 0) : s - 1)), 1000);
    return () => clearInterval(iv);
  }, [done]);

  const file = useMutation({
    mutationFn: (body) => api.post("/api/cell-concerns", body).then((r) => r.data),
    onSuccess: (row) => { setDone(row); onFiled(row); },
    onError: (e) => onError(e?.response?.data?.detail || t("cellConcerns.saveFailed")),
  });

  const submit = (e) => {
    e.preventDefault();
    const next = {
      cell: !cell, name: !name.trim(), cat: !cat, text: !text.trim(),
    };
    setErrs(next);
    if (Object.values(next).some(Boolean)) {
      onError(t("cellConcerns.fillRequired"));
      return;
    }
    file.mutate({
      cell_code: cell, worker_name: name.trim(), category: cat,
      concern_text: text.trim(), deadline_days: days,
    });
  };

  if (done) {
    return (
      <div className="max-w-2xl mx-auto rounded-2xl px-6 py-12 text-center"
           style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="w-16 h-16 mx-auto mb-4 rounded-full grid place-items-center"
             style={{ background: rgba("#22c55e", 0.13), border: `1px solid ${rgba("#22c55e", 0.3)}`, color: "#22c55e" }}>
          <Check size={30} />
        </div>
        <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--text-1)" }}>
          {t("cellConcerns.done.title")}
        </h2>
        <p className="text-sm mx-auto mb-5" style={{ color: "var(--text-2)", maxWidth: "46ch" }}>
          {t("cellConcerns.done.body")}
        </p>
        <div className="inline-flex items-center gap-5 px-5 py-3 rounded-xl mb-6"
             style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)" }}>
          <Receipt k={t("cellConcerns.done.no")} v={`№${done.seq}`} />
          <div className="w-px self-stretch" style={{ background: "var(--border-md)" }} />
          <Receipt k={t("cellConcerns.f.cell")} v={done.cell_code} />
        </div>
        <div>
          <Button size="lg" onClick={reset}>{t("cellConcerns.done.again")}</Button>
        </div>
        <div className="text-[11px] mt-4" style={{ color: "var(--text-4)" }}>
          {tp(t, "cellConcerns.done.countdown", { n: left })}
        </div>
      </div>
    );
  }

  if (!cells.length) {
    return (
      <EmptyState
        icon={Inbox}
        title={t("cellConcerns.noCells.title")}
        message={t("cellConcerns.noCells.body")}
        showUploadLink={false}
      />
    );
  }

  return (
    <form className="max-w-2xl mx-auto space-y-4" onSubmit={submit} noValidate>
      {cells.length > 1 && (
        <Card>
          <Step n={1} label={t("cellConcerns.step.cell")} required />
          {cells.length > MANY_CELLS ? (
            // Searchable dropdown — StyledSelect is THE dropdown template, so
            // this is the same control the rest of the platform uses rather
            // than a scrollable tile grid nobody can find their code in. The
            // option carries the cell's LEADER beside the code (cellLabel), the
            // one extra fact a cell is allowed to be named by, because at this
            // size the reader is an admin choosing among other people's cells.
            <StyledSelect
              value={cell}
              onChange={(v) => { setCell(v); setErrs((e) => ({ ...e, cell: false })); }}
              options={cells.map((c) => ({
                value: c.code, label: cellLabel(c.code, c.leader_name), title: c.code,
              }))}
              placeholder={t("cellConcerns.cellPick")}
              searchable
              searchPlaceholder={t("cellConcerns.cellSearchPh")}
              // Height goes in triggerClassName, NOT the `style` prop:
              // StyledSelect documents `style` as "extra inline styles on the
              // trigger button" but never spreads it, so anything passed there
              // is silently dropped. 52px matches the name/text inputs above.
              triggerClassName="px-3.5 text-base h-[52px]"
            />
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(112px,1fr))" }}>
              {cells.map((c) => (
                <button
                  key={c.code} type="button" aria-pressed={cell === c.code}
                  onClick={() => { setCell(c.code); setErrs((e) => ({ ...e, cell: false })); }}
                  className="h-20 rounded-xl flex flex-col items-center justify-center transition-colors"
                  style={{
                    background: cell === c.code ? "var(--brand-bg)" : "var(--bg-inner)",
                    border: `1px solid ${cell === c.code ? "var(--brand)" : "var(--border-md)"}`,
                    color: cell === c.code ? "var(--brand-text)" : "var(--text-1)",
                  }}
                >
                  <span className="text-2xl font-bold tabular-nums">{c.code}</span>
                  <span className="text-[11px]" style={{ color: "var(--text-4)" }}>
                    {t("cellConcerns.cellWord")}
                  </span>
                </button>
              ))}
            </div>
          )}
          {errs.cell && <Err text={t("cellConcerns.err.cell")} />}
        </Card>
      )}

      <Card>
        <Step n={cells.length > 1 ? 2 : 1} label={t("cellConcerns.step.name")} required />
        <input
          ref={nameRef} value={name}
          onChange={(e) => { setName(e.target.value); setErrs((x) => ({ ...x, name: false })); }}
          placeholder={t("cellConcerns.namePh")} autoComplete="off"
          aria-invalid={!!errs.name}
          className="w-full h-13 px-3.5 rounded-xl text-base outline-none"
          style={{
            height: 52, background: "var(--bg-inner)", color: "var(--text-1)",
            border: `1px solid ${errs.name ? "#ef4444" : "var(--border-md)"}`,
          }}
        />
        <div className="text-[11px] mt-1.5" style={{ color: "var(--text-3)" }}>
          {t("cellConcerns.nameHint")}
        </div>
        {errs.name && <Err text={t("cellConcerns.err.name")} />}
      </Card>

      <Card>
        <Step n={cells.length > 1 ? 3 : 2} label={t("cellConcerns.step.category")} required />
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(132px,1fr))" }}>
          {CATEGORIES.map((k) => {
            const Icon = CATEGORY_ICON[k];
            const col = CATEGORY_COLOR[k];
            const on = cat === k;
            return (
              <button
                key={k} type="button" aria-pressed={on}
                onClick={() => { setCat(k); setErrs((e) => ({ ...e, cat: false })); }}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-[13px] transition-colors"
                style={{
                  minHeight: 52,
                  background: on ? rgba(col, 0.12) : "var(--bg-inner)",
                  border: `1px solid ${on ? rgba(col, 0.45) : "var(--border)"}`,
                  color: on ? "var(--text-1)" : "var(--text-2)",
                }}
              >
                <span className="w-7 h-7 rounded-lg grid place-items-center shrink-0"
                      style={{ background: rgba(col, 0.13), color: col }}>
                  <Icon size={16} />
                </span>
                <span className="truncate">{t(`concerns.category.${k}`)}</span>
              </button>
            );
          })}
        </div>
        {errs.cat && <Err text={t("cellConcerns.err.category")} />}
      </Card>

      <Card>
        <Step n={cells.length > 1 ? 4 : 3} label={t("cellConcerns.step.text")} required />
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setErrs((x) => ({ ...x, text: false })); }}
          placeholder={t("cellConcerns.textPh")} rows={5} aria-invalid={!!errs.text}
          className="w-full px-3.5 py-3.5 rounded-xl text-base outline-none resize-y"
          style={{
            minHeight: 132, background: "var(--bg-inner)", color: "var(--text-1)",
            border: `1px solid ${errs.text ? "#ef4444" : "var(--border-md)"}`,
          }}
        />
        <div className="text-[11px] mt-1.5" style={{ color: "var(--text-3)" }}>
          {t("cellConcerns.textHint")}
        </div>
        {errs.text && <Err text={t("cellConcerns.err.text")} />}
      </Card>

      <Card>
        <Step n={cells.length > 1 ? 5 : 4} label={t("cellConcerns.step.deadline")} />
        {/* The chips are QUICK PICKS over this field, not the whole answer —
            1/3/7/14 cannot express "5 days", and a worker who needs that had no
            way to say it. One value behind both: typing clears the pressed chip,
            pressing a chip fills the field. */}
        <input
          type="number" inputMode="numeric" min={1} max={MAX_DEADLINE_DAYS}
          value={days ?? ""}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (v === "") { setDays(null); return; }
            const n = Math.floor(Number(v));
            if (Number.isFinite(n)) setDays(Math.min(MAX_DEADLINE_DAYS, Math.max(1, n)));
          }}
          placeholder={t("cellConcerns.daysPh")}
          className="w-full px-3.5 rounded-xl text-base outline-none mb-3"
          style={{
            height: 52, background: "var(--bg-inner)", color: "var(--text-1)",
            border: "1px solid var(--border-md)",
          }}
        />
        <div className="flex flex-wrap gap-2">
          {DEADLINE_CHIPS.map((d) => (
            <button
              key={d} type="button" aria-pressed={days === d}
              onClick={() => setDays(days === d ? null : d)}
              className="px-4 rounded-xl text-sm tabular-nums transition-colors"
              style={{
                height: 44, minWidth: 62,
                background: days === d ? "var(--brand-bg)" : "var(--bg-inner)",
                border: `1px solid ${days === d ? "var(--brand)" : "var(--border-md)"}`,
                color: days === d ? "var(--brand-text)" : "var(--text-2)",
                fontWeight: days === d ? 600 : 400,
              }}
            >
              {tp(t, "cellConcerns.days", { n: d })}
            </button>
          ))}
        </div>
        <div className="text-[11px] mt-3" style={{ color: "var(--text-3)" }}>
          {t("cellConcerns.deadlineHint")}
        </div>
      </Card>

      <div className="flex items-center gap-4 flex-wrap pt-1">
        <Button type="submit" size="lg" loading={file.isPending} icon={Check}
                className="!h-14 !px-7 !text-base">
          {t("cellConcerns.submit")}
        </Button>
      </div>
    </form>
  );
}

const Card = ({ children }) => (
  <div className="rounded-2xl p-5"
       style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
    {children}
  </div>
);

const Step = ({ n, label, required }) => (
  <div className="flex items-center gap-2 mb-3 text-[11px] font-bold uppercase tracking-[0.07em]"
       style={{ color: "var(--text-3)" }}>
    <span className="w-5 h-5 rounded-full grid place-items-center text-[11px] tracking-normal"
          style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}>{n}</span>
    {label}
    {required && <span style={{ color: "#ef4444" }}>*</span>}
  </div>
);

const Err = ({ text }) => (
  <div className="flex items-center gap-1.5 text-xs mt-2" style={{ color: "#ef4444" }}>
    <AlertTriangle size={14} /> {text}
  </div>
);

const Receipt = ({ k, v }) => (
  <div>
    <div className="text-[10.5px] font-bold uppercase tracking-[0.07em]" style={{ color: "var(--text-4)" }}>{k}</div>
    <div className="text-lg font-bold tabular-nums" style={{ color: "var(--text-1)" }}>{v}</div>
  </div>
);

/* ── Tab 2 · the register ──────────────────────────────────────────────── */

function StatusChip({ row, t }) {
  const over = isOverdue(row);
  const col = over ? "#ef4444" : ST[row.status]?.color || "#94a3b8";
  const Icon = over ? AlertTriangle : ST[row.status]?.icon || CircleDot;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
          style={{ background: rgba(col, 0.13), color: col, border: `1px solid ${rgba(col, 0.28)}` }}>
      <Icon size={12} />
      {over ? t("cellConcerns.st.overdue") : t(`cellConcerns.st.${row.status}`)}
    </span>
  );
}

function CatChip({ k, t }) {
  const col = CATEGORY_COLOR[k] || "#94a3b8";
  const Icon = CATEGORY_ICON[k];
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px]"
          style={{ background: rgba(col, 0.12), color: col, border: `1px solid ${rgba(col, 0.25)}` }}>
      {Icon && <Icon size={12} />} {t(`concerns.category.${k}`)}
    </span>
  );
}

function RegisterTab({ t, rows, loading, toolbar, onOpen, onComments, anyFilter, onClearFilters }) {
  if (loading) return <SkeletonBlock className="h-80" />;

  return (
    <TableCard
      icon={ListChecks}
      title={t("cellConcerns.registerTitle")}
      right={tp(t, "cellConcerns.nRows", { n: rows.length })}
      toolbar={toolbar}
      wrap
    >
      <thead>
        <tr>
          <Th label="№" />
          <Th label={t("cellConcerns.col.date")} />
          <Th label={t("cellConcerns.col.worker")} />
          <Th label={t("cellConcerns.col.cell")} />
          <Th label={t("cellConcerns.col.category")} />
          <Th label={t("cellConcerns.col.text")} />
          <Th label={t("cellConcerns.col.status")} />
          <Th label={t("cellConcerns.col.comments")} align="center" />
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={8} className="py-10">
              <EmptyState
                icon={Inbox}
                title={t(anyFilter ? "cellConcerns.empty.filtered" : "cellConcerns.empty.title")}
                message={t(anyFilter ? "cellConcerns.empty.filteredBody" : "cellConcerns.empty.body")}
                showUploadLink={false}
                action={anyFilter ? (
                  <Button variant="secondary" onClick={onClearFilters}>
                    {t("cellConcerns.clearFilters")}
                  </Button>
                ) : null}
              />
            </td>
          </tr>
        )}
        {rows.map((r) => (
          <tr key={r.id} className="cursor-pointer" onClick={() => onOpen(r)}>
            <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-3)" }}>№{r.seq}</td>
            <td className="px-3 py-2 tabular-nums whitespace-nowrap">{r.entry_date}</td>
            <td className="px-3 py-2">
              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                <span className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold shrink-0"
                      style={{ background: "var(--bg-accent)", color: "var(--text-2)" }}>
                  {initials(r.worker_name)}
                </span>
                {r.worker_name}
              </span>
            </td>
            <td className="px-3 py-2">
              <CellLink id={r.cell_id}>{r.cell_code}</CellLink>
            </td>
            <td className="px-3 py-2"><CatChip k={r.category} t={t} /></td>
            <td className="px-3 py-2" style={{ maxWidth: 340, color: "var(--text-2)" }}>
              <span className="line-clamp-2">{r.concern_text}</span>
            </td>
            <td className="px-3 py-2"><StatusChip row={r} t={t} /></td>
            <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
              <CommentsButton count={r.comment_count} onClick={() => onComments(r)} />
            </td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
}

/* ── the detail modal — status, text, uplift, delete ───────────────────── */

function DetailModal({ t, row, onClose, onComments, onDone, onError }) {
  const [status, setStatus] = useState(row.status);
  const [text, setText] = useState(row.concern_text);
  const [solution, setSolution] = useState("");
  const [uplift, setUplift] = useState(false);
  const [reason, setReason] = useState("");
  const [del, setDel] = useState(false);
  const [err, setErr] = useState(null);

  const closing = status === "done" && row.status !== "done";
  const fail = (e, fallback) => e?.response?.data?.detail || t(fallback);

  const save = useMutation({
    mutationFn: () => api.put(`/api/concerns/${row.id}`, {
      concern_text: text.trim(), status, solution: solution.trim() || undefined,
      cell_code: row.cell_code, category: row.category,
      deadline_days: row.deadline_days, entry_date: row.entry_date,
    }),
    onSuccess: () => onDone(tp(t, "cellConcerns.saved", { no: row.seq })),
    onError: (e) => onError(fail(e, "cellConcerns.saveFailed")),
  });

  const doUplift = useMutation({
    mutationFn: () => api.post(`/api/concerns/${row.id}/escalate`, {
      direction: "up", reason: reason.trim(),
    }),
    onSuccess: () => onDone(tp(t, "cellConcerns.uplifted", { no: row.seq }), "info"),
    onError: (e) => setErr(fail(e, "cellConcerns.saveFailed")),
  });

  const doDelete = useMutation({
    mutationFn: () => api.delete(`/api/concerns/${row.id}`),
    onSuccess: () => onDone(tp(t, "cellConcerns.deleted", { no: row.seq })),
    onError: (e) => setErr(fail(e, "cellConcerns.saveFailed")),
  });

  const submit = () => {
    if (closing && !solution.trim()) {
      onError(t("cellConcerns.err.solution"));
      return;
    }
    save.mutate();
  };

  return (
    <>
      <Modal
        onClose={onClose}
        title={tp(t, "cellConcerns.detailTitle", { no: row.seq })}
        subtitle={`${row.cell_code} · ${row.entry_date}`}
        maxWidth="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
            <Button variant="danger" tint icon={Trash2} onClick={() => setDel(true)}>
              {t("common.delete")}
            </Button>
            <div className="flex-1" />
            <Button variant="secondary" tint icon={ArrowUp} onClick={() => setUplift(true)}>
              {t("cellConcerns.uplift")}
            </Button>
            <Button onClick={submit} loading={save.isPending}>{t("common.save")}</Button>
          </>
        }
      >
        <div className="rounded-r-xl px-4 py-3.5 text-[14.5px] leading-relaxed"
             style={{ background: "var(--bg-inner)", borderLeft: "3px solid var(--brand)", color: "var(--text-1)" }}>
          {row.concern_text}
          <div className="mt-3 text-xs flex items-center gap-2" style={{ color: "var(--text-3)" }}>
            <UserRound size={13} /> {tp(t, "cellConcerns.filedBy", { name: row.worker_name || "—" })}
          </div>
        </div>

        <Field label={t("cellConcerns.col.status")}>
          <SegmentedToggle
            value={status} onChange={setStatus} fill
            options={STATUSES.map((s) => ({ value: s, label: t(`cellConcerns.st.${s}`) }))}
            ariaLabel={t("cellConcerns.col.status")}
          />
        </Field>

        {closing && (
          <Field label={t("cellConcerns.solution")} required
                 hint={t("cellConcerns.solutionHint")}>
            <textarea
              value={solution} onChange={(e) => setSolution(e.target.value)}
              rows={3} placeholder={t("cellConcerns.solutionPh")}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-y"
              style={{ background: "var(--bg-inner)", color: "var(--text-1)", border: "1px solid var(--border-md)" }}
            />
          </Field>
        )}

        <Field label={t("cellConcerns.col.text")} hint={t("cellConcerns.editHint")}>
          <textarea
            value={text} onChange={(e) => setText(e.target.value)} rows={3}
            className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-y"
            style={{ background: "var(--bg-inner)", color: "var(--text-1)", border: "1px solid var(--border-md)" }}
          />
        </Field>

        <div className="flex flex-wrap gap-6 pt-1">
          <Meta k={t("cellConcerns.deadlineWord")}
                v={row.deadline_days ? tp(t, "cellConcerns.days", { n: row.deadline_days }) : "—"} />
          <Meta k={t("cellConcerns.brigadir")} v={row.brigadir_name || "—"} />
          <Meta k={t("cellConcerns.col.comments")}
                v={<Button size="sm" variant="ghost" onClick={onComments}>
                     {tp(t, "cellConcerns.openThread", { n: row.comment_count || 0 })}
                   </Button>} />
        </div>
      </Modal>

      {uplift && (
        <Modal
          onClose={() => { setUplift(false); setErr(null); }}
          title={t("cellConcerns.uplift")}
          subtitle={tp(t, "cellConcerns.upliftTo", { name: row.brigadir_name || "" })}
          maxWidth="max-w-md" zIndex={60}
          footer={
            <>
              <Button variant="secondary" onClick={() => { setUplift(false); setErr(null); }}>
                {t("common.cancel")}
              </Button>
              <div className="flex-1" />
              <Button
                icon={ArrowUp} loading={doUplift.isPending}
                onClick={() => {
                  if (!reason.trim()) { setErr(t("cellConcerns.err.reason")); return; }
                  doUplift.mutate();
                }}
              >
                {t("cellConcerns.upliftDo")}
              </Button>
            </>
          }
        >
          <div className="flex gap-2.5 px-3.5 py-3 rounded-xl text-[13px] leading-relaxed"
               style={{ background: rgba("#3b82f6", 0.09), border: `1px solid ${rgba("#3b82f6", 0.25)}`, color: "var(--text-2)" }}>
            <Info size={16} style={{ color: "#3b82f6", flex: "none", marginTop: 2 }} />
            <span>{t("cellConcerns.upliftWarn")}</span>
          </div>
          <Field label={t("cellConcerns.reason")} required hint={t("cellConcerns.reasonHint")}
                 error={err}>
            <textarea
              value={reason} onChange={(e) => { setReason(e.target.value); setErr(null); }}
              rows={4} placeholder={t("cellConcerns.reasonPh")}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-y"
              style={{ background: "var(--bg-inner)", color: "var(--text-1)", border: "1px solid var(--border-md)" }}
            />
          </Field>
        </Modal>
      )}

      {del && (
        <ConfirmDialog
          tone="danger"
          title={t("cellConcerns.deleteTitle")}
          message={tp(t, "cellConcerns.deleteBody", { name: row.worker_name || "—" })}
          confirmLabel={t("common.delete")}
          loading={doDelete.isPending}
          error={err}
          onCancel={() => { setDel(false); setErr(null); }}
          onConfirm={() => doDelete.mutate()}
        />
      )}
    </>
  );
}

const Meta = ({ k, v }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[10.5px] font-bold uppercase tracking-[0.07em]" style={{ color: "var(--text-4)" }}>{k}</span>
    <span className="text-[13.5px]" style={{ color: "var(--text-1)" }}>{v}</span>
  </div>
);

/* ── Tab 3 · analysis ──────────────────────────────────────────────────── */

function AnalysisTab({ t, stats, toolbar }) {
  if (!stats) return <SkeletonBlock className="h-80" />;
  const s = stats;
  const maxCat = Math.max(1, ...s.by_category.map((c) => c.n));
  const maxWorker = Math.max(1, ...s.by_worker.map((w) => w.n));
  const maxTrend = Math.max(1, ...s.trend.map((d) => Math.max(d.filed, d.done)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">{toolbar}</div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(168px,1fr))" }}>
        <Kpi label={t("cellConcerns.kpi.total")} value={s.total} rail="var(--brand)"
             sub={tp(t, "cellConcerns.kpi.workers", { n: s.workers })} />
        <Kpi label={t("cellConcerns.st.todo")} value={s.by_status.todo} rail={ST.todo.color} color={ST.todo.color} />
        <Kpi label={t("cellConcerns.st.doing")} value={s.by_status.doing} rail={ST.doing.color} color={ST.doing.color} />
        <Kpi label={t("cellConcerns.st.done")} value={s.by_status.done} rail={ST.done.color} color={ST.done.color}
             sub={tp(t, "cellConcerns.kpi.pct", { n: s.resolved_pct })} />
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        <Kpi small label={t("cellConcerns.kpi.avgDays")}
             value={s.avg_days == null ? "—" : s.avg_days} sub={t("cellConcerns.kpi.days")} />
        <Kpi small label={t("cellConcerns.kpi.overdue")} value={s.overdue}
             color={s.overdue ? "#ef4444" : undefined} sub={t("cellConcerns.kpi.overdueSub")} />
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(400px,1fr))" }}>
        <Panel icon={LayoutGrid} title={t("cellConcerns.chart.byCategory")}>
          {s.by_category.length === 0 ? <NoData t={t} /> : s.by_category.map((c) => (
            <Bar key={c.key} label={t(`concerns.category.${c.key}`)} n={c.n}
                 pct={(c.n / maxCat) * 100} color={CATEGORY_COLOR[c.key] || "#94a3b8"} />
          ))}
        </Panel>

        <Panel icon={TrendingUp} title={t("cellConcerns.chart.trend")}>
          <Trend data={s.trend} max={maxTrend} />
          <Legend items={[
            [t("cellConcerns.legend.filed"), "#3b82f6"],
            [t("cellConcerns.legend.done"), ST.done.color],
          ]} />
        </Panel>

        <Panel icon={ListChecks} title={t("cellConcerns.chart.byCell")}>
          {s.by_cell.length === 0 ? <NoData t={t} /> : s.by_cell.map((c) => (
            <div key={c.code} className="grid items-center gap-3 mb-3"
                 style={{ gridTemplateColumns: "72px 1fr 44px" }}>
              <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{c.code}</span>
              <span className="h-[22px] flex rounded-md overflow-hidden" style={{ background: "var(--bg-inner)" }}>
                {STATUSES.map((st) => c[st] > 0 && (
                  <span key={st} title={`${t(`cellConcerns.st.${st}`)}: ${c[st]}`}
                        style={{ background: ST[st].color, width: `${(c[st] / c.n) * 100}%` }} />
                ))}
              </span>
              <span className="text-right text-[13px] font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{c.n}</span>
            </div>
          ))}
          <Legend items={STATUSES.map((st) => [t(`cellConcerns.st.${st}`), ST[st].color])} />
        </Panel>

        <Panel icon={Users} title={t("cellConcerns.chart.byWorker")}>
          {s.by_worker.length === 0 ? <NoData t={t} /> : s.by_worker.map((w) => (
            <Bar key={w.name} label={w.name} n={w.n} pct={(w.n / maxWorker) * 100}
                 color="var(--brand)" />
          ))}
          <div className="flex gap-2.5 px-3.5 py-3 mt-4 rounded-xl text-xs leading-relaxed"
               style={{ background: rgba("#eab308", 0.09), border: `1px solid ${rgba("#eab308", 0.25)}`, color: "var(--text-2)" }}>
            <AlertTriangle size={15} style={{ color: "#eab308", flex: "none", marginTop: 1 }} />
            <span>{t("cellConcerns.workerCaveat")}</span>
          </div>
        </Panel>
      </div>
    </div>
  );
}

const Kpi = ({ label, value, sub, rail, color, small }) => (
  <div className="relative rounded-2xl px-5 py-4 overflow-hidden"
       style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
    {rail && <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: rail }} />}
    <div className="text-[10.5px] font-bold uppercase tracking-[0.07em]" style={{ color: "var(--text-3)" }}>{label}</div>
    <div className={small ? "text-lg font-semibold tabular-nums" : "text-3xl font-semibold tabular-nums"}
         style={{ color: color || "var(--text-1)", lineHeight: 1.15 }}>{value}</div>
    {sub && <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>{sub}</div>}
  </div>
);

const Panel = ({ icon, title, children }) => (
  <div className="rounded-2xl overflow-hidden"
       style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
    <SectionHead icon={icon} title={title} />
    <div className="p-5">{children}</div>
  </div>
);

const Bar = ({ label, n, pct, color }) => (
  <div className="grid items-center gap-3 mb-3" style={{ gridTemplateColumns: "116px 1fr 40px" }}>
    <span className="text-xs truncate" style={{ color: "var(--text-2)" }} title={label}>{label}</span>
    <span className="h-[22px] rounded-md overflow-hidden" style={{ background: "var(--bg-inner)" }}>
      <span className="block h-full rounded-md" style={{ background: color, width: `${pct}%` }} />
    </span>
    <span className="text-right text-[13px] font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{n}</span>
  </div>
);

const Legend = ({ items }) => (
  <div className="flex flex-wrap gap-4 mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
    {items.map(([label, color]) => (
      <span key={label} className="inline-flex items-center gap-2 text-xs" style={{ color: "var(--text-3)" }}>
        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} /> {label}
      </span>
    ))}
  </div>
);

const NoData = ({ t }) => (
  <div className="py-8 text-center text-xs" style={{ color: "var(--text-4)" }}>
    {t("cellConcerns.noData")}
  </div>
);

// Small inline trend — two lines on one scale, every gridline naming a value
// the chart actually reaches. Deliberately not ApexCharts: two 14-point series
// need no chart engine, and no engine means no tooltip wrapper to strip.
function Trend({ data, max }) {
  const W = 480, H = 160, L = 26, R = 8, T = 10, B = 22;
  const iw = W - L - R, ih = H - T - B, n = data.length;
  const x = (i) => L + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v) => T + ih - (v / max) * ih;
  const path = (key) => data.map((d, i) => `${i ? "L" : "M"}${x(i)} ${y(d[key])}`).join(" ");
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} role="img" aria-hidden="true">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} y1={y(v)} x2={W - R} y2={y(v)} stroke="var(--border)" strokeWidth="1" />
          <text x={L - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-4)">{v}</text>
        </g>
      ))}
      <path d={path("filed")} fill="none" stroke="#3b82f6" strokeWidth="2.2" strokeLinejoin="round" />
      <path d={path("done")} fill="none" stroke="#22c55e" strokeWidth="2.2" strokeLinejoin="round" />
      {data.length > 0 && (
        <>
          <text x={L} y={H - 6} fontSize="10" fill="var(--text-4)">{data[0].d.slice(5)}</text>
          <text x={W - R} y={H - 6} textAnchor="end" fontSize="10" fill="var(--text-4)">
            {data[data.length - 1].d.slice(5)}
          </text>
        </>
      )}
    </svg>
  );
}
