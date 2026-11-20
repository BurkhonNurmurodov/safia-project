// «Jo'natish» (2026-11-19, the operator: «sending containers are not like the
// inside containers, but we have to add them together»). A dispatch area packs
// finished goods for sending and needs so many containers and lids a shift,
// in rounds (his workbook «Отправка контейнер крышка соат бўйича день ва ночь
// смена»), each round's share asked for whole at the hour it starts
// (2026-11-20, the server's `round_hours`). That packaging leaves with the
// product, so it is two types
// of its own — always shown with a truck — asked of logistics like any
// request and added into every total. Here:
// - `SendAreasCard` — «Jo'natish jadvali» on «Sozlamalar», kept by AXO and the
//   admins: the areas, their shift figure and rounds;
// - `SendingTable` — per area: the schedule's need, asked, delivered;
// - `TogetherCard` — the brigadirs' and the dispatch areas' figures as ONE
//   total split in two.
// docs/containers-flow.md.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Layers, Pencil, Plus, Trash2, Truck } from "lucide-react";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmDialog from "../ui/ConfirmDialog";
import FormField from "../ui/FormField";
import CountStepper from "../ui/CountStepper";
import SegmentedToggle from "../ui/SegmentedToggle";
import TimeField from "../ui/TimeField";
import ActionMenu from "../ui/ActionMenu";
import TableCard, { Th, SectionHead } from "../ui/DataTable";
import { SplitBar, SplitLegend } from "../ui/Meter";
import { SkeletonBlock } from "../ui/Skeleton";
import { CATEGORY_COLORS } from "../../utils/chartPalette";
import { vypTone } from "../../utils/statusBands";
import { useTranslit } from "../../utils/transliterate";
import api from "../../utils/api";
import { fmt, errText, fieldCls, fieldStyle, refreshFlow, useSendAreas, shiftName, TYPE_COLORS, TypeName } from "./flowUtil";

const MAX_ROUNDS = 8;
const pair = (o) => `${fmt(o?.send ?? 0)} / ${fmt(o?.lid ?? 0)}`;
const roundsText = (rounds) => (rounds ?? []).map(([a, b]) => `${a}–${b}`).join(" · ");
// The biggest round of an area — what «Bosqichiga» shows (the rounds share the
// shift evenly, each whole in the hour it starts).
const perRound = (a) => {
  const hs = Object.values(a.hours ?? {});
  return hs.length ? hs.reduce((m, c) => ((c.send ?? 0) + (c.lid ?? 0) > (m.send ?? 0) + (m.lid ?? 0) ? c : m), hs[0]) : null;
};

