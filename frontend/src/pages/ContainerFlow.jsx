import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check, ClipboardList, Clock, History, PackageCheck, PackagePlus, PencilLine, Settings2, Truck,
  Undo2, UsersRound, XCircle, Lock, Scale,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import DayStepper from "../components/ui/DayStepper";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import FormField from "../components/ui/FormField";
import CountStepper from "../components/ui/CountStepper";
import ActionMenu from "../components/ui/ActionMenu";
import EmptyState from "../components/ui/EmptyState";
import TableCard, { Th } from "../components/ui/DataTable";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { tashkentNow, prevISO } from "../components/production/HourlyContainers";
import {
  KEYS, span, hhmm, sum, fmt, errText, Chip, StatusChip, KindChip, TeamLabel, ReasonFields, reasonOk,
  byHour, lineOf, fieldCls, fieldStyle,
} from "../components/containers/flowUtil";
import FlowReport from "../components/containers/FlowReport";
import FlowSettings from "../components/containers/FlowSettings";
import { RequestsTab, NewRequestModal } from "../components/containers/FlowRequests";
import { usePersistentState } from "../hooks/usePersistentState";
import { useLang } from "../context/LangContext";
import { useAuth } from "../context/AuthContext";
import { useTranslit } from "../utils/transliterate";
import api from "../utils/api";

// «Konteyner berish» (/containers/flow, 2026-11-14): every container a team
// works with comes from AXO, an hour before the hour that needs it. The
// platform drafts each enrolled unit's batch two hours ahead with the need
// FROZEN on it; AXO issues the hour, Logistics confirms it at the unit, the
// platform splits it between the unit's teams and each leader accepts a share.
// docs/containers-flow.md. Nothing here messages the floor.
//
// Who sees what comes from the server (`/settings` → admin / axo / logistics):
// `container-flow` is AXO (Fozilova Dilafruz) — a REQUEST to a logistics
// person, issuing an hour, settling a dispute; `container-logistics` is
// Logistics (Nuriddin aka) — splitting a request across brigadirs, a batch's
// delivery; a leader's answer, a forced close and the settings are admins'.
const DAY_START_MIN = 8 * 60;
const REFRESH_MS = 60_000;
const TABS = ["requests", "axo", "logistics", "leaders", "all", "report", "settings"];
const tabsFor = (r) => TABS.filter((k) => r.admin
  || k === "requests" || k === "all" || k === "report"
  || (k === "axo" && r.axo) || (k === "logistics" && r.logistics));
const liveDay = (now) => (now.min < DAY_START_MIN ? prevISO(now.iso) : now.iso);

