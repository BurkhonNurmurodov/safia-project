import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, AlertTriangle, ArrowDown, ArrowUp, Bot, CalendarClock, CheckCircle2, KeyRound, Loader2,
  MessageSquare, Plus, Send, Trash2, Users, XCircle,
} from "lucide-react";
import api from "../../utils/api";
import { useLeaveGuard } from "../../hooks/useLeaveGuard";
import Button from "../../components/ui/Button";
import FormField from "../../components/ui/FormField";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import TimeField from "../../components/ui/TimeField";
import EmptyState from "../../components/ui/EmptyState";
import { SectionHead } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import { useNT, fill, stamp, detailOf } from "../../components/notion/notionUtil";

/**
 * «Notion eslatmalari» — the daily Telegram reminders for the Notion
 * "Production" task list (services/notion_tracker.py), moved here from the
 * stand-alone GitHub bot on 2026-11-02.
 *
 * The schedule, the groups and the team are ONE draft with one Save (the
 * server checks it whole and names the field that is wrong). The bot token is
 * its own action — it goes in and never comes out, and a token Telegram
 * rejects is not stored. «Telegramimga namuna yuborish» sends today's messages
 * to the admin's own chat with the bot and records nothing.
 *
 * Admin-only and never grantable (no capKey in ADMIN_NAV).
 */

const QK = ["admin-notion-tracker"];
const SQK = ["admin-notion-tracker", "status"];
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const card = { background: "var(--bg-card)", border: "1px solid var(--border)" };
const inputCls = "w-full px-3 py-2 rounded-xl text-base sm:text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]";
const inputStyle = (bad) => ({
  background: "var(--bg-inner)", border: `1px solid ${bad ? "var(--status-bad)" : "var(--border)"}`, color: "var(--text-1)",
});
const OK = "var(--status-ok)";
const WARN = "var(--status-warn)";
const BAD = "var(--status-bad)";
const norm = (s) => String(s || "").trim().toLowerCase();

