import { useMemo, useState } from "react";
import { Briefcase, CalendarClock, Clock, CalendarDays, ListTree, Check } from "lucide-react";
import Layout from "../../components/layout/Layout";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import SearchInput from "../../components/ui/SearchInput";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import { SkeletonTable } from "../../components/ui/Skeleton";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import VfxTable from "../../components/verifix/VfxTable";
import { RawPanel } from "../../components/verifix/RawRows";
import { VfxError, AccessNotice, Chip, FetchedAt, RefreshButton } from "../../components/verifix/VfxState";
import { useVfx, vfxError, fill, num, dmy, hm, hmm, C_OK, C_NONE } from "../../components/verifix/vfx";

/* «Lavozim va grafiklar» — Verifix's working vocabulary: jobs (with how many
 * working people hold each), work schedules (and, opened, the days one of
 * them plans), the kinds of time the report counts in, the production
 * calendar and the smaller lists (employment types, labour functions, ranks,
 * positions). Each tab says so when the API role does not open its list. */

const TABS = ["jobs", "schedules", "kinds", "calendar", "more"];
const weekday = (iso) => new Date(`${iso}T12:00:00`).getDay() || 7;     // 1 = Monday … 7 = Sunday

export default function VfxJobs() {
  const { t } = useLang();
  const { tx } = useTranslit();
  const [q, refresh] = useVfx(["jobs"], "/jobs");
  const [tab, setTab] = usePersistentState("vfx_jobs_tab", "jobs");
  const [search, setSearch] = useState("");
  const [sched, setSched] = useState(null);
  const d = q.data;
  const needle = search.trim().toLowerCase();
  const match = (...xs) => !needle || xs.filter(Boolean).join(" ").toLowerCase().includes(needle);

  const jobs = useMemo(() => (d?.jobs || []).filter((j) => match(j.name, tx(j.name), j.code, j.group)), [d, needle]); // eslint-disable-line react-hooks/exhaustive-deps
  const scheds = useMemo(() => (d?.schedules || []).filter((s) => match(s.name, tx(s.name), s.code)), [d, needle]); // eslint-disable-line react-hooks/exhaustive-deps
  const kinds = useMemo(() => (d?.kinds || []).filter((k) => match(k.name, tx(k.name), k.letter, k.digital)), [d, needle]); // eslint-disable-line react-hooks/exhaustive-deps
  const worked = new Set(d?.worked_kinds || []);

  const stateCell = (s) => (s === "A" ? <span style={{ color: "var(--text-2)" }}>{t("vfx.active")}</span>
    : <Chip color={C_NONE}>{t("vfx.passive")}</Chip>);
  const muted = (v) => (v ? v : <span style={{ color: "var(--text-4)" }}>—</span>);

  const jobCols = [
    { key: "name", label: t("vfx.jobs.col.name"), sort: (j) => tx(j.name),
      render: (j) => <span className="font-medium truncate block max-w-[320px]" style={{ color: "var(--text-1)" }}>{tx(j.name)}</span> },
    { key: "group", label: t("vfx.jobs.col.group"), sort: (j) => j.group, render: (j) => muted(tx(j.group)) },
    { key: "code", label: t("vfx.jobs.col.code"), sort: (j) => j.code, render: (j) => <span className="font-mono">{muted(j.code)}</span> },
    { key: "people", label: t("vfx.jobs.col.people"), align: "right", firstDir: "desc", sort: (j) => j.people,
      hint: t("vfx.jobs.col.peopleHint"), render: (j) => (j.people ? num(j.people) : <span style={{ color: "var(--text-4)" }}>0</span>) },
    { key: "state", label: t("vfx.jobs.col.state"), sort: (j) => j.state, render: (j) => stateCell(j.state) },
  ];
  const schedCols = [
    { key: "name", label: t("vfx.jobs.col.sched"), sort: (s) => tx(s.name),
      render: (s) => <span className="font-medium truncate block max-w-[320px]" style={{ color: "var(--text-1)" }}>{tx(s.name)}</span> },
    { key: "kind", label: t("vfx.jobs.col.kind"), sort: (s) => s.kind,
      render: (s) => (s.kind ? t(`vfx.skind.${s.kind}`) : "—") },
    { key: "code", label: t("vfx.jobs.col.code"), sort: (s) => s.code, render: (s) => <span className="font-mono">{muted(s.code)}</span> },
    { key: "people", label: t("vfx.jobs.col.people"), align: "right", firstDir: "desc", sort: (s) => s.people,
      render: (s) => (s.people ? num(s.people) : <span style={{ color: "var(--text-4)" }}>0</span>) },
    { key: "state", label: t("vfx.jobs.col.state"), sort: (s) => s.state, render: (s) => stateCell(s.state) },
  ];
  const kindCols = [
    { key: "letter", label: t("vfx.jobs.col.letter"), sort: (k) => k.letter,
      render: (k) => <span className="font-mono font-semibold">{muted(k.letter)}</span> },
    { key: "name", label: t("vfx.jobs.col.kindName"), sort: (k) => tx(k.name), render: (k) => tx(k.name) },
    { key: "digital", label: t("vfx.jobs.col.digital"), sort: (k) => k.digital, render: (k) => <span className="font-mono">{muted(k.digital)}</span> },
    { key: "worked", label: t("vfx.jobs.col.worked"), sort: (k) => worked.has(k.id), firstDir: "desc", hint: t("vfx.jobs.col.workedHint"),
      render: (k) => (worked.has(k.id) ? <span className="inline-flex items-center gap-1" style={{ color: C_OK }}><Check size={13} />{t("vfx.yes")}</span>
        : <span style={{ color: "var(--text-4)" }}>—</span>) },
    { key: "id", label: "ID", align: "right", sort: (k) => Number(k.id), render: (k) => <span className="font-mono" style={{ color: "var(--text-3)" }}>{k.id}</span> },
  ];

  const toolbar = <SearchInput value={search} onChange={setSearch} placeholder={t("vfx.jobs.search")} className="w-full sm:w-64" />;
  const count = (n) => <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{num(n)}</span>;

  return (
    <Layout title={t("nav.vfx.jobs")}>
      <div className="space-y-4">
        <SegmentedToggle asTabs value={tab} onChange={setTab} options={TABS.map((v) => ({ value: v, label: t(`vfx.jobs.tab.${v}`) }))} />
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-sm flex-1 min-w-[240px] max-w-3xl" style={{ color: "var(--text-2)" }}>{t(`vfx.jobs.lead.${tab}`)}</p>
          {tab !== "more" && <FetchedAt at={d?.fetched_at} />}
          {tab !== "more" && <RefreshButton busy={q.isFetching} onClick={refresh} />}
        </div>

        {tab === "more" ? (
          <div className="space-y-6">
            <RawPanel methodKey="core/fte$list" title={t("vfx.jobs.more.fte")} form="Типы занятости" />
            <RawPanel methodKey="core/labor_function$list" title={t("vfx.jobs.more.labor")} form="Трудовые функции" />
            <RawPanel methodKey="pro/rank$list" title={t("vfx.jobs.more.rank")} form="Ranks" />
            <RawPanel methodKey="pro/robot$list" title={t("vfx.jobs.more.robot")} form="Positions" />
            <RawPanel methodKey="core/dismissal_reason$list" title={t("vfx.jobs.more.dismissal")} form="Причины увольнения" />
          </div>
        ) : q.error ? <VfxError error={vfxError(q.error)} onRetry={() => q.refetch()} /> : tab === "jobs" ? (
          <VfxTable icon={Briefcase} title={t("vfx.jobs.tab.jobs")} right={count(jobs.length)} toolbar={toolbar}
            rows={jobs} columns={jobCols} rowKey={(j) => j.id} loading={!d}
            defaultSort={{ key: "people", dir: "desc" }} sortStoreKey="vfx_jobs_sort" />
        ) : tab === "schedules" ? (
          <VfxTable icon={CalendarClock} title={t("vfx.jobs.tab.schedules")} right={count(scheds.length)} toolbar={toolbar}
            rows={scheds} columns={schedCols} rowKey={(s) => s.id} loading={!d}
            defaultSort={{ key: "people", dir: "desc" }} sortStoreKey="vfx_sched_sort"
            onRowClick={(s) => setSched(s)} />
        ) : tab === "kinds" ? (
          <VfxTable icon={Clock} title={t("vfx.jobs.tab.kinds")} right={count(kinds.length)} toolbar={toolbar}
            rows={kinds} columns={kindCols} rowKey={(k) => k.id} loading={!d}
            defaultSort={{ key: "letter", dir: "asc" }} />
        ) : (
          <CalendarTab d={d} />
        )}
      </div>
      {sched && <ScheduleModal s={sched} onClose={() => setSched(null)} />}
    </Layout>
  );
}

