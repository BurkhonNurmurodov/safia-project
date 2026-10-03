import { useMemo, useState } from "react";
import {
  Banknote, TrendingUp, Users, FileSpreadsheet, BookText, Receipt, Wallet, Landmark, Timer, MapPin, Coins, CircleDot,
  ArrowUpRight, ArrowDownRight, Percent, ListOrdered, BadgeCheck,
} from "lucide-react";
import Layout from "../../components/layout/Layout";
import KPICard from "../../components/ui/KPICard";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import SearchInput from "../../components/ui/SearchInput";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import StyledSelect from "../../components/ui/StyledSelect";
import { FilterPanel } from "../../components/ui/ColumnFilter";
import { SkeletonTable } from "../../components/ui/Skeleton";
import { localISO } from "../../components/ui/DateRangePicker";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import VfxTable from "../../components/verifix/VfxTable";
import PersonCard from "../../components/verifix/PersonCard";
import { VfxError, FetchedAt, RefreshButton, Chip, StatusDot } from "../../components/verifix/VfxState";
import { useVfx, vfxError, fill, num, dmy, hm } from "../../components/verifix/vfx";
import {
  RangePicker, SectionNote, SourceNote, Who, Node, Posted, Muted, GenericTable,
} from "../../components/verifix/registers";
import {
  useRegister, useRange, pickSection, monthLabel, span, money, sk, dash, C_OK, C_BAD, C_NONE,
} from "../../components/verifix/registerKit";

/* «Ish haqi» — what Verifix keeps about pay (the operator opened wages on
 * 2026-10-03): salary changes, pay sheets, accrual books, one-time charges,
 * payments, the bank accounts pay goes to, and two reports (pay earned by the
 * clock, expenses by location). Every amount is Verifix's own; nothing is
 * recomputed. Card and account numbers arrive as their last four digits. */

const TABS = ["wages", "sheets", "book", "charges", "payments", "accounts", "bytime", "expenses"];
const REPORTS = new Set(["bytime", "expenses"]);
const WITH_DOC = new Set(["sheets", "book", "charges", "payments", "bytime"]);
const FORMS = {
  wages: "Изменение оплаты труда", sheets: "Расчет оклада", book: "Книга начисления заработной платы API",
  charges: "Разовые начисления", payments: "Ведомость", accounts: "Список расчетных счетов сотрудников",
  bytime: "Зарплаты по временным интервалам", expenses: "Расходы по локациям",
};
const ICONS = {
  wages: TrendingUp, sheets: FileSpreadsheet, book: BookText, charges: Receipt, payments: Wallet,
  accounts: Landmark, bytime: Timer, expenses: MapPin,
};

const shortNum = (n) => String(n || "").replace(/^0+/, "") || n || "—";
const hours = (h) => (h == null ? "—" : (Math.round(h * 10) / 10).toLocaleString("ru-RU"));

function useOperKind() {
  const { t } = useLang();
  return (k) => (k === "A" ? t("vfx.pay.kind.A") : k === "D" ? t("vfx.pay.kind.D") : k || "—");
}

/** A sum over rows — only when they are all in one currency. */
function sumIn(rows, key, curOf = (r) => r.currency) {
  const curs = new Set(rows.map(curOf).filter(Boolean));
  if (curs.size > 1) return { value: null, cur: null, mixed: curs.size };
  const vals = rows.map((r) => r[key]).filter((v) => v != null);
  return { value: vals.length ? vals.reduce((a, v) => a + v, 0) : null, cur: [...curs][0] || null, mixed: 0 };
}

