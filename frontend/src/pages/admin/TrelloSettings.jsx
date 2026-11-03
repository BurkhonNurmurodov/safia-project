import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  KanbanSquare, PlugZap, CheckCircle2, AlertTriangle, Info, Loader2, ExternalLink, Trash2, RefreshCw, Plus,
} from "lucide-react";
import api from "../../utils/api";
import { useLeaveGuard } from "../../hooks/useLeaveGuard";
import Button from "../../components/ui/Button";
import FormField from "../../components/ui/FormField";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import { SectionHead } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import { useTT, fill, stamp, errText, openExt } from "../../components/trello/trelloUtil";

/**
 * «Trello» — the connection the /trello page reads boards through, and the
 * boards it reads.
 *
 * A Trello API key plus a token that key issued (read-only, never expiring):
 * the token acts as its Trello member, so only boards that member can open
 * are read. The token goes in and never comes out — the server says only
 * whether one is stored, and a blank field keeps it.
 *
 * Each board carries two settings that decide what «done» means on the page:
 * which lists are «done» (picked here, or recognised by name), and whether an
 * archived card counts as finished.
 *
 * Admin-only and never grantable (no capKey in ADMIN_NAV).
 */

const QK = ["admin-trello"];
const inputCls = "w-full px-3 py-2 rounded-xl text-sm outline-none";
const inputStyle = { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };
const card = { background: "var(--bg-card)", border: "1px solid var(--border)" };
const GREEN = "#22c55e";
const AMBER = "#eab308";

const detailOf = (e) => e?.response?.data?.detail;