function CalendarTab({ d }) {
  const { t } = useLang();
  const { tx } = useTranslit();
  if (!d) return <SkeletonTable rows={6} cols={4} />;
  if (d.calendar_error) return <AccessNotice error={d.calendar_error} form="Производственные календари" />;
  if (!d.calendar?.length) return <p className="text-sm" style={{ color: "var(--text-3)" }}>{t("vfx.jobs.calEmpty")}</p>;
  return (
    <div className="space-y-4">
      {d.calendar.map((c) => (
        <div key={c.id} className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="px-4 py-3 flex items-center gap-3 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
            <CalendarDays size={16} style={{ color: "var(--brand-text)" }} />
            <span className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>{tx(c.name)} · {d.year}</span>
            <span className="text-xs" style={{ color: "var(--text-3)" }}>
              {t("vfx.jobs.restDays")}: {c.rest.length ? c.rest.map((n) => t(`vfx.wd.${n}`)).join(", ") : "—"}
            </span>
          </div>
          {c.days.length ? (
            <table className="w-full text-xs">
              <tbody>
                {c.days.map((x) => (
                  <tr key={`${x.date}-${x.kind}`} className="border-t first:border-t-0 border-[var(--border)]">
                    <td className="px-4 py-1.5 tabular-nums w-32">{dmy(x.date)} <span style={{ color: "var(--text-4)" }}>{x.date ? t(`vfx.wd.${weekday(x.date)}`) : ""}</span></td>
                    <td className="px-3 py-1.5">{tx(x.name) || "—"}</td>
                    <td className="px-3 py-1.5" style={{ color: "var(--text-2)" }}>{x.kind ? t(`vfx.cday.${x.kind}`) : "—"}</td>
                    <td className="px-3 py-1.5 tabular-nums" style={{ color: "var(--text-3)" }}>{x.swapped ? fill(t("vfx.jobs.swapped"), { d: dmy(x.swapped) }) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>{t("vfx.jobs.calNoDays")}</p>}
        </div>
      ))}
    </div>
  );
}

function ScheduleModal({ s, onClose }) {
  const { t } = useLang();
  const { tx } = useTranslit();
  const [q] = useVfx(["schedule", s.id], `/schedules/${s.id}/days`);
  const d = q.data;
  return (
    <Modal onClose={onClose} title={tx(s.name)} icon={CalendarClock} maxWidth="max-w-2xl"
      subtitle={[s.kind ? t(`vfx.skind.${s.kind}`) : null, fill(t("vfx.jobs.peopleN"), { n: num(s.people) })].filter(Boolean).join(" · ")}
      footer={<Button variant="secondary" onClick={onClose}>{t("vfx.close")}</Button>}>
      {q.error ? <VfxError error={vfxError(q.error)} onRetry={() => q.refetch()} /> : !d ? <SkeletonTable rows={6} cols={4} /> : (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            <span style={{ color: "var(--text-3)" }}>{fill(t("vfx.jobs.yearCounts"), { y: d.year })}</span>
            {Object.entries(d.counts).map(([k, n]) => (
              <Chip key={k} color={k === "W" ? C_OK : C_NONE}>{t(`vfx.day.${k}`)} · {num(n)}</Chip>
            ))}
            {!Object.keys(d.counts).length && <span style={{ color: "var(--text-3)" }}>{t("vfx.jobs.noDays")}</span>}
          </div>
          {d.days.length > 0 && (
            <div className="overflow-auto rounded-xl" style={{ border: "1px solid var(--border)", maxHeight: "50vh" }}>
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr style={{ color: "var(--text-3)" }}>
                    {["date", "kind", "time", "plan", "break"].map((k) => (
                      <th key={k} className="px-3 py-2 text-left font-semibold sticky top-0" style={{ background: "var(--bg-inner)" }}>{t(`vfx.jobs.d.${k}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.days.map((x) => (
                    <tr key={x.date} className="border-t border-[var(--border)]"
                      style={x.date === d.today ? { background: "rgba(var(--brand-rgb), 0.08)" } : undefined}>
                      <td className="px-3 py-1.5 tabular-nums">{dmy(x.date)} <span style={{ color: "var(--text-4)" }}>{t(`vfx.wd.${weekday(x.date)}`)}</span>
                        {x.date === d.today && <span className="ml-1.5 text-[11px] font-semibold" style={{ color: "var(--brand-text)" }}>{t("vfx.today")}</span>}</td>
                      <td className="px-3 py-1.5" style={{ color: x.kind === "W" ? "var(--text-1)" : "var(--text-3)" }}>{x.kind ? t(`vfx.day.${x.kind}`) : "—"}</td>
                      <td className="px-3 py-1.5 tabular-nums">{x.begin ? `${hm(x.begin)}–${hm(x.end)}` : "—"}</td>
                      <td className="px-3 py-1.5 tabular-nums">{x.plan ? hmm(x.plan / 60) : "—"}</td>
                      <td className="px-3 py-1.5 tabular-nums" style={{ color: "var(--text-3)" }}>{x.break?.[0] ? `${hm(x.break[0])}–${hm(x.break[1])}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