export default function ContainerFlow() {
  const { t } = useLang();
  const toast = useToast();
  const qc = useQueryClient();
  const [tabSaved, setTab] = usePersistentState("cflow_tab", "requests");
  const isAdmin = useAuth()?.auth?.role === "admin";
  const [picked, setPicked] = useState(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const live = liveDay(tashkentNow());
  const day = picked ?? live;
  const [newOpen, setNewOpen] = useState(false);

  const board = useQuery({
    queryKey: ["cflow-board", day],
    queryFn: () => api.get("/api/container-flow/board", { params: { day } }).then((r) => r.data),
    refetchInterval: REFRESH_MS,
  });
  const settings = useQuery({
    queryKey: ["cflow-settings"],
    queryFn: () => api.get("/api/container-flow/settings").then((r) => r.data),
  });
  const roles = { admin: isAdmin, axo: isAdmin || !!settings.data?.axo, logistics: isAdmin || !!settings.data?.logistics };
  const tabs = tabsFor(roles);
  const tab = tabs.includes(tabSaved) ? tabSaved : "requests";
  const refresh = () => qc.invalidateQueries({ queryKey: ["cflow-board"] });
  const done = (msg) => { toast.success(msg); refresh(); };
  const fail = (e) => toast.error(errText(t, e));

  const batches = board.data?.batches ?? [];
  const enrolled = settings.data?.units ?? null;
  const onFlow = !["report", "settings", "requests"].includes(tab);
  const nothingOn = onFlow && enrolled != null && enrolled.length === 0 && !board.isLoading && batches.length === 0;
  const ctx = { t, day, batches, loading: board.isLoading, done, fail, refresh };

  return (
    <Layout title={t("nav.containerFlow")}>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* The tabs first: they never move when a tab drops the day control. */}
        <SegmentedToggle asTabs value={tab} onChange={setTab}
          options={tabs.map((k) => ({ value: k, label: t(`cflow.tab.${k}`) }))} />
        {tab !== "report" && <DayStepper value={day} onChange={(d) => setPicked(d === live ? null : d)} />}
        {roles.axo && tab !== "settings" && tab !== "report" && (
          <Button size="lg" icon={<PackagePlus size={15} />} className="ml-auto" onClick={() => setNewOpen(true)}>
            {t("cflow.req.new")}
          </Button>
        )}
      </div>

      {board.isError && onFlow ? (
        <EmptyState tone="danger" showUploadLink={false} title={t("cflow.loadFailed")} message={errText(t, board.error)} />
      ) : nothingOn ? (
        <EmptyState showUploadLink={false} icon={Settings2} title={t("cflow.noUnits")}
          message={t(isAdmin ? "cflow.noUnitsMsg" : "cflow.noUnitsAxo")}
          action={isAdmin
            ? <Button onClick={() => setTab("settings")}>{t("cflow.tab.settings")}</Button>
            : <Button onClick={() => setTab("requests")}>{t("cflow.tab.requests")}</Button>} />
      ) : tab === "requests" ? <RequestsTab t={t} day={day} roles={roles} toast={toast} onNew={() => setNewOpen(true)} />
        : tab === "axo" ? <AxoTab {...ctx} />
        : tab === "logistics" ? <LogisticsTab {...ctx} />
        : tab === "leaders" ? <LeadersTab {...ctx} />
        : tab === "all" ? <AllTab {...ctx} isAdmin={isAdmin} />
        : tab === "report" ? <FlowReport t={t} toast={toast} />
        : <FlowSettings t={t} toast={toast} day={day} data={settings.data} loading={settings.isLoading}
            onSaved={() => { qc.invalidateQueries({ queryKey: ["cflow-settings"] }); refresh(); }} />}

      {newOpen && (
        <NewRequestModal t={t} day={day} onClose={() => setNewOpen(false)}
          onDone={() => {
            setNewOpen(false); setTab("requests"); toast.success(t("cflow.req.sent"));
            qc.invalidateQueries({ queryKey: ["cflow-requests"] });
          }} onFail={fail} />
      )}
      {toast.node}
    </Layout>
  );
}

const usePost = (fn, { onDone, onFail }) => useMutation({ mutationFn: fn, onSuccess: onDone, onError: onFail });

function Loading() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1].map((i) => <SkeletonBlock key={i} className="h-40 w-full rounded-2xl" />)}
    </div>
  );
}

function HourHead({ hour, list, t }) {
  const due = list.reduce((a, b) => (a && a < b.due_at ? a : b.due_at), null);
  const overdue = list.some((b) => b.overdue);
  return (
    <span className="flex items-center gap-2">
      <Chip tone={overdue ? "bad" : "idle"} icon={Clock}>{t("cflow.dueAt").replace("{at}", hhmm(due))}</Chip>
      <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{list.length}</span>
    </span>
  );
}

// A short name heads a count column (the full one is its hover): five long
// names pushed the status and the actions off a laptop's screen.
const typeHead = (t, k) => <Th key={k} label={t(`cflow.ct.${k}`)} hint={t(`production.cont.${k}`)} align="right" />;
const typeHeads = (t) => KEYS.map((k) => typeHead(t, k));
const numCls = "px-3 py-2 text-right tabular-nums whitespace-nowrap";
const dim = { color: "var(--text-4)" };