export default function VfxPayroll() {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const today = localISO(new Date());
  const [tab, setTab] = usePersistentState("vfx_pay_tab", "wages");
  const [from, to, setFrom, setTo] = useRange("vfx_pay", 365);
  const [rFrom, setRFrom] = usePersistentState("vfx_payr_from", `${today.slice(0, 8)}01`);
  const [rTo, setRTo] = usePersistentState("vfx_payr_to", today);
  const report = REPORTS.has(tab);
  // «Pay by time» is read one location at a time (the plant-wide report is
  // tens of megabytes); the busiest location opens by default.
  const [locsQ] = useVfx(["locations"], "/locations", null, { enabled: report });
  const locs = locsQ.data?.rows || [];
  const [locPick, setLocPick] = usePersistentState("vfx_pay_loc", "");
  const loc = (locPick && locs.some((l) => l.id === locPick) ? locPick : "") || (tab === "bytime" ? locsQ.data?.default_id || "" : "");
  const range = report ? { begin: rFrom, end: rTo, ...(loc ? { loc } : {}) } : { begin: from, end: to };
  const [q, refresh] = useRegister(["payroll", tab], "/payroll", tab === "accounts" ? { tab } : { tab, ...range });
  const d = q.data;
  const [search, setSearch] = useState("");
  const [posted, setPosted] = usePersistentState("vfx_pay_posted", "all");
  const [doc, setDoc] = useState(null);
  const [open, setOpen] = useState(null);
  const operKind = useOperKind();

  const all = useMemo(() => d?.rows || [], [d]);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return all.filter((r) => (posted === "all" || r.posted == null || (posted === "yes") === !!r.posted)
      && (!needle || JSON.stringify(r).toLowerCase().includes(needle)
        || (r.name && tl(r.name).toLowerCase().includes(needle))));
  }, [all, posted, search, tl]);

  const hasPosted = all.some((r) => r.posted != null);
  const sections = hasPosted ? [pickSection({ key: "posted", icon: BadgeCheck, label: t("vfx.r.posted"), value: posted, set: setPosted,
    opts: [["all", t("vfx.all")], ["yes", t("vfx.r.posted")], ["no", t("vfx.r.draft")]] })] : [];

  const moneyKpi = (s) => (s.mixed ? "—" : money(s.value));
  const curSub = (s) => (s.mixed ? fill(t("vfx.pay.mixed"), { n: s.mixed }) : s.cur ? tx(s.cur) : null);

  // ── per-tab headline numbers ──
  let kpis = [];
  if (d) {
    if (tab === "wages") {
      const people = new Set(rows.map((r) => r.emp || r.name)).size;
      const amounts = rows.map((r) => r.amount).filter((v) => v != null).sort((a, b) => a - b);
      const median = amounts.length ? amounts[Math.floor(amounts.length / 2)] : null;
      const raised = rows.filter((r) => r.prev != null && r.amount != null && r.amount > r.prev).length;
      kpis = [[t("vfx.pay.k.changes"), num(rows.length), TrendingUp], [t("vfx.pay.k.people"), num(people), Users],
        [t("vfx.pay.k.median"), money(median), Coins, t("vfx.pay.k.medianHint")], [t("vfx.pay.k.raised"), num(raised), ArrowUpRight, t("vfx.pay.k.raisedHint")]];
    } else if (tab === "sheets") {
      kpis = [[t("vfx.pay.k.docs"), num(rows.length), FileSpreadsheet],
        [t("vfx.pay.k.accrued"), money(rows.reduce((a, r) => a + (r.accrual || 0), 0)), Coins],
        [t("vfx.pay.k.penalty"), money(rows.reduce((a, r) => a + (r.penalty || 0), 0)), ArrowDownRight],
        [t("vfx.pay.k.total"), money(rows.reduce((a, r) => a + (r.total || 0), 0)), Banknote]];
    } else if (tab === "book") {
      const acc = sumIn(rows, "accrued");
      const ded = sumIn(rows, "deducted");
      const tax = sumIn(rows.map((r) => ({ ...r, tax: (r.income_tax || 0) + (r.pension || 0) + (r.social || 0) })), "tax");
      kpis = [[t("vfx.pay.k.docs"), num(rows.length), BookText], [t("vfx.pay.k.accrued"), moneyKpi(acc), Coins, null, curSub(acc)],
        [t("vfx.pay.k.deducted"), moneyKpi(ded), ArrowDownRight, null, curSub(ded)], [t("vfx.pay.k.taxes"), moneyKpi(tax), Percent, t("vfx.pay.k.taxesHint"), curSub(tax)]];
    } else if (tab === "charges") {
      const tot = sumIn(rows, "total");
      kpis = [[t("vfx.pay.k.docs"), num(rows.length), Receipt], [t("vfx.pay.k.total"), moneyKpi(tot), Banknote, null, curSub(tot)],
        [t("vfx.pay.k.lines"), num(rows.reduce((a, r) => a + (r.lines || 0), 0)), ListOrdered],
        [t("vfx.r.posted"), num(rows.filter((r) => r.posted).length), BadgeCheck]];
    } else if (tab === "payments") {
      const paid = sumIn(rows, "paid");
      const unpaid = sumIn(rows, "unpaid");
      kpis = [[t("vfx.pay.k.docs"), num(rows.length), Wallet], [t("vfx.pay.k.paid"), moneyKpi(paid), Banknote, null, curSub(paid)],
        [t("vfx.pay.k.unpaid"), moneyKpi(unpaid), ArrowDownRight, null, curSub(unpaid)],
        [t("vfx.pay.k.people"), num(rows.reduce((a, r) => a + (r.people || 0), 0)), Users]];
    } else if (tab === "accounts") {
      kpis = [[t("vfx.pay.k.accounts"), num(rows.length), Landmark], [t("vfx.pay.k.people"), num(new Set(rows.map((r) => r.emp || r.name)).size), Users],
        [t("vfx.pay.k.banks"), num(new Set(rows.map((r) => r.bank).filter(Boolean)).size), Landmark], [t("vfx.pay.k.main"), num(rows.filter((r) => r.main).length), BadgeCheck]];
    } else if (tab === "bytime") {
      kpis = [[t("vfx.pay.k.people"), num(rows.length), Users], [t("vfx.pay.k.worked"), hours(rows.reduce((a, r) => a + (r.work_h || 0), 0)), Timer],
        [t("vfx.pay.k.overtime"), hours(rows.reduce((a, r) => a + (r.over_h || 0), 0)), ArrowUpRight],
        [t("vfx.pay.k.earned"), money(rows.reduce((a, r) => a + (r.earned || 0), 0)), Banknote, t("vfx.pay.k.earnedHint")]];
    } else {
      kpis = [[t("vfx.pay.k.rows"), num(rows.length), ListOrdered]];
    }
  }

  const docCol = (label = t("vfx.pay.col.doc")) => ({ key: "num", label, firstDir: "desc", sort: (r) => r.date,
    render: (r) => (
      <div>
        <div className="font-medium tabular-nums" style={{ color: "var(--text-1)" }}>№{shortNum(r.num)}</div>
        <div className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{r.date ? dmy(r.date) : ""}</div>
      </div>
    ) });
  const amount = (key, label, hint) => ({ key, label, align: "right", firstDir: "desc", sort: (r) => r[key], hint,
    render: (r) => (r[key] != null ? money(r[key]) : dash) });
  const postedCol = { key: "posted", label: t("vfx.r.status"), sort: (r) => r.posted, render: (r) => <Posted v={r.posted} /> };
  const who = { key: "who", label: t("vfx.r.person"), sort: (r) => tl(r.name || d?.people?.[r.emp]?.name || ""),
    render: (r) => <Who id={r.emp} name={r.name} staff={r.staff} frame={d} /> };
  const COLS = {
    wages: [
      { key: "date", label: t("vfx.r.date"), firstDir: "desc", sort: (r) => r.date,
        render: (r) => <span className="text-xs tabular-nums">{r.date ? dmy(r.date) : "—"}</span> },
      who, amount("amount", t("vfx.pay.col.amount")),
      amount("prev", t("vfx.pay.col.prev"), t("vfx.pay.col.prevHint")),
      { key: "delta", label: t("vfx.pay.col.delta"), align: "right", firstDir: "desc",
        sort: (r) => (r.prev && r.amount != null ? (r.amount - r.prev) / r.prev : null),
        render: (r) => {
          if (!r.prev || r.amount == null) return dash;
          const dlt = r.amount - r.prev;
          const p = Math.round((dlt / r.prev) * 100);
          return <span className="tabular-nums whitespace-nowrap" style={{ color: dlt > 0 ? C_OK : dlt < 0 ? C_BAD : "var(--text-3)" }}>
            {dlt > 0 ? "+" : ""}{money(dlt)} <span className="text-[11px]">{dlt > 0 ? "+" : ""}{p}%</span></span>;
        } },
      { key: "type", label: t("vfx.pay.col.type"), sort: (r) => r.type,
        render: (r) => (r.type ? <Chip color="#64748b" mono title={t("vfx.pay.col.typeHint")}>{r.type}</Chip> : dash) },
    ],
    sheets: [docCol(), { key: "month", label: t("vfx.tb.col.month"), sort: (r) => r.month, render: (r) => monthLabel(t, r.month) },
      { key: "period", label: t("vfx.r.period"), sort: (r) => r.begin, render: (r) => <span className="text-xs tabular-nums whitespace-nowrap">{span(r.begin, r.end)}</span> },
      { key: "people", label: t("vfx.tb.col.people"), align: "right", sort: (r) => r.people, render: (r) => num(r.people) },
      amount("accrual", t("vfx.pay.col.accrual")), amount("penalty", t("vfx.pay.col.penalty")), amount("total", t("vfx.pay.col.total")), postedCol],
    book: [docCol(), { key: "month", label: t("vfx.tb.col.month"), sort: (r) => r.month, render: (r) => monthLabel(t, r.month) },
      { key: "type", label: t("vfx.pay.col.bookType"), sort: (r) => r.type, render: (r) => <Muted max={200}>{tx(r.type || r.name || "")}</Muted> },
      { key: "cur", label: t("vfx.pay.col.currency"), sort: (r) => r.currency, render: (r) => <Muted max={120}>{tx(r.currency || "")}</Muted> },
      amount("accrued", t("vfx.pay.col.accrued")), amount("deducted", t("vfx.pay.col.deducted")),
      { key: "tax", label: t("vfx.pay.col.taxes"), align: "right", hint: t("vfx.pay.k.taxesHint"),
        sort: (r) => (r.income_tax || 0) + (r.pension || 0) + (r.social || 0),
        render: (r) => money((r.income_tax || 0) + (r.pension || 0) + (r.social || 0)) },
      { key: "lines", label: t("vfx.pay.col.lines"), align: "right", sort: (r) => r.lines,
        render: (r) => <span className="tabular-nums">{num(r.lines)}<span className="text-[11px] ml-1" style={{ color: "var(--text-3)" }}>{fill(t("vfx.pay.peopleN"), { n: num(r.people) })}</span></span> },
      postedCol],
    charges: [docCol(), { key: "name", label: t("vfx.pay.col.name"), sort: (r) => r.name, render: (r) => <Muted max={200}>{r.name || r.base}</Muted> },
      { key: "kind", label: t("vfx.pay.col.kind"), sort: (r) => r.kind, render: (r) => <span className="text-xs">{operKind(r.kind)}</span> },
      { key: "month", label: t("vfx.tb.col.month"), sort: (r) => r.month, render: (r) => monthLabel(t, r.month) },
      { key: "cur", label: t("vfx.pay.col.currency"), sort: (r) => r.currency, render: (r) => <Muted max={120}>{tx(r.currency || "")}</Muted> },
      { key: "lines", label: t("vfx.pay.col.lines"), align: "right", sort: (r) => r.lines, render: (r) => num(r.lines) },
      amount("total", t("vfx.pay.col.total")), postedCol],
    payments: [docCol(),
      { key: "via", label: t("vfx.pay.col.via"), sort: (r) => r.via?.cashbox || r.via?.account,
        render: (r) => (r.via?.cashbox ? <span className="text-xs">{fill(t("vfx.pay.viaCash"), { n: tx(r.via.cashbox) })}</span>
          : r.via?.account ? <span className="text-xs font-mono">{r.via.account}</span> : dash) },
      { key: "cur", label: t("vfx.pay.col.currency"), sort: (r) => r.currency, render: (r) => <Muted max={120}>{tx(r.currency || "")}</Muted> },
      { key: "people", label: t("vfx.tb.col.people"), align: "right", sort: (r) => r.people, render: (r) => num(r.people) },
      amount("paid", t("vfx.pay.col.paid")), amount("unpaid", t("vfx.pay.col.unpaid")),
      { key: "status", label: t("vfx.r.status"), sort: (r) => r.status,
        render: (r) => (r.status ? <Chip color="#64748b" mono title={t("vfx.sh.statusHint")}>{r.status}</Chip> : dash) }],
    accounts: [who,
      { key: "bank", label: t("vfx.pay.col.bank"), sort: (r) => r.bank,
        render: (r) => (
          <div className="min-w-0 max-w-[240px]">
            <div className="truncate text-xs">{tx(r.bank || "") || "—"}</div>
            {r.mfo && <div className="text-[11px] font-mono" style={{ color: "var(--text-3)" }}>{fill(t("vfx.pay.mfo"), { n: r.mfo })}</div>}
          </div>
        ) },
      { key: "account", label: t("vfx.pay.col.account"), sort: (r) => r.account, render: (r) => (r.account ? <span className="font-mono text-xs">{r.account}</span> : dash) },
      { key: "card", label: t("vfx.pay.col.card"), sort: (r) => r.card, render: (r) => (r.card ? <span className="font-mono text-xs">{r.card}</span> : dash) },
      { key: "cur", label: t("vfx.pay.col.currency"), sort: (r) => r.currency, render: (r) => <Muted max={120}>{tx(r.currency || "")}</Muted> },
      { key: "main", label: t("vfx.pay.col.main"), sort: (r) => r.main, render: (r) => (r.main ? <StatusDot color={C_OK} label={t("vfx.yes")} /> : dash) },
      { key: "state", label: t("vfx.r.status"), sort: (r) => r.state,
        render: (r) => <StatusDot color={r.state === "A" ? C_OK : C_NONE} label={t(r.state === "A" ? "vfx.active" : "vfx.passive")} /> }],
    bytime: [who,
      { key: "days", label: t("vfx.pay.col.days"), align: "right", sort: (r) => r.days, render: (r) => num(r.days) },
      { key: "plan", label: t("vfx.pay.col.planH"), align: "right", sort: (r) => r.plan_h, render: (r) => hours(r.plan_h) },
      { key: "work", label: t("vfx.pay.col.workH"), align: "right", firstDir: "desc", sort: (r) => r.work_h, render: (r) => hours(r.work_h) },
      { key: "over", label: t("vfx.pay.col.overH"), align: "right", firstDir: "desc", sort: (r) => r.over_h, render: (r) => (r.over_h ? hours(r.over_h) : dash) },
      amount("earned", t("vfx.pay.col.earned"), t("vfx.pay.k.earnedHint")), amount("rate", t("vfx.pay.col.rate"), t("vfx.pay.col.rateHint"))],
  };

  return (
    <Layout title={t("nav.vfx.payroll")}>
      <div className="space-y-4">
        <SegmentedToggle asTabs value={tab} onChange={(v) => { setTab(v); setSearch(""); }}
          options={TABS.map((k) => ({ value: k, label: t(`vfx.pay.tab.${k}`) }))} />
        <div className="flex items-center gap-2 flex-wrap">
          {tab !== "accounts" && (report
            ? <RangePicker from={rFrom} to={rTo} setFrom={setRFrom} setTo={setRTo} max={today} />
            : <RangePicker from={from} to={to} setFrom={setFrom} setTo={setTo} max={today} />)}
          {report && (
            <StyledSelect value={loc} onChange={setLocPick} searchable placeholder={t(tab === "bytime" ? "vfx.os.pick" : "vfx.pay.allLocs")}
              className="w-full sm:w-72" triggerClassName="px-3 py-2 text-sm min-h-[38px]"
              options={[...(tab === "expenses" ? [{ value: "", label: t("vfx.pay.allLocs") }] : []),
                ...locs.map((l) => ({ value: l.id, label: `${tx(l.name)} · ${num(l.working)}`, title: tx(l.name) }))]} />
          )}
          <p className="text-sm flex-1 min-w-[200px] max-w-2xl" style={{ color: "var(--text-2)" }}>{t(`vfx.pay.lead.${tab}`)}</p>
          <FetchedAt at={d?.section?.at} today={d?.today} />
          <RefreshButton busy={q.isFetching || !!d?.loading} onClick={refresh} />
        </div>

        {q.error ? <VfxError error={vfxError(q.error)} onRetry={() => q.refetch()} /> : (
          <>
            {kpis.length > 1 || !d ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {(d ? kpis : [0, 1, 2, 3].map(() => ["", sk, CircleDot])).map(([label, value, Icon, tip, sub], i) => (
                  <KPICard key={i} label={label} icon={Icon} value={value} tooltip={tip || undefined} sub={sub || null} />
                ))}
              </div>
            ) : null}
            <div className="flex items-start gap-3 flex-wrap justify-between">
              <div className="flex-1 min-w-[240px]">
                <SectionNote s={d?.section} form={FORMS[tab]} />
                {d?.need_loc && <p className="text-xs px-1" style={{ color: "var(--text-3)" }}>{t("vfx.pay.needLoc")}</p>}
              </div>
              {d?.section && !d.section.error && <SourceNote s={d.section} />}
            </div>

            {d?.generic ? (
              <GenericTable icon={ICONS[tab]} title={t(`vfx.pay.tab.${tab}`)} rows={rows} loading={q.isLoading}
                right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{num(rows.length)}</span>}
                toolbar={<SearchInput value={search} onChange={setSearch} placeholder={t("vfx.pay.search")} className="w-full sm:w-64" />}
                empty={all.length ? t("vfx.noMatch") : t("vfx.pay.empty")} />
            ) : (
              <VfxTable key={tab} icon={ICONS[tab]} title={t(`vfx.pay.tab.${tab}`)}
                right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{num(rows.length)}</span>}
                toolbar={<>
                  <SearchInput value={search} onChange={setSearch} placeholder={t("vfx.pay.search")} className="w-full sm:w-64" />
                  {sections.length > 0 && <FilterPanel sections={sections} />}
                </>}
                rows={rows} columns={COLS[tab] || []} rowKey={(r) => r.id || `${r.emp}:${r.date}:${r.amount}`} loading={q.isLoading}
                defaultSort={tab === "bytime" ? { key: "earned", dir: "desc" } : tab === "accounts" ? { key: "who", dir: "asc" }
                  : tab === "wages" ? { key: "date", dir: "desc" } : { key: "num", dir: "desc" }}
                empty={all.length ? t("vfx.noMatch") : t("vfx.pay.empty")}
                onRowClick={(r) => (WITH_DOC.has(tab) ? setDoc(tab === "bytime" ? r.emp : r.id) : r.emp && setOpen(r.emp))} />
            )}
          </>
        )}
      </div>
      {doc && <DocModal tab={tab} id={doc} range={range} onClose={() => setDoc(null)} />}
      {open && <PersonCard id={open} onClose={() => setOpen(null)} />}
    </Layout>
  );
}