// ── «Jo'natish jadvali» on «Sozlamalar» ──────────────────────────────────────
export function SendAreasCard({ t, toast, canEdit }) {
  const { tx } = useTranslit();
  const qc = useQueryClient();
  const q = useSendAreas();
  const areas = q.data?.areas ?? [];
  const [editing, setEditing] = useState(null);         // null · "new" · an area
  const [removing, setRemoving] = useState(null);
  const rm = useMutation({
    mutationFn: (a) => api.delete(`/api/container-flow/send-areas/${a.id}`),
    onSuccess: () => { setRemoving(null); toast.success(t("cflow.sa.removed")); refreshFlow(qc); },
  });
  const COLS = 7;
  return (
    <>
      <TableCard icon={Truck} title={t("cflow.sa.title")} subtitle={t("cflow.sa.sub")} headSize="lg" maxHeight="none"
        right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{q.isLoading ? "" : areas.length}</span>}
        footer={canEdit ? (
          <div className="px-3 py-2">
            <Button variant="secondary" icon={<Plus size={14} />} onClick={() => setEditing("new")}>{t("cflow.sa.add")}</Button>
          </div>
        ) : null}>
        <thead>
          <tr>
            <Th label={t("cflow.sa.col.area")} />
            <Th label={t("cflow.sa.col.shift")} align="center" />
            <Th label={t("cflow.ct.send")} icon={Truck} align="right" hint={t("cflow.sa.hint.perShift")} />
            <Th label={t("cflow.ct.lid")} icon={Truck} align="right" hint={t("cflow.sa.hint.perShift")} />
            <Th label={t("cflow.sa.col.rounds")} hint={t("cflow.sa.hint.rounds")} />
            <Th label={t("cflow.sa.col.perRound")} align="right" hint={t("cflow.sa.hint.perRound")} />
            <Th label="" cls="w-px" />
          </tr>
        </thead>
        <tbody>
          {q.isLoading ? Array.from({ length: 4 }).map((_, i) => (
            <tr key={i}><td colSpan={COLS} className="px-3 py-2"><SkeletonBlock className="h-5 w-full" /></td></tr>
          )) : q.isError ? (
            <tr><td colSpan={COLS} className="px-3 py-6 text-center" style={{ color: "var(--status-bad)" }}>{errText(t, q.error)}</td></tr>
          ) : !areas.length ? (
            <tr><td colSpan={COLS} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>{t("cflow.sa.none")}</td></tr>
          ) : areas.map((a) => {
            const ph = perRound(a);
            return (
              <tr key={a.id} className="text-sm">
                <td className="px-3 py-2 whitespace-nowrap max-w-[280px] truncate" title={tx(a.name)} style={{ color: "var(--text-1)" }}>{tx(a.name)}</td>
                <td className="px-3 py-2 text-center whitespace-nowrap" style={{ color: "var(--text-2)" }}>{shiftName(t, a.shift)}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-1)" }}>{fmt(a.send)}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-1)" }}>{fmt(a.lid)}</td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums" style={{ color: "var(--text-2)" }}>{roundsText(a.rounds)}</td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{ph ? pair(ph) : "—"}</td>
                <td className="px-3 py-[2px]">
                  <span className="flex items-center justify-end min-h-[32px]">
                    <ActionMenu label={`${t("cflow.actions")}: ${tx(a.name)}`} items={canEdit ? [
                      { key: "edit", label: t("cflow.sa.edit"), icon: Pencil, onSelect: () => setEditing(a) },
                      { key: "remove", label: t("cflow.sa.remove"), icon: Trash2, tone: "danger",
                        onSelect: () => { rm.reset(); setRemoving(a); } },
                    ] : []} />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableCard>
      {editing && (
        <AreaModal t={t} area={editing === "new" ? null : editing} onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); toast.success(t("cflow.sa.saved")); refreshFlow(qc); }}
          onFail={(e) => toast.error(errText(t, e))} />
      )}
      {removing && (
        <ConfirmDialog tone="danger" icon={<Trash2 size={18} />}
          title={t("cflow.sa.removeTitle").replace("{x}", tx(removing.name))}
          message={t("cflow.sa.removeMsg")} confirmLabel={t("cflow.sa.remove")} loading={rm.isPending}
          error={rm.error ? errText(t, rm.error) : null}
          onCancel={() => setRemoving(null)} onConfirm={() => rm.mutate(removing)} />
      )}
    </>
  );
}

let roundSeq = 1;
const blankRound = (from = "", to = "") => ({ id: roundSeq++, from, to });