function BoardRow({ b, T, onSet, onRemove, busy }) {
  const auto = b.done_lists == null;
  const done = new Set((b.lists || []).filter((l) => l.done).map((l) => l.id));
  const toggle = (id) => {
    const next = new Set(done);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSet({ done_lists: [...next] });
  };
  return (
    <li className="px-4 py-3 space-y-3" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>{b.name || b.id}</span>
            {b.url && (
              <a href={b.url} target="_blank" rel="noopener noreferrer" onClick={(e) => openExt(e, b.url)}
                title={T.bOpen} aria-label={T.bOpen} className="flex-shrink-0" style={{ color: "var(--text-3)" }}>
                <ExternalLink size={13} />
              </a>
            )}
          </div>
          <div className="text-xs mt-0.5 tabular-nums" style={{ color: "var(--text-3)" }}>
            {b.read_at ? fill(T.bRead, { at: stamp(b.read_at) }) : T.bNever}
            {b.cards != null && ` · ${fill(T.bCards, { n: b.cards })}`}
          </div>
          {b.error && (
            <div className="text-xs mt-1 flex items-start gap-1.5" style={{ color: "var(--status-warn)" }}>
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
              <span>{fill(T.bError, { e: errText(T, b.error) })}</span>
            </div>
          )}
        </div>
        <Button size="md" variant="danger" tint onClick={onRemove} disabled={busy} aria-label={T.bRemove} title={T.bRemove}>
          <Trash2 size={13} />
        </Button>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
          <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-3)" }}>{T.bDone}</span>
          {b.lists?.length > 0 && (
            <button type="button" disabled={busy || auto} onClick={() => onSet({ done_auto: true })}
              className="text-[11px] underline underline-offset-2 disabled:no-underline disabled:opacity-60"
              style={{ color: auto ? "var(--text-3)" : "var(--brand-text)" }}>
              {auto ? T.bDoneAutoOn : T.bDoneAuto}
            </button>
          )}
        </div>
        {b.lists?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {b.lists.map((l) => {
              const on = done.has(l.id);
              return (
                <button key={l.id} type="button" disabled={busy} aria-pressed={on} onClick={() => toggle(l.id)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs min-h-[34px] transition-colors"
                  style={{
                    background: on ? `${GREEN}1f` : "var(--bg-inner)",
                    border: `1px solid ${on ? `${GREEN}66` : "var(--border)"}`,
                    color: on ? "var(--status-ok)" : "var(--text-2)",
                  }}>
                  {on && <CheckCircle2 size={12} />}
                  <span className="max-w-[180px] truncate">{l.name || "·"}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs" style={{ color: "var(--text-4)" }}>{T.bListsAfterRead}</p>
        )}
        {b.lists?.length > 0 && <p className="text-[11px] mt-1.5" style={{ color: "var(--text-3)" }}>{T.bDoneHint}</p>}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-3)" }}>{T.bArchived}</span>
        <SegmentedToggle size="sm" value={b.archived_done ? "done" : "out"}
          onChange={(v) => onSet({ archived_done: v === "done" })}
          options={[["done", T.bArchivedDone], ["out", T.bArchivedOut]]} ariaLabel={T.bArchived} />
      </div>
    </li>
  );
}

export default function TrelloSettings() {
  const T = useTT();
  const qc = useQueryClient();
  const { show: toast, node: toastNode } = useToast({ position: "bottom" });

  const { data, isLoading } = useQuery({
    queryKey: QK,
    queryFn: () => api.get("/api/admin/trello").then((r) => r.data),
    // While a read runs, follow it so each board's line updates by itself.
    refetchInterval: (q) => (q.state.data?.running ? 3000 : false),
  });

  const [key, setKey] = useState("");
  const [token, setToken] = useState("");
  const [link, setLink] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearErr, setClearErr] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [removeErr, setRemoveErr] = useState(null);
  const [linkErr, setLinkErr] = useState(null);

  useEffect(() => { if (data) setKey(data.key || ""); }, [data?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = !!data && (key.trim() !== (data.key || "") || token.length > 0);
  useLeaveGuard(dirty || link.trim().length > 0);

  const msgOf = (e) => {
    const d = detailOf(e);
    if (typeof d === "string") return d;
    if (d?.code) return errText(T, d.code, { n: data?.max_boards ?? 12 });
    return String(e?.message || e);
  };

  const save = useMutation({
    mutationFn: (body) => api.put("/api/admin/trello", body).then((r) => r.data),
    onSuccess: (res) => { setToken(""); qc.setQueryData(QK, res); toast(T.aSaved, "success"); },
    onError: (e) => toast(msgOf(e), "error"),
  });
  const clear = useMutation({
    mutationFn: () => api.put("/api/admin/trello", { clear_token: true }).then((r) => r.data),
    onSuccess: (res) => { setToken(""); setConfirmClear(false); qc.setQueryData(QK, res); toast(T.aCleared, "success"); },
    onError: (e) => setClearErr(msgOf(e)),
  });
  const test = useMutation({
    mutationFn: () => api.post("/api/admin/trello/test").then((r) => r.data),
    onSuccess: (res) => qc.setQueryData(QK, res),
    onError: (e) => toast(msgOf(e), "error"),
  });
  const add = useMutation({
    mutationFn: () => api.post("/api/admin/trello/boards", { link: link.trim() }).then((r) => r.data),
    onSuccess: (res) => { setLink(""); setLinkErr(null); qc.setQueryData(QK, res); qc.invalidateQueries({ queryKey: ["trello"] }); toast(T.bAdded, "success"); },
    onError: (e) => setLinkErr(msgOf(e)),
  });
  const setBoard = useMutation({
    mutationFn: ({ id, body }) => api.put(`/api/admin/trello/boards/${id}`, body).then((r) => r.data),
    onSuccess: (res) => { qc.setQueryData(QK, res); qc.invalidateQueries({ queryKey: ["trello"] }); toast(T.bSet, "success"); },
    onError: (e) => toast(msgOf(e), "error"),
  });
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/api/admin/trello/boards/${id}`).then((r) => r.data),
    onSuccess: (res) => { setRemoving(null); setRemoveErr(null); qc.setQueryData(QK, res); qc.invalidateQueries({ queryKey: ["trello"] }); toast(T.bRemoved, "success"); },
    onError: (e) => setRemoveErr(msgOf(e)),
  });
  const readAll = useMutation({
    mutationFn: () => api.post("/api/trello/read").then((r) => r.data),
    onSuccess: (r) => { toast(r.started ? T.readStarted : T.readBusy, "info"); qc.invalidateQueries({ queryKey: QK }); },
    onError: (e) => toast(msgOf(e), "error"),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-80 rounded-2xl" />
        <SkeletonBlock className="h-48 rounded-2xl" />
      </div>
    );
  }

  const keyOk = /^[0-9a-fA-F]{32}$/.test(key.trim());
  const tokenUrl = keyOk
    ? `https://trello.com/1/authorize?expiration=never&scope=read&response_type=token&name=${encodeURIComponent("Safia IMS")}&key=${key.trim()}`
    : null;
  const configured = !!data.key && data.token_set && data.token_readable !== false;
  const last = data.test || data.last_test;
  const boards = data.boards || [];
  const full = boards.length >= (data.max_boards || 12);

  return (
    <div className="space-y-4">
      {/* ── the connection ─────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={card}>
        <SectionHead icon={KanbanSquare} title={T.aTitle} />
        <div className="p-4 sm:p-5 space-y-4">
          <p className="text-[13px] leading-relaxed flex gap-2" style={{ color: "var(--text-3)" }}>
            <Info size={15} className="mt-0.5 flex-shrink-0" />
            <span>{T.aExplain}</span>
          </p>
          <ol className="text-[13px] leading-relaxed space-y-1 list-decimal pl-5" style={{ color: "var(--text-2)" }}>
            <li>{T.aStep1}</li>
            <li>{T.aStep2}</li>
            <li>{T.aStep3}</li>
          </ol>

          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label={T.aKey} required hint={T.aKeyHint}
              error={key.trim() && !keyOk ? T.aKeyHint : undefined}>
              <input value={key} onChange={(e) => setKey(e.target.value)}
                autoComplete="off" spellCheck={false} className={`${inputCls} font-mono`} style={inputStyle} />
            </FormField>
            <FormField label={T.aToken} required
              hint={data.token_readable === false ? undefined : T.aTokenHint}
              error={data.token_readable === false ? T.aTokenUnreadable : undefined}>
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)}
                autoComplete="new-password" spellCheck={false}
                placeholder={data.token_set ? T.aTokenKeep : ""} className={`${inputCls} font-mono`} style={inputStyle} />
            </FormField>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button size="lg" variant="primary" loading={save.isPending} disabled={!dirty || (key.trim() && !keyOk)}
              onClick={() => save.mutate({ key: key.trim(), ...(token ? { token: token.trim() } : {}) })}>
              {T.aSave}
            </Button>
            {tokenUrl && (
              <a href={tokenUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => openExt(e, tokenUrl)}
                className="inline-flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl text-sm font-medium"
                style={{ border: "1px solid var(--border)", color: "var(--brand-text)" }} title={T.aGetTokenHint}>
                <ExternalLink size={14} /> {T.aGetToken}
              </a>
            )}
            {data.token_set && (
              <Button size="lg" variant="ghost" onClick={() => setConfirmClear(true)}>{T.aClear}</Button>
            )}
          </div>
        </div>
      </div>

      {/* ── the test ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={card}>
        <SectionHead icon={PlugZap} title={T.aTestTitle}
          right={(
            <Button size="md" variant="secondary" loading={test.isPending}
              disabled={!configured || dirty || test.isPending} onClick={() => test.mutate()}>
              {T.aTest}
            </Button>
          )} />
        <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>
          {test.isPending ? (
            <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> {T.aTesting}</span>
          ) : dirty ? T.aSaveFirst : !configured ? T.aNeedBoth : !last ? T.aNever : null}
        </div>
        {last && !test.isPending && !dirty && (
          <div className="mx-4 mb-4 rounded-xl px-3 py-2.5 text-sm flex items-start gap-2"
            style={{ background: `${last.ok ? GREEN : AMBER}14`, border: `1px solid ${last.ok ? GREEN : AMBER}55`, color: "var(--text-1)" }}>
            {last.ok
              ? <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" style={{ color: GREEN }} />
              : <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" style={{ color: AMBER }} />}
            <div className="min-w-0">
              <div>{last.ok ? fill(T.aTestOk, { who: last.who || last.username || "—" }) : fill(T.aTestFail, { e: errText(T, last.error) })}</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>{fill(T.aLastTest, { at: stamp(last.at) })}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── the boards ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={card}>
        <SectionHead icon={KanbanSquare} title={T.bTitle}
          right={boards.length > 0 ? (
            <Button size="md" variant="secondary" loading={readAll.isPending || data.running}
              disabled={!configured} onClick={() => readAll.mutate()}>
              <RefreshCw size={13} /> {T.bReadAll}
            </Button>
          ) : null} />
        <div className="p-4 space-y-3">
          <p className="text-[13px]" style={{ color: "var(--text-3)" }}>{T.bExplain}</p>
          <FormField label={T.bLink} error={linkErr || undefined}>
            <div className="flex gap-2">
              <input value={link} onChange={(e) => { setLink(e.target.value); setLinkErr(null); }}
                onKeyDown={(e) => { if (e.key === "Enter" && link.trim() && configured && !full) add.mutate(); }}
                autoComplete="off" spellCheck={false} placeholder={T.bLinkPh}
                className={`${inputCls} font-mono`} style={inputStyle} />
              <Button size="lg" variant="primary" loading={add.isPending}
                disabled={!link.trim() || !configured || full} onClick={() => add.mutate()}>
                <Plus size={14} /> {T.bAdd}
              </Button>
            </div>
          </FormField>
          {!configured && <p className="text-xs" style={{ color: "var(--text-3)" }}>{T.aNeedBoth}</p>}
          {full && <p className="text-xs" style={{ color: "var(--text-3)" }}>{errText(T, "too_many", { n: data.max_boards })}</p>}
        </div>
        {boards.length ? (
          <ul>
            {boards.map((b) => (
              <BoardRow key={b.id} b={b} T={T} busy={setBoard.isPending}
                onSet={(body) => setBoard.mutate({ id: b.id, body })}
                onRemove={() => { setRemoveErr(null); setRemoving(b); }} />
            ))}
          </ul>
        ) : (
          <div className="px-4 pb-4 text-xs" style={{ color: "var(--text-4)" }}>{T.bNone}</div>
        )}
      </div>

      <ConfirmDialog
        open={confirmClear}
        tone="danger"
        title={T.aClearTitle}
        message={T.aClearBody}
        confirmLabel={T.aClear}
        loading={clear.isPending}
        error={clearErr}
        onCancel={() => { setConfirmClear(false); setClearErr(null); }}
        onConfirm={() => { setClearErr(null); clear.mutate(); }}
      />
      <ConfirmDialog
        open={!!removing}
        tone="danger"
        title={T.bRemoveTitle}
        message={fill(T.bRemoveBody, { name: removing?.name || removing?.id || "" })}
        confirmLabel={T.bRemove}
        loading={remove.isPending}
        error={removeErr}
        onCancel={() => { setRemoving(null); setRemoveErr(null); }}
        onConfirm={() => { setRemoveErr(null); remove.mutate(removing.id); }}
      />
      {toastNode}
    </div>
  );
}