function DocModal({ tab, id, range, onClose }) {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const [q] = useRegister(["payroll", tab, "doc", id], "/payroll", { tab, ...range, doc: id });
  const d = q.data;
  const det = d?.detail;
  const lineRows = useMemo(() => {
    const src = tab === "sheets" ? det?.parts : tab === "bytime" ? det?.days : det?.lines;
    return (src || []).map((r, i) => ({ ...r, __i: i }));
  }, [det, tab]);
  const [person, setPerson] = useState(null);
  const operKind = useOperKind();
  const h = det?.head;
  const amount = (key, label) => ({ key, label, align: "right", firstDir: "desc", sort: (r) => r[key], render: (r) => (r[key] != null ? money(r[key]) : dash) });
  const who = { key: "who", label: t("vfx.r.person"), sort: (r) => tl(r.name || d?.people?.[r.emp]?.name || ""),
    render: (r) => <Who id={r.emp} name={r.name} staff={r.staff} frame={d} /> };
  const LINES = {
    sheets: { rows: det?.parts, cols: [who,
      { key: "period", label: t("vfx.r.period"), sort: (r) => r.begin, render: (r) => <span className="text-xs tabular-nums whitespace-nowrap">{span(r.begin, r.end)}</span> },
      { key: "div", label: t("vfx.hr.col.where"), sort: (r) => r.div_name, render: (r) => <Node id={r.div} name={r.div_name} frame={d} /> },
      { key: "job", label: t("vfx.hr.col.job"), sort: (r) => r.job, render: (r) => <Muted max={180}>{tx(r.job || "")}</Muted> },
      amount("accrual", t("vfx.pay.col.accrual")), amount("penalty", t("vfx.pay.col.penalty")), amount("total", t("vfx.pay.col.total"))] },
    book: { rows: det?.lines, cols: [who,
      { key: "oper", label: t("vfx.pay.col.oper"), sort: (r) => r.oper, render: (r) => <Muted max={220}>{tx(r.oper || "")}</Muted> },
      { key: "kind", label: t("vfx.pay.col.kind"), sort: (r) => r.kind, render: (r) => <span className="text-xs">{operKind(r.kind)}</span> },
      { key: "div", label: t("vfx.hr.col.where"), sort: (r) => r.div, render: (r) => <Node id={r.div} frame={d} /> },
      amount("amount", t("vfx.pay.col.amount")), amount("net", t("vfx.pay.col.net")),
      { key: "tax", label: t("vfx.pay.col.taxes"), align: "right", sort: (r) => (r.income_tax || 0) + (r.pension || 0) + (r.social || 0),
        render: (r) => money((r.income_tax || 0) + (r.pension || 0) + (r.social || 0)) }] },
    charges: { rows: det?.lines, cols: [who,
      { key: "oper", label: t("vfx.pay.col.oper"), sort: (r) => r.oper, render: (r) => <Muted max={240}>{tx(r.oper || "")}</Muted> },
      amount("amount", t("vfx.pay.col.amount")),
      { key: "note", label: t("vfx.r.note"), sort: (r) => r.note, render: (r) => <Muted max={240}>{r.note}</Muted> }] },
    payments: { rows: det?.lines, cols: [who, amount("pay", t("vfx.pay.col.pay")), amount("limit", t("vfx.pay.col.limit")),
      { key: "card", label: t("vfx.pay.col.card"), sort: (r) => r.card, render: (r) => (r.card ? <span className="font-mono text-xs">{r.card}</span> : dash) },
      { key: "account", label: t("vfx.pay.col.account"), sort: (r) => r.account, render: (r) => (r.account ? <span className="font-mono text-xs">{r.account}</span> : dash) },
      { key: "note", label: t("vfx.r.note"), sort: (r) => r.note, render: (r) => <Muted max={200}>{r.note}</Muted> }] },
    bytime: { rows: det?.days, cols: [
      { key: "date", label: t("vfx.r.date"), sort: (r) => r.date, render: (r) => <span className="text-xs tabular-nums">{r.date ? dmy(r.date) : "—"}</span> },
      { key: "kind", label: t("vfx.pay.col.dayKind"), sort: (r) => r.kind, render: (r) => <Muted max={140}>{tx(r.kind_name || "") || r.kind}</Muted> },
      { key: "plan", label: t("vfx.pay.col.planH"), align: "right", sort: (r) => r.plan_sec, render: (r) => hours((r.plan_sec || 0) / 3600) },
      { key: "work", label: t("vfx.pay.col.workH"), align: "right", sort: (r) => r.sec, render: (r) => (r.sec ? hours(r.sec / 3600) : dash) },
      { key: "over", label: t("vfx.pay.col.overH"), align: "right", sort: (r) => r.over_sec, render: (r) => (r.over_sec ? hours(r.over_sec / 3600) : dash) },
      amount("earned", t("vfx.pay.col.earned")),
      { key: "iv", label: t("vfx.pay.col.intervals"),
        render: (r) => (r.intervals?.length ? (
          <div className="flex flex-col gap-0.5 text-[11px] tabular-nums" style={{ color: "var(--text-2)" }}>
            {r.intervals.slice(0, 4).map((i, k) => (
              <span key={k} className="whitespace-nowrap">{hm(i.in)}–{hm(i.out)}{i.in_loc ? ` · ${tx(i.in_loc)}` : ""}</span>
            ))}
          </div>
        ) : dash) }] },
  }[tab];
  const title = tab === "bytime"
    ? tl(h?.name || "") || t("vfx.loading")
    : h ? fill(t("vfx.pay.docTitle"), { n: shortNum(h.num) }) : t("vfx.loading");
  const subtitle = !h ? null : tab === "bytime" ? fill(t("vfx.pay.bytimeSub"), { h: hours(h.work_h), e: money(h.earned) })
    : [h.date && dmy(h.date), h.month && monthLabel(t, h.month), h.type && tx(h.type), h.currency && tx(h.currency)].filter(Boolean).join(" · ");
  return (
    <Modal onClose={onClose} icon={ICONS[tab]} maxWidth="max-w-5xl" title={title} subtitle={subtitle}
      footer={<>
        {tab === "bytime" && h?.emp && <Button variant="secondary" onClick={() => setPerson(h.emp)}>{t("vfx.ts.d.person")}</Button>}
        <Button variant="secondary" onClick={onClose}>{t("vfx.close")}</Button>
      </>}>
      {q.error ? <VfxError error={vfxError(q.error)} onRetry={() => q.refetch()} />
        : !d || (!det && d.loading) ? <SkeletonTable rows={6} cols={5} />
        : !det ? (d.detail_section?.error
          ? <SectionNote s={d.detail_section} form={FORMS[tab]} />
          : <p className="text-xs py-6 text-center" style={{ color: "var(--text-3)" }}>{t("vfx.pay.docGone")}</p>)
        : (
          <VfxTable icon={ListOrdered} title={t(tab === "bytime" ? "vfx.pay.days" : "vfx.pay.lines")} rows={lineRows}
            columns={LINES.cols} rowKey={(r) => r.__i}
            maxHeight="55vh" pageSize={100} defaultSort={{ key: tab === "bytime" ? "date" : "who", dir: "asc" }}
            onRowClick={tab === "bytime" ? undefined : (r) => r.emp && setPerson(r.emp)} />
        )}
      {person && <PersonCard id={person} onClose={() => setPerson(null)} zIndex={60} />}
    </Modal>
  );
}