function UnitCell({ b, t }) {
  const { tl } = useTranslit();
  return (
    <td className="px-3 py-2 whitespace-nowrap">
      <span className="inline-flex items-center gap-2">
        <span className="font-medium" style={{ color: "var(--text-1)" }}>{tl(b.unit) || "—"}</span>
        <KindChip kind={b.kind} t={t} />
        {b.returned > 0 && <Chip tone="warn" icon={Undo2} title={t("cflow.returnedHint")}>{b.returned}</Chip>}
      </span>
    </td>
  );
}

// ── AXO: issue an hour, every unit at once ──────────────────────────────────
function AxoTab({ t, batches, loading, done, fail }) {
  const waiting = useMemo(() => batches.filter((b) => b.status === "requested"), [batches]);
  const [draft, setDraft] = useState({});
  const [ask, setAsk] = useState(null);          // {list} — the hour whose lower counts need a reason
  const [reason, setReason] = useState(null);
  const [comment, setComment] = useState("");
  const val = (b, k) => {
    const d = draft[b.id]?.[k];
    return d !== undefined ? d : lineOf(b, k)?.need ?? null;
  };
  const issue = usePost(
    ({ list, why }) => api.post("/api/container-flow/issue", {
      items: list.map((b) => ({ batch_id: b.id, counts: Object.fromEntries(b.lines.map((ln) => [ln.ctype, val(b, ln.ctype)])) })),
      ...why,
    }),
    { onDone: () => { setAsk(null); setReason(null); setComment(""); done(t("cflow.issued")); }, onFail: fail },
  );
  const press = (list) => {
    if (list.some((b) => b.lines.some((ln) => val(b, ln.ctype) == null))) { fail({ response: { data: { detail: "count" } } }); return; }
    if (list.some((b) => b.lines.some((ln) => val(b, ln.ctype) < ln.need))) { setAsk({ list }); return; }
    issue.mutate({ list, why: {} });
  };
  if (loading) return <Loading />;
  if (!waiting.length) {
    return <EmptyState showUploadLink={false} icon={PackageCheck} title={t("cflow.axo.none")} message={t("cflow.axo.noneMsg")} />;
  }
  return (
    <div className="flex flex-col gap-4">
      {byHour(waiting).map(([hour, list]) => {
        // Only the container types this hour asks for: five steppers a row do
        // not fit a laptop, and most hours use two or three.
        const keys = KEYS.filter((k) => list.some((b) => lineOf(b, k)));
        return (
        <TableCard key={hour} icon={PackageCheck} title={span(hour)} subtitle={t("cflow.axo.sub")} headSize="lg"
          right={<HourHead hour={hour} list={list} t={t} />} maxHeight="none"
          footer={(
            <div className="flex justify-end w-full">
              <Button size="lg" icon={<Check size={15} />} loading={issue.isPending && issue.variables?.list === list}
                onClick={() => press(list)}>
                {t("cflow.axo.issueHour")}
              </Button>
            </div>
          )}>
          <thead>
            <tr>
              <Th label={t("containers.brigadir")} />
              {keys.map((k) => typeHead(t, k))}
              <Th label={t("production.cont.total")} align="right" />
            </tr>
          </thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.id} className="text-sm">
                <UnitCell b={b} t={t} />
                {keys.map((k) => {
                  const ln = lineOf(b, k);
                  if (!ln) return <td key={k} className={numCls} style={dim}>—</td>;
                  const v = val(b, k);
                  return (
                    <td key={k} className="px-3 py-1.5">
                      <span className="flex items-center justify-end gap-2">
                        <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }} title={t("cflow.need")}>{fmt(ln.need)}</span>
                        <CountStepper min={0} value={v} invalid={v != null && v < ln.need}
                          onChange={(n) => setDraft((d) => ({ ...d, [b.id]: { ...d[b.id], [k]: n } }))} />
                      </span>
                    </td>
                  );
                })}
                <td className={`${numCls} font-semibold`} style={{ color: "var(--text-1)" }}>
                  {fmt(b.lines.reduce((a, ln) => a + (val(b, ln.ctype) ?? 0), 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </TableCard>
        );
      })}
      {ask && (
        <Modal onClose={() => setAsk(null)} title={t("cflow.fewerTitle")} subtitle={t("cflow.axo.fewerSub")} dirty={false}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setAsk(null)}>{t("common.cancel")}</Button>
              <Button loading={issue.isPending} disabled={!reasonOk(reason, comment)}
                onClick={() => issue.mutate({ list: ask.list, why: { reason, comment } })}>
                {t("cflow.axo.issueHour")}
              </Button>
            </>
          )}>
          <ReasonFields {...{ reason, setReason, comment, setComment, t }} />
        </Modal>
      )}
    </div>
  );
}