// One dispatch area: its name, shift, the shift's containers and lids, and the
// packing rounds. The hours are worked out by the server (`area_hours`); the
// line under the rounds says what each round gets.
function AreaModal({ t, area, onClose, onDone, onFail }) {
  const [name, setName] = useState(area?.name ?? "");
  const [shift, setShift] = useState(area?.shift ?? 1);
  const [send, setSend] = useState(area?.send ?? null);
  const [lid, setLid] = useState(area?.lid ?? null);
  const [rounds, setRounds] = useState(() => (area?.rounds?.length ? area.rounds.map(([a, b]) => blankRound(a, b)) : [blankRound()]));
  const setRound = (id, patch) => setRounds((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const n = rounds.length;
  const ok = name.trim() && ((send ?? 0) > 0 || (lid ?? 0) > 0) && n > 0 && rounds.every((r) => r.from && r.to);
  const per = (v) => (n ? Math.round((v ?? 0) / n) : 0);
  const m = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), shift, send: send ?? 0, lid: lid ?? 0, rounds: rounds.map((r) => [r.from, r.to]) };
      return area ? api.put(`/api/container-flow/send-areas/${area.id}`, body) : api.post("/api/container-flow/send-areas", body);
    },
    onSuccess: onDone, onError: onFail,
  });
  return (
    <Modal onClose={onClose} title={t(area ? "cflow.sa.editTitle" : "cflow.sa.newTitle")} subtitle={t("cflow.sa.modalSub")}
      maxWidth="max-w-xl"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button loading={m.isPending} disabled={!ok} onClick={() => m.mutate()}>{t("cflow.sa.save")}</Button>
        </>
      )}>
      <div className="flex flex-col gap-3">
        <FormField label={t("cflow.sa.name")} required>
          <input type="text" className={fieldCls} style={fieldStyle} maxLength={120} value={name}
            onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label={t("cflow.sa.col.shift")} required>
          <SegmentedToggle fill value={shift} onChange={setShift}
            options={[[1, t("cflow.sa.shift.1")], [2, t("cflow.sa.shift.2")]]} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={<TypeName t={t} k="send" long />} hint={t("cflow.sa.hint.perShift")}>
            <CountStepper min={0} max={100000} value={send} placeholder="0" onChange={setSend} />
          </FormField>
          <FormField label={<TypeName t={t} k="lid" long />} hint={t("cflow.sa.hint.perShift")}>
            <CountStepper min={0} max={100000} value={lid} placeholder="0" onChange={setLid} />
          </FormField>
        </div>
        <FormField label={t("cflow.sa.rounds")} required hint={t("cflow.sa.hint.rounds")}>
          <div className="flex flex-col gap-2">
            {rounds.map((r, i) => (
              <div key={r.id} className="flex items-center gap-2">
                <span className="w-[76px] shrink-0 text-xs" style={{ color: "var(--text-3)" }}>
                  {t("cflow.sa.round").replace("{n}", i + 1)}
                </span>
                <TimeField value={r.from} onChange={(v) => setRound(r.id, { from: v })} className="flex-1 min-w-0"
                  aria-label={`${t("cflow.sa.round").replace("{n}", i + 1)} — ${t("cflow.sa.from")}`} />
                <span aria-hidden style={{ color: "var(--text-3)" }}>–</span>
                <TimeField value={r.to} onChange={(v) => setRound(r.id, { to: v })} className="flex-1 min-w-0"
                  aria-label={`${t("cflow.sa.round").replace("{n}", i + 1)} — ${t("cflow.sa.to")}`} />
                <Button size="lg" variant="ghost" icon={<Trash2 size={15} />} disabled={rounds.length < 2}
                  aria-label={t("cflow.sa.removeRound")} title={t("cflow.sa.removeRound")}
                  onClick={() => setRounds((rs) => rs.filter((x) => x.id !== r.id))} />
              </div>
            ))}
            <div>
              <Button variant="secondary" icon={<Plus size={14} />} disabled={rounds.length >= MAX_ROUNDS}
                onClick={() => setRounds((rs) => [...rs, blankRound()])}>
                {t("cflow.sa.addRound")}
              </Button>
            </div>
          </div>
        </FormField>
        {/* always one line: what a round gets — never moves the form */}
        <p className="text-xs min-h-[16px] tabular-nums" style={{ color: "var(--text-3)" }}>
          {t("cflow.sa.preview").replace("{r}", `${fmt(per(send))} / ${fmt(per(lid))}`)}
        </p>
      </div>
    </Modal>
  );
}