function Line({ icon: Icon, ink, children }) {
  return (
    <div className="flex items-start gap-2 text-sm py-1" style={{ color: "var(--text-2)" }}>
      <Icon size={15} className="mt-0.5 flex-shrink-0" style={{ color: ink || "var(--text-3)" }} aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function FieldError({ text }) {
  if (!text) return null;
  return <p className="text-[11px] mt-1" style={{ color: BAD }}>{text}</p>;
}

function DayPicker({ T, value, onChange, bad }) {
  const toggle = (d) => onChange(value.includes(d) ? value.filter((x) => x !== d) : DAY_KEYS.filter((x) => x === d || value.includes(x)));
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={T.fDays}>
      {DAY_KEYS.map((d, i) => {
        const on = value.includes(d);
        return (
          <label key={d} className="cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={on} onChange={() => toggle(d)} />
            <span className="inline-flex items-center justify-center min-w-[44px] h-[38px] px-2 rounded-xl text-xs font-semibold select-none peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--brand)]"
              style={on
                ? { background: "var(--brand)", color: "var(--on-brand)", border: "1px solid var(--brand)" }
                : { background: "var(--bg-inner)", color: "var(--text-3)", border: `1px solid ${bad ? BAD : "var(--border)"}` }}>
              {T.days[i]}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function GroupChip({ T, g, sentToday }) {
  if (!g) return <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{T.gUnchecked}</span>;
  const [ink, Icon, text] = g.ok ? [OK, CheckCircle2, T.gOk]
    : g.moved_to ? [WARN, AlertTriangle, fill(T.gMoved, { id: g.moved_to })]
      : g.error === "cannot_post" ? [BAD, XCircle, T.gCannot] : [BAD, XCircle, T.gNotMember];
  return (
    <span className="inline-flex items-center gap-1 text-[11px] whitespace-nowrap" style={{ color: ink }}>
      <Icon size={12} aria-hidden="true" />{text}{sentToday && <span style={{ color: "var(--text-3)" }}> · {T.gSentToday}</span>}
    </span>
  );
}

function SecretForm({ label, hint, placeholder, saveLabel, value, onChange, error, pending, onSave }) {
  return (
    <FormField label={label} hint={hint} error={error}>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSave(); }}>
        <input type="password" autoComplete="off" spellCheck={false} className={`${inputCls} flex-1 min-w-[14rem]`}
          style={inputStyle(!!error)} value={value} placeholder={placeholder} aria-label={label}
          onChange={(e) => onChange(e.target.value)} />
        <Button type="submit" size="lg" loading={pending} disabled={!value.trim() || pending}>{saveLabel}</Button>
      </form>
    </FormField>
  );
}

export default function NotionTrackerSettings() {
  const T = useNT();
  const qc = useQueryClient();
  const toast = useToast();

  const stored = useQuery({ queryKey: QK, queryFn: () => api.get("/api/admin/notion-tracker").then((r) => r.data) });
  // The live look (getMe, each group, Notion) — asked once the tab opens; it
  // answers with the whole tab, so it simply replaces the stored one.
  const live = useQuery({
    queryKey: SQK, queryFn: () => api.get("/api/admin/notion-tracker/status").then((r) => r.data),
    staleTime: 60_000, retry: false, enabled: stored.isSuccess,
  });
  const data = live.data || stored.data;
  const put = (res) => { qc.setQueryData(QK, res); qc.setQueryData(SQK, res); };

  // The draft is the saved settings until the admin changes something.
  const [edits, setEdits] = useState(null);
  const [errors, setErrors] = useState({});
  const [tokenIn, setTokenIn] = useState("");
  const [tokenErr, setTokenErr] = useState(null);
  const [notionIn, setNotionIn] = useState("");
  const [notionErr, setNotionErr] = useState(null);
  const saved = data?.settings;
  const draft = edits ?? saved;
  const dirty = !!(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved));
  useLeaveGuard(dirty || tokenIn.trim().length > 0 || notionIn.trim().length > 0);

  const edit = (patch) => { setEdits((d) => ({ ...(d ?? saved), ...patch })); setErrors({}); };
  const editRow = (key, i, patch) => edit({ [key]: draft[key].map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const dropRow = (key, i) => edit({ [key]: draft[key].filter((_, j) => j !== i) });
  const moveRow = (i, by) => {
    const team = [...draft.team];
    [team[i], team[i + by]] = [team[i + by], team[i]];
    edit({ team });
  };

  const save = useMutation({
    mutationFn: () => api.put("/api/admin/notion-tracker", draft).then((r) => r.data),
    onSuccess: (res) => { put(res); setEdits(null); setErrors({}); toast.success(T.saved); },
    onError: (e) => {
      const d = detailOf(e);
      if (d?.code === "invalid") { setErrors(d.fields || {}); toast.error(T.saveErr); } else toast.error(T.saveErr);
    },
  });
  const saveToken = useMutation({
    mutationFn: () => api.put("/api/admin/notion-tracker/token", { token: tokenIn.trim() }).then((r) => r.data),
    onSuccess: (res) => {
      put(res); setTokenIn(""); setTokenErr(null);
      toast.success(fill(T.tokenSaved, { u: res.saved_bot || "" }));
      if (data?.webhook && !res.webhook_set) toast.warning(T.tokenNoHook);
      qc.invalidateQueries({ queryKey: SQK });
    },
    onError: (e) => {
      const d = detailOf(e);
      setTokenErr(T.tokenErr[d?.code] ? fill(T.tokenErr[d.code], { m: d.message || "" }) : T.tokenErr.service.replace("{m}", ""));
    },
  });
  const saveNotion = useMutation({
    mutationFn: () => api.put("/api/admin/notion-tracker/notion-token", { token: notionIn.trim() }).then((r) => r.data),
    onSuccess: (res) => {
      put(res); setNotionIn(""); setNotionErr(null);
      toast.success(T.notionSaved);
      qc.invalidateQueries({ queryKey: SQK });
      qc.invalidateQueries({ queryKey: ["notion-tasks"] });
    },
    onError: (e) => {
      const d = detailOf(e);
      setNotionErr(T.notionErr[d?.code] ? fill(T.notionErr[d.code], { m: d.message || "" }) : T.notionErr.service.replace("{m}", ""));
    },
  });
  const preview = useMutation({
    mutationFn: () => api.post("/api/admin/notion-tracker/preview").then((r) => r.data),
    onSuccess: (res) => (res.messages ? toast.success(fill(T.previewSent, { n: res.messages })) : toast.info(T.previewNone)),
    onError: (e) => {
      const d = detailOf(e);
      const u = data?.status?.bot?.username || "Safia_Tracker_agent";
      const msg = T.previewErr[d?.code] || T.errCode[d?.code] || T.err[d?.code];
      toast.error(msg ? fill(msg, { u, m: d?.message || "", d: d?.message || "" }) : T.errLoad);
    },
  });

  const status = data?.status || {};
  const teamNames = useMemo(() => new Set((draft?.team || []).map((p) => norm(p.name))), [draft]);
  const missing = (status.notion_people || []).filter((n) => !teamNames.has(norm(n)));
  const draftIds = new Set((draft?.groups || []).map((g) => String(g.chat_id)));
  const botGroups = (data?.bot_groups || []).filter((g) => !draftIds.has(String(g.chat_id)));
  const err = (k) => (errors[k] ? T.fieldErr[errors[k]] || errors[k] : null);

  if (stored.isLoading || !draft) {
    if (stored.isError) {
      return <EmptyState tone="danger" icon={AlertTriangle} title={T.loadErr} message="" showUploadLink={false}
        action={<Button variant="secondary" onClick={() => stored.refetch()}>{T.retry}</Button>} />;
    }
    return <div className="space-y-4">{[0, 1, 2].map((i) => <SkeletonBlock key={i} className="h-40 rounded-2xl" />)}</div>;
  }

  const today = data.today || {};
  const waitKey = today.wait || "due";
  const bot = status.bot;
  const notion = status.notion;

  return (
    <div className="space-y-4 pb-4">
      {/* ── Status ── */}
      <section className="rounded-2xl overflow-hidden" style={card}>
        <SectionHead icon={Activity} title={T.aState}
          right={live.isFetching ? <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--text-3)" }}><Loader2 size={12} className="animate-spin" />{T.checking}</span> : null} />
        <div className="px-4 py-3 space-y-1">
          <div className="flex flex-wrap items-center gap-2 pb-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold"
              style={{ background: saved.enabled ? "rgba(34,197,94,0.12)" : "var(--bg-inner)", color: saved.enabled ? OK : "var(--text-2)" }}>
              {saved.enabled ? <CheckCircle2 size={12} /> : <XCircle size={12} />}{saved.enabled ? T.on : T.off}
            </span>
            <span className="text-sm" style={{ color: "var(--text-1)" }}>{fill(T.wait[waitKey], { t: saved.send_at })}</span>
          </div>
          <Line icon={Send}>
            {status.last_sent
              ? fill(T.lastSent, { at: stamp(status.last_sent.at), m: status.last_sent.messages, g: status.last_sent.groups })
              : T.neverSent}
          </Line>
          <Line icon={Bot} ink={!data.token.set || bot?.ok === false ? BAD : bot?.ok ? OK : undefined}>
            {!data.token.set ? T.botNone : bot?.ok ? fill(T.botOk, { u: bot.username }) : bot?.ok === false ? T.botBad : T.botUnknown}
          </Line>
          <Line icon={CalendarClock} ink={notion?.ok === false ? BAD : notion?.ok ? OK : undefined}>
            {notion?.ok ? fill(T.notionOk, { n: notion.tasks, o: notion.open })
              : notion ? fill(T.notionBad, { e: T.errCode[notion.code] ? fill(T.errCode[notion.code], { d: "" }) : notion.code }) : T.checking}
          </Line>
          {status.error && (
            <div className="mt-2 rounded-xl px-3 py-2 text-sm" role="alert"
              style={{ background: "rgba(234,179,8,0.10)", border: "1px solid rgba(234,179,8,0.35)", color: "var(--text-1)" }}>
              <div className="text-xs font-semibold mb-0.5" style={{ color: WARN }}>{fill(T.lastError, { at: stamp(status.error.at) })}</div>
              {fill(T.errCode[status.error.code] || "{d}", { d: status.error.detail || "" })}
            </div>
          )}
          {missing.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
              <span className="min-w-0">{fill(T.missingPeople, { names: missing.join(", ") })}</span>
              <Button size="md" variant="secondary" icon={Plus}
                onClick={() => edit({ team: [...draft.team, ...missing.map((name) => ({ name, telegram: "" }))] })}>
                {T.addThem}
              </Button>
            </div>
          )}
          <div className="pt-3 mt-2 flex flex-wrap items-center gap-3" style={{ borderTop: "1px solid var(--border)" }}>
            <Button variant="secondary" size="lg" icon={MessageSquare} loading={preview.isPending}
              disabled={preview.isPending || !data.token.set} onClick={() => preview.mutate()}>
              {T.preview}
            </Button>
            <p className="text-xs flex-1 min-w-[12rem]" style={{ color: "var(--text-3)" }}>{T.previewHint}</p>
          </div>
        </div>
      </section>

      {/* ── Schedule ── */}
      <section className="rounded-2xl overflow-hidden" style={card}>
        <SectionHead icon={CalendarClock} title={T.aSchedule} />
        <div className="px-4 py-4 grid gap-4 sm:grid-cols-2">
          <FormField label={T.fEnabled}>
            <SegmentedToggle value={draft.enabled ? "on" : "off"} onChange={(v) => edit({ enabled: v === "on" })}
              options={[["on", T.on], ["off", T.off]]} ariaLabel={T.fEnabled} />
          </FormField>
          <FormField label={T.fSendAt} hint={T.fSendAtHint} error={err("send_at")}>
            <TimeField value={draft.send_at} onChange={(v) => edit({ send_at: v })} clearable={false} className="max-w-[10rem]" />
          </FormField>
          <FormField label={T.fDays} error={err("days")}>
            <DayPicker T={T} value={draft.days} onChange={(days) => edit({ days })} bad={!!errors.days} />
          </FormField>
          <FormField label={T.fAhead} hint={T.fAheadHint} error={err("remind_days")}>
            <SegmentedToggle value={String(draft.remind_days)} onChange={(v) => edit({ remind_days: Number(v) })}
              options={[0, 1, 2, 3].map((n) => [String(n), n ? fill(T.aheadN, { n }) : T.ahead0])} ariaLabel={T.fAhead} />
          </FormField>
          <FormField label={T.fSections} hint={T.fSectionsHint}>
            <SegmentedToggle value={draft.sections_open ? "open" : "closed"} onChange={(v) => edit({ sections_open: v === "open" })}
              options={[["closed", T.secClosed], ["open", T.secOpen]]} ariaLabel={T.fSections} />
          </FormField>
        </div>
      </section>

      {/* ── Groups ── */}
      <section className="rounded-2xl overflow-hidden" style={card}>
        <SectionHead icon={MessageSquare} title={T.aGroups}
          right={<span className="tabular-nums" style={{ color: "var(--text-3)" }}>{draft.groups.length}</span>} />
        <div className="px-4 pt-3 text-xs" style={{ color: "var(--text-3)" }}>{T.groupsHint}</div>
        <ul className="px-4 py-2">
          {draft.groups.length === 0 && <li className="text-sm py-2" style={{ color: WARN }}>{T.gNone}</li>}
          {draft.groups.map((g, i) => (
            <li key={i} className="py-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-start">
              <div>
                <input className={inputCls} style={inputStyle(false)} value={g.name} placeholder={T.gName} aria-label={T.gName}
                  onChange={(e) => editRow("groups", i, { name: e.target.value })} />
                <div className="mt-1"><GroupChip T={T} g={status.groups?.[String(g.chat_id)]}
                  sentToday={(today.sent_groups || []).map(String).includes(String(g.chat_id))} /></div>
              </div>
              <div>
                <input className={`${inputCls} tabular-nums`} style={inputStyle(!!errors[`groups.${i}.chat_id`])} value={g.chat_id}
                  placeholder={T.gId} aria-label={T.gId} inputMode="numeric"
                  onChange={(e) => editRow("groups", i, { chat_id: e.target.value.trim() })} />
                <FieldError text={err(`groups.${i}.chat_id`)} />
              </div>
              <Button size="lg" variant="danger" tint icon={Trash2} aria-label={T.remove} title={T.remove}
                onClick={() => dropRow("groups", i)} />
            </li>
          ))}
        </ul>
        <div className="px-4 pb-4 flex flex-wrap items-center gap-2">
          <Button variant="secondary" icon={Plus} onClick={() => edit({ groups: [...draft.groups, { name: "", chat_id: "" }] })}>
            {T.addGroup}
          </Button>
        </div>
        <div className="px-4 py-3 text-xs" style={{ borderTop: "1px solid var(--border)", color: "var(--text-3)" }}>
          <div className="font-semibold mb-1.5">{T.botGroups}</div>
          {botGroups.length === 0 ? T.botGroupsNone : (
            <div className="flex flex-wrap gap-2">
              {botGroups.map((g) => (
                <Button key={g.chat_id} size="md" variant="secondary" icon={Plus}
                  onClick={() => edit({ groups: [...draft.groups, { name: g.title || "", chat_id: g.chat_id }] })}>
                  {g.title || g.chat_id} <span className="tabular-nums" style={{ color: "var(--text-3)" }}>· {g.chat_id}</span>
                </Button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Team ── */}
      <section className="rounded-2xl overflow-hidden" style={card}>
        <SectionHead icon={Users} title={T.aTeam}
          right={<span className="tabular-nums" style={{ color: "var(--text-3)" }}>{draft.team.length}</span>} />
        <div className="px-4 pt-3 text-xs" style={{ color: "var(--text-3)" }}>{T.teamHint}</div>
        <ol className="px-4 py-2">
          {draft.team.length === 0 && <li className="text-sm py-2" style={{ color: "var(--text-3)" }}>{T.tNone}</li>}
          {draft.team.map((p, i) => (
            <li key={i} className="py-2 grid gap-2 grid-cols-[1.5rem_minmax(0,1fr)] sm:grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start">
              <span className="text-xs tabular-nums pt-2.5 text-right" style={{ color: "var(--text-3)" }}>{i + 1}</span>
              <div>
                <input className={inputCls} style={inputStyle(!!errors[`team.${i}.name`])} value={p.name}
                  placeholder={T.tName} aria-label={T.tName} onChange={(e) => editRow("team", i, { name: e.target.value })} />
                <FieldError text={err(`team.${i}.name`)} />
              </div>
              <div className="col-start-2 sm:col-start-auto">
                <input className={inputCls} style={inputStyle(!!errors[`team.${i}.telegram`])} value={p.telegram}
                  placeholder="@username" aria-label={T.tUser} autoCapitalize="off" spellCheck={false}
                  onChange={(e) => editRow("team", i, { telegram: e.target.value.trim() })} />
                <FieldError text={err(`team.${i}.telegram`)} />
              </div>
              <div className="col-start-2 sm:col-start-auto flex gap-1">
                <Button size="lg" variant="secondary" icon={ArrowUp} aria-label={T.up} title={T.up}
                  disabled={i === 0} onClick={() => moveRow(i, -1)} />
                <Button size="lg" variant="secondary" icon={ArrowDown} aria-label={T.down} title={T.down}
                  disabled={i === draft.team.length - 1} onClick={() => moveRow(i, 1)} />
                <Button size="lg" variant="danger" tint icon={Trash2} aria-label={T.remove} title={T.remove}
                  onClick={() => dropRow("team", i)} />
              </div>
            </li>
          ))}
        </ol>
        <div className="px-4 pb-4">
          <Button variant="secondary" icon={Plus} onClick={() => edit({ team: [...draft.team, { name: "", telegram: "" }] })}>
            {T.addPerson}
          </Button>
        </div>
      </section>

      {/* ── Tokens: the bot's and Notion's ── */}
      <section className="rounded-2xl overflow-hidden" style={card}>
        <SectionHead icon={KeyRound} title={T.aToken} />
        <div className="px-4 py-4 space-y-3">
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            {data.token.set ? fill(T.tokenSet, { h: data.token.hint }) : T.tokenNone}
          </p>
          <SecretForm label={T.tokenField} hint={T.tokenHint} placeholder="123456789:AA…" saveLabel={T.tokenSave}
            value={tokenIn} onChange={(v) => { setTokenIn(v); setTokenErr(null); }} error={tokenErr}
            pending={saveToken.isPending} onSave={() => saveToken.mutate()} />
        </div>
      </section>

      <section className="rounded-2xl overflow-hidden" style={card}>
        <SectionHead icon={KeyRound} title={T.aNotion} />
        <div className="px-4 py-4 space-y-3">
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            {data.notion?.own ? fill(T.notionOwn, { h: data.notion.hint }) : T.notionPlatform}
          </p>
          <SecretForm label={T.notionField} hint={T.notionHint} placeholder="ntn_…" saveLabel={T.notionSave}
            value={notionIn} onChange={(v) => { setNotionIn(v); setNotionErr(null); }} error={notionErr}
            pending={saveNotion.isPending} onSave={() => saveNotion.mutate()} />
        </div>
      </section>

      {/* ── One Save for the draft ── */}
      {dirty && (
        <div className="sticky bottom-0 z-20 -mx-1 px-1 pb-[var(--tg-safe-bottom,0px)]">
          <div className="rounded-2xl px-4 py-3 flex flex-wrap items-center gap-2 shadow-lg" style={card}>
            <span className="text-sm flex-1 min-w-[10rem]" style={{ color: "var(--text-1)" }}>{T.dirty}</span>
            <Button variant="secondary" size="lg" onClick={() => { setEdits(null); setErrors({}); }}>{T.discard}</Button>
            <Button size="lg" loading={save.isPending} disabled={save.isPending} onClick={() => save.mutate()}>{T.save}</Button>
          </div>
        </div>
      )}
      {toast.node}
    </div>
  );
}