// ── Logistics: confirm the delivery at the unit ─────────────────────────────
function LogisticsTab({ t, batches, loading, done, fail, refresh }) {
  const onWay = useMemo(() => batches.filter((b) => b.status === "issued"), [batches]);
  const [fix, setFix] = useState(null);       // the batch whose count is being corrected
  const [back, setBack] = useState(null);     // the batch being sent back
  const deliver = usePost(
    ({ ids }) => Promise.all(ids.map((id) => api.post(`/api/container-flow/batches/${id}/deliver`, {}))),
    { onDone: () => done(t("cflow.delivered")), onFail: (e) => { fail(e); refresh(); } },
  );
  if (loading) return <Loading />;
  if (!onWay.length) {
    return <EmptyState showUploadLink={false} icon={Truck} title={t("cflow.log.none")} message={t("cflow.log.noneMsg")} />;
  }
  return (
    <div className="flex flex-col gap-4">
      {byHour(onWay).map(([hour, list]) => (
        <TableCard key={hour} icon={Truck} title={span(hour)} subtitle={t("cflow.log.sub")} headSize="lg"
          right={<HourHead hour={hour} list={list} t={t} />} maxHeight="none"
          footer={list.length > 1 && (
            <div className="flex justify-end w-full">
              <Button size="lg" icon={<Check size={15} />} loading={deliver.isPending && deliver.variables?.ids.length > 1}
                onClick={() => deliver.mutate({ ids: list.map((b) => b.id) })}>
                {t("cflow.log.confirmAll")}
              </Button>
            </div>
          )}>
          <thead>
            <tr>
              <Th label={t("containers.brigadir")} />{typeHeads(t)}
              <Th label={t("cflow.issuedAt")} align="center" /><Th label="" cls="w-px" />
            </tr>
          </thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.id} className="text-sm">
                <UnitCell b={b} t={t} />
                {KEYS.map((k) => {
                  const ln = lineOf(b, k);
                  if (!ln) return <td key={k} className={numCls} style={dim}>—</td>;
                  return (
                    <td key={k} className={numCls} style={{ color: "var(--text-1)" }}
                      title={ln.issued < ln.need ? `${t("cflow.need")}: ${ln.need}` : undefined}>
                      {fmt(ln.issued)}{ln.issued < ln.need && <span style={{ color: "var(--status-bad)" }}> / {fmt(ln.need)}</span>}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-center tabular-nums whitespace-nowrap" style={{ color: "var(--text-3)" }}>{hhmm(b.issued_at)}</td>
                <td className="px-3 py-1.5">
                  <span className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="success" tint icon={<Check size={13} />}
                      loading={deliver.isPending && deliver.variables?.ids.length === 1 && deliver.variables.ids[0] === b.id}
                      onClick={() => deliver.mutate({ ids: [b.id] })}>
                      {t("cflow.log.confirm")}
                    </Button>
                    <ActionMenu label={`${t("cflow.actions")}: ${b.unit ?? ""}`} items={[
                      { key: "fix", label: t("cflow.log.correct"), icon: PencilLine, onSelect: () => setFix(b) },
                      { key: "back", label: t("cflow.log.sendBack"), icon: Undo2, tone: "danger", onSelect: () => setBack(b) },
                    ]} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      ))}
      {fix && (
        <CountsModal t={t} title={t("cflow.log.correct")} subtitle={`${span(fix.hour)} · ${fix.unit ?? ""}`}
          rows={fix.lines.map((ln) => ({ k: ln.ctype, base: ln.issued ?? 0 }))} max={null}
          confirm={t("cflow.log.confirm")} onClose={() => setFix(null)}
          post={(body) => api.post(`/api/container-flow/batches/${fix.id}/deliver`, body)}
          onDone={() => { setFix(null); done(t("cflow.delivered")); }} onFail={fail} />
      )}
      {back && (
        <NoteModal t={t} title={t("cflow.log.sendBack")} subtitle={`${span(back.hour)} · ${back.unit ?? ""}`}
          label={t("cflow.log.backWhy")} confirm={t("cflow.log.sendBack")} danger onClose={() => setBack(null)}
          post={(note) => api.post(`/api/container-flow/batches/${back.id}/return`, { note })}
          onDone={() => { setBack(null); done(t("cflow.returned")); }} onFail={fail} />
      )}
    </div>
  );
}

// ── Leaders: each team accepts its share ────────────────────────────────────
function LeadersTab({ t, batches, loading, done, fail }) {
  const { tl } = useTranslit();
  const open = useMemo(() => batches.filter((b) => b.status === "delivered" || b.status === "disputed"), [batches]);
  const [actual, setActual] = useState(null);     // {b, team}
  const [refuse, setRefuse] = useState(null);     // {b, team}
  const [settle, setSettle] = useState(null);     // batch
  const accept = usePost(
    ({ b, team }) => api.post(`/api/container-flow/batches/${b.id}/answer`, { team: team.key, mode: "all" }),
    { onDone: () => done(t("cflow.accepted")), onFail: fail },
  );
  if (loading) return <Loading />;
  if (!open.length) {
    return <EmptyState showUploadLink={false} icon={UsersRound} title={t("cflow.lead.none")} message={t("cflow.lead.noneMsg")} />;
  }
  return (
    <div className="flex flex-col gap-4">
      {byHour(open).map(([hour, list]) => (
        <TableCard key={hour} icon={UsersRound} title={span(hour)} subtitle={t("cflow.lead.sub")} headSize="lg"
          right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{list.reduce((a, b) => a + b.teams.length, 0)}</span>}
          maxHeight="none">
          <thead>
            <tr>
              <Th label={t("containers.brigadir")} /><Th label={t("cflow.team")} /><Th label={t("cflow.leader")} />
              {typeHeads(t)}<Th label={t("cflow.status")} align="center" /><Th label="" cls="w-px" />
            </tr>
          </thead>
          <tbody>
            {list.flatMap((b) => b.teams.map((team) => {
              const shown = team.status === "pending" ? team.sent : team.accepted;
              return (
                <tr key={`${b.id}|${team.key}`} className="text-sm">
                  <UnitCell b={b} t={t} />
                  <td className="px-3 py-2"><TeamLabel team={team} t={t} /></td>
                  <td className="px-3 py-2 whitespace-nowrap max-w-[200px] truncate" style={{ color: "var(--text-2)" }} title={tl(team.leader) || undefined}>
                    {tl(team.leader) || <span style={dim}>—</span>}
                  </td>
                  {KEYS.map((k) => {
                    const due = team.due[k];
                    if (due == null) return <td key={k} className={numCls} style={dim}>—</td>;
                    const n = shown[k] ?? 0;
                    return (
                      <td key={k} className={numCls} style={{ color: "var(--text-1)" }}
                        title={n < due ? t("cflow.lead.dueGot").replace("{due}", due).replace("{got}", n) : undefined}>
                        {fmt(n)}{n < due && <span style={{ color: "var(--status-bad)" }}> / {fmt(due)}</span>}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center">
                    <Chip tone={{ pending: "warn", accepted: "ok", settled: "ok", disputed: "bad" }[team.status]}
                      title={team.reason ? `${t(`cflow.reason.${team.reason}`)}${team.comment ? ` — ${team.comment}` : ""}` : undefined}>
                      {t(`cflow.share.${team.status}`)}
                    </Chip>
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="flex items-center justify-end gap-1 min-w-[150px]">
                      {team.status === "pending" && (
                        <>
                          <Button size="sm" variant="success" tint icon={<Check size={13} />}
                            loading={accept.isPending && accept.variables?.b.id === b.id && accept.variables?.team.key === team.key}
                            onClick={() => accept.mutate({ b, team })}>
                            {t("cflow.lead.acceptAll")}
                          </Button>
                          <ActionMenu label={`${t("cflow.actions")}: ${team.work_center}`} items={[
                            { key: "actual", label: t("cflow.lead.actual"), icon: PencilLine, onSelect: () => setActual({ b, team }) },
                            { key: "refuse", label: t("cflow.lead.refuse"), icon: XCircle, tone: "danger", onSelect: () => setRefuse({ b, team }) },
                          ]} />
                        </>
                      )}
                      {team.status === "disputed" && (
                        <Button size="sm" variant="primary" tint icon={<Scale size={13} />} onClick={() => setSettle(b)}>
                          {t("cflow.lead.settle")}
                        </Button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            }))}
          </tbody>
        </TableCard>
      ))}
      {actual && (
        <CountsModal t={t} title={t("cflow.lead.actual")}
          subtitle={`${span(actual.b.hour)} · ${actual.team.work_center}${actual.team.group ? ` · ${actual.team.group}` : ""}`}
          rows={Object.keys(actual.team.sent).map((k) => ({ k, base: actual.team.sent[k] }))} max="base"
          confirm={t("cflow.lead.accept")} onClose={() => setActual(null)}
          post={(body) => api.post(`/api/container-flow/batches/${actual.b.id}/answer`, { ...body, team: actual.team.key, mode: "actual" })}
          onDone={() => { setActual(null); done(t("cflow.accepted")); }} onFail={fail} />
      )}
      {refuse && (
        <RefuseModal t={t} subtitle={`${span(refuse.b.hour)} · ${refuse.team.work_center}${refuse.team.group ? ` · ${refuse.team.group}` : ""}`}
          onClose={() => setRefuse(null)}
          post={(body) => api.post(`/api/container-flow/batches/${refuse.b.id}/answer`, { ...body, team: refuse.team.key, mode: "refuse" })}
          onDone={() => { setRefuse(null); done(t("cflow.refused")); }} onFail={fail} />
      )}
      {settle && (
        <NoteModal t={t} title={t("cflow.lead.settle")} subtitle={`${span(settle.hour)} · ${settle.unit ?? ""}`}
          label={t("cflow.lead.settleNote")} confirm={t("cflow.lead.settle")} onClose={() => setSettle(null)}
          post={(note) => api.post(`/api/container-flow/batches/${settle.id}/settle`, { note })}
          onDone={() => { setSettle(null); done(t("cflow.settled")); }} onFail={fail} />
      )}
    </div>
  );
}

// ── Every batch of the day ──────────────────────────────────────────────────
function AllTab({ t, batches, loading, done, fail, isAdmin }) {
  const [hist, setHist] = useState(null);
  const [close, setClose] = useState(null);
  const [settle, setSettle] = useState(null);
  const total = (b, f) => (b.lines.some((ln) => ln[f] != null) ? b.lines.reduce((a, ln) => a + (ln[f] ?? 0), 0) : null);
  return (
    <>
      <TableCard icon={ClipboardList} title={t("cflow.all.title")} subtitle={t("cflow.all.sub")} headSize="lg"
        right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{batches.length}</span>}>
        <thead>
          <tr>
            <Th label={t("cflow.hour")} /><Th label={t("containers.brigadir")} /><Th label={t("cflow.status")} align="center" />
            <Th label={t("cflow.need")} align="right" /><Th label={t("cflow.col.issued")} align="right" />
            <Th label={t("cflow.col.delivered")} align="right" /><Th label={t("cflow.col.accepted")} align="right" />
            <Th label={t("cflow.due")} align="center" /><Th label={t("cflow.deliveredAt")} align="center" /><Th label="" cls="w-px" />
          </tr>
        </thead>
        <tbody>
          {loading ? Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}><td colSpan={10} className="px-3 py-2"><SkeletonBlock className="h-5 w-full" /></td></tr>
          )) : !batches.length ? (
            <tr><td colSpan={10} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>{t("cflow.all.none")}</td></tr>
          ) : batches.map((b) => {
            const acc = b.teams.some((x) => Object.keys(x.accepted).length) ? b.teams.reduce((a, x) => a + sum(x.accepted), 0) : null;
            return (
              <tr key={b.id} className="text-sm">
                <td className="px-3 py-2 tabular-nums whitespace-nowrap font-medium" style={{ color: "var(--text-1)" }}>{span(b.hour)}</td>
                <UnitCell b={b} t={t} />
                <td className="px-3 py-2 text-center">
                  <span className="inline-flex items-center gap-1">
                    <StatusChip b={b} t={t} />
                    {b.forced && <Chip tone="idle" icon={Lock} title={b.close_note || undefined}>{t("cflow.forced")}</Chip>}
                  </span>
                </td>
                <td className={numCls} style={{ color: "var(--text-1)" }}>{fmt(total(b, "need"))}</td>
                <td className={numCls} style={{ color: "var(--text-1)" }}>{fmt(total(b, "issued"))}</td>
                <td className={numCls} style={{ color: "var(--text-1)" }}>{fmt(total(b, "delivered"))}</td>
                <td className={numCls} style={{ color: "var(--text-1)" }}>{fmt(acc)}</td>
                <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-3)" }}>{hhmm(b.due_at)}</td>
                <td className="px-3 py-2 text-center tabular-nums whitespace-nowrap"
                  style={{ color: b.late ? "var(--status-bad)" : "var(--text-3)" }} title={b.late ? t("cflow.late") : undefined}>
                  {hhmm(b.delivered_at)}
                </td>
                <td className="px-3 py-1.5">
                  <ActionMenu label={`${t("cflow.actions")}: ${b.unit ?? ""} ${span(b.hour)}`} items={[
                    { key: "hist", label: t("cflow.history"), icon: History, onSelect: () => setHist(b) },
                    b.status === "disputed" && { key: "settle", label: t("cflow.lead.settle"), icon: Scale, onSelect: () => setSettle(b) },
                    isAdmin && b.status !== "closed" && { key: "close", label: t("cflow.close"), icon: Lock, tone: "danger", onSelect: () => setClose(b) },
                  ]} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableCard>
      {hist && <HistoryModal t={t} b={hist} onClose={() => setHist(null)} />}
      {settle && (
        <NoteModal t={t} title={t("cflow.lead.settle")} subtitle={`${span(settle.hour)} · ${settle.unit ?? ""}`}
          label={t("cflow.lead.settleNote")} confirm={t("cflow.lead.settle")} onClose={() => setSettle(null)}
          post={(note) => api.post(`/api/container-flow/batches/${settle.id}/settle`, { note })}
          onDone={() => { setSettle(null); done(t("cflow.settled")); }} onFail={fail} />
      )}
      {close && (
        <NoteModal t={t} title={t("cflow.close")} subtitle={`${span(close.hour)} · ${close.unit ?? ""}`}
          label={t("cflow.closeNote")} hint={t("cflow.closeHint")} confirm={t("cflow.close")} danger onClose={() => setClose(null)}
          post={(note) => api.post(`/api/container-flow/batches/${close.id}/close`, { note })}
          onDone={() => { setClose(null); done(t("cflow.closed")); }} onFail={fail} />
      )}
    </>
  );
}

function HistoryModal({ t, b, onClose }) {
  const { tl } = useTranslit();
  const q = useQuery({
    queryKey: ["cflow-history", b.id],
    queryFn: () => api.get(`/api/container-flow/batches/${b.id}/history`).then((r) => r.data.events),
  });
  // The stored map comes back in the database's key order — print the
  // containers in the platform's own.
  const list = (o) => KEYS.filter((k) => o[k] != null).map((k) => `${t(`cflow.ct.${k}`)}: ${o[k]}`).join(" · ");
  const words = (d) => [
    d.team && d.team.split("|").slice(0, 2).filter(Boolean).join(" · "),
    d.counts && list(d.counts),
    d.need && list(d.need),
    d.reason && t(`cflow.reason.${d.reason}`),
    d.comment, d.note, d.late ? t("cflow.late") : null,
  ].filter(Boolean).join(" — ");
  return (
    <Modal onClose={onClose} title={t("cflow.history")} subtitle={`${span(b.hour)} · ${tl(b.unit) ?? ""}`}
      footer={<Button variant="secondary" onClick={onClose}>{t("cflow.shut")}</Button>}>
      {q.isLoading ? <SkeletonBlock className="h-24 w-full" /> : (
        <ul className="flex flex-col gap-2.5">
          {(q.data ?? []).map((e, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="tabular-nums shrink-0 w-11" style={{ color: "var(--text-3)" }}>{hhmm(e.at)}</span>
              <span className="min-w-0">
                <span className="font-medium" style={{ color: "var(--text-1)" }}>{t(`cflow.ev.${e.action}`)}</span>
                <span style={{ color: "var(--text-3)" }}> · {e.actor ? tl(e.actor) : t("cflow.platform")}</span>
                {words(e.detail) && <span className="block text-xs break-words" style={{ color: "var(--text-2)" }}>{words(e.detail)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

// A count per container type; a lower number asks why.
function CountsModal({ t, title, subtitle, rows, max, confirm, post, onClose, onDone, onFail }) {
  const [counts, setCounts] = useState(() => Object.fromEntries(rows.map((r) => [r.k, r.base])));
  const [reason, setReason] = useState(null);
  const [comment, setComment] = useState("");
  const lower = rows.some((r) => counts[r.k] != null && counts[r.k] < r.base);
  const over = max === "base" && rows.some((r) => counts[r.k] > r.base);
  const blank = rows.some((r) => counts[r.k] == null);
  const m = usePost(() => post({ counts, ...(lower ? { reason, comment } : {}) }), { onDone, onFail });
  return (
    <Modal onClose={onClose} title={title} subtitle={subtitle}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button loading={m.isPending} disabled={blank || over || (lower && !reasonOk(reason, comment))} onClick={() => m.mutate()}>{confirm}</Button>
        </>
      )}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rows.map((r) => (
          <FormField key={r.k} label={`${t(`production.cont.${r.k}`)} · ${fmt(r.base)}`}
            error={max === "base" && counts[r.k] > r.base ? t("cflow.err.over") : undefined}>
            <CountStepper min={0} max={max === "base" ? r.base : null} value={counts[r.k]}
              invalid={max === "base" && counts[r.k] > r.base}
              onChange={(n) => setCounts((c) => ({ ...c, [r.k]: n }))} />
          </FormField>
        ))}
      </div>
      {lower && <ReasonFields {...{ reason, setReason, comment, setComment, t }} />}
    </Modal>
  );
}

function RefuseModal({ t, subtitle, post, onClose, onDone, onFail }) {
  const [reason, setReason] = useState(null);
  const [comment, setComment] = useState("");
  const m = usePost(() => post({ reason, comment }), { onDone, onFail });
  return (
    <Modal onClose={onClose} title={t("cflow.lead.refuse")} subtitle={subtitle}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="danger" loading={m.isPending} disabled={!reasonOk(reason, comment)} onClick={() => m.mutate()}>{t("cflow.lead.refuse")}</Button>
        </>
      )}>
      <ReasonFields {...{ reason, setReason, comment, setComment, t }} />
    </Modal>
  );
}

function NoteModal({ t, title, subtitle, label, hint, confirm, danger, post, onClose, onDone, onFail }) {
  const [note, setNote] = useState("");
  const m = usePost(() => post(note.trim()), { onDone, onFail });
  return (
    <Modal onClose={onClose} title={title} subtitle={subtitle}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant={danger ? "danger" : "primary"} loading={m.isPending} disabled={!note.trim()} onClick={() => m.mutate()}>{confirm}</Button>
        </>
      )}>
      <FormField label={label} required hint={hint}>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={fieldCls} style={fieldStyle} />
      </FormField>
    </Modal>
  );
}