// ── «Jo'natish» — over a period (Tahlil, Hisobot) ───────────────────────────
// Per area what the schedule needs; what AXO asked of the dispatch types and
// what logistics gave dispatch exist only in all — the split gives dispatch
// ONE amount and names no area (2026-11-19).
export function SendingTable({ t, x, loading }) {
  const { tx } = useTranslit();
  const rows = x?.areas ?? [];
  const tot = x?.total;
  const COLS = 3;
  const tone = tot?.pct == null ? null : vypTone(tot.pct / 100);
  const fig = (label, value, color) => (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      {label}
      <b className="tabular-nums font-semibold" style={{ color: color ?? "var(--text-1)" }}>{value}</b>
    </span>
  );
  return (
    <TableCard icon={Truck} title={t("cflow.snd.tableTitle")} headSize="lg" maxHeight="none"
      subtitle={t("cflow.snd.tableSub").replace("{d}", x?.days ?? 0)}
      right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{loading ? "" : rows.length}</span>}
      footer={tot ? (
        <div className="px-3 py-2 text-xs flex flex-wrap gap-x-5 gap-y-1" style={{ color: "var(--text-3)" }}
          title={t("cflow.snd.pair")}>
          {fig(t("cflow.snd.col.need"), pair(tot.need))}
          {fig(t("cflow.snd.col.asked"), pair(tot.asked))}
          {fig(t("cflow.snd.col.given"), pair(tot.given))}
          {fig(t("cflow.snd.col.pct"), tot.pct == null ? "—" : `${tot.pct}%`, tone ? `var(--status-${tone})` : undefined)}
        </div>
      ) : null}>
      <thead>
        <tr>
          <Th label={t("cflow.sa.col.area")} />
          <Th label={t("cflow.sa.col.shift")} align="center" />
          <Th label={t("cflow.snd.col.need")} align="right" hint={`${t("cflow.snd.hint.need")} · ${t("cflow.snd.pair")}`} />
        </tr>
      </thead>
      <tbody>
        {loading ? Array.from({ length: 3 }).map((_, i) => (
          <tr key={i}><td colSpan={COLS} className="px-3 py-2"><SkeletonBlock className="h-5 w-full" /></td></tr>
        )) : x == null ? (
          <tr><td colSpan={COLS} className="px-3 py-6 text-center" style={{ color: "var(--status-bad)" }}>{t("cflow.loadFailed")}</td></tr>
        ) : !rows.length ? (
          <tr><td colSpan={COLS} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>{t("cflow.snd.none")}</td></tr>
        ) : rows.map((r) => (
          <tr key={r.area_id} className="text-sm">
            <td className="px-3 py-2 whitespace-nowrap max-w-[320px] truncate" title={tx(r.area)} style={{ color: "var(--text-1)" }}>
              <span className="inline-flex items-center gap-1.5">
                <Truck size={13} className="shrink-0" aria-hidden style={{ color: TYPE_COLORS.send }} />{tx(r.area) || "—"}
              </span>
            </td>
            <td className="px-3 py-2 text-center whitespace-nowrap" style={{ color: "var(--text-2)" }}>{shiftName(t, r.shift)}</td>
            <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: "var(--text-1)" }}>{pair(r.need)}</td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
}

// ── one total, split in two (Tahlil, Hisobot) ─────────────────────────────────
// The operator: «we have to add them together» — asked and given for the
// brigadirs AND the dispatch areas as one figure, the split under it.
const IN_COLOR = CATEGORY_COLORS[2];          // blue — the brigadirs' side
const SEND_COLOR = TYPE_COLORS.send;          // the dispatch types' purple

export function TogetherCard({ t, s, loading }) {
  const rows = [
    ["asked", s?.asked, s?.in_asked, s?.send_asked],
    ["given", s?.given, s?.in_given, s?.send_given],
  ];
  return (
    <section className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={Layers} title={t("cflow.tog.title")} subtitle={t("cflow.tog.sub")} />
      <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        {rows.map(([k, total, a, b]) => {
          const parts = [
            { key: "in", label: t("cflow.tog.in"), value: loading ? 0 : a ?? 0, color: IN_COLOR },
            { key: "send", label: t("cflow.tog.send"), value: loading ? 0 : b ?? 0, color: SEND_COLOR },
          ];
          return (
            <div key={k} className="flex flex-col gap-2 min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>{t(`cflow.tog.${k}`)}</span>
                <b className="text-[22px] font-semibold tabular-nums leading-tight" style={{ color: "var(--text-1)" }}>
                  {loading ? "…" : fmt(total ?? 0)}
                </b>
              </div>
              {loading ? <SkeletonBlock className="h-2 w-full rounded-full" /> : <SplitBar parts={parts} height={8} />}
              <SplitLegend parts={parts.map((p) => ({ ...p, value: loading ? "…" : fmt(p.value) }))} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
