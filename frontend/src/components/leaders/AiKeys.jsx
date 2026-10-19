// The proof reviewer's AI settings — WHICH key and WHICH model it runs on, and
// the keys saved for it (2026-10-19, the operator's request: several API keys,
// saved, switched at any time; the model picked per AI).
//
// Read top to bottom the way the operator thinks: 1) what the review runs on
// NOW — one key, one model of that key's provider, «Qo'llash» — 2) the keys
// saved so far, each testable, the active one unremovable — 3) adding a key:
// pick the AI, paste the key, save (it is tested on the way in).
// Everything comes off ONE payload (`GET /api/leader-ai/key`); nothing about
// providers or models is known to this file — the server's catalog is.
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { KeyRound, Plus, RefreshCw, Sparkles, Trash2, Check, X } from "lucide-react";
import Button from "../ui/Button";
import StyledSelect from "../ui/StyledSelect";
import SegmentedToggle from "../ui/SegmentedToggle";
import FormField from "../ui/FormField";
import ConfirmDialog from "../ui/ConfirmDialog";
import TableCard, { Th, SectionHead } from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import { SkeletonBlock } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";
import api from "../../utils/api";

const Q = ["leader-ai-key"];
const inputCls = "w-full min-w-0 px-3 rounded-xl text-sm outline-none";
const inputStyle = { height: 38, background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };

const fmt = (tpl, vars) => String(tpl || "").replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
const errText = (e) => e?.response?.data?.detail || e?.message || String(e);
const when = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

// «Claude · Asosiy ····a1b2» — the provider first (it is what the operator
// picks by), the operator's own name when they gave one, the hint last.
function keyTitle(k, T) {
  const name = k.source === "env" ? T.aiEnvName : k.label;
  return `${k.providerLabel}${name ? ` · ${name}` : ""}${k.hint ? ` ····${k.hint}` : ""}`;
}

// The model's printed name, from the key's own option list — never the bare id
// where the catalog knows a name.
function modelName(k, id) {
  const m = (k?.models || []).find((x) => x.id === id);
  return m ? m.label : id;
}

const noteOf = (T, m) => (m.note && T[`aiNote_${m.note}`]) || "";

export default function KeySetup({ T, qc, embedded = false }) {
  const { show: toast, node } = useToast({ position: "bottom" });
  const { data: st, isLoading, isError, refetch } = useQuery({
    queryKey: Q,
    queryFn: () => api.get("/api/leader-ai/key").then((r) => r.data),
  });
  const keys = st?.keys || [];
  const providers = st?.providers || [];
  const active = st?.active || null;

  const invalidate = () => {
    // The tab badge, the queue and the register strip all read `enabled`.
    qc.invalidateQueries({ queryKey: Q });
    qc.invalidateQueries({ queryKey: ["leader-ai-overview"] });
    qc.invalidateQueries({ queryKey: ["leader-ai-queue"] });
  };

  // ── 1. the pair in use ─────────────────────────────────────────────────────
  // `pick` is the pair the operator is composing; null means «what the server
  // says». Kept apart from the query so a refetch under their hands (window
  // focus) never snaps a half-made choice back.
  const [pick, setPick] = useState(null);
  const cur = pick || (active ? { keyId: active.keyId, model: active.model } : null);
  const curKey = keys.find((k) => String(k.id) === String(cur?.keyId));
  const keyOpts = keys.map((k) => ({ value: String(k.id), label: keyTitle(k, T), title: keyTitle(k, T) }));
  const modelOpts = (curKey?.models || []).map((m) => {
    const note = noteOf(T, m);
    return {
      value: m.id, title: m.id,
      label: note ? <span>{m.label} <span style={{ color: "var(--text-3)" }}>· {note}</span></span> : m.label,
    };
  });
  const onPickKey = (v) => {
    const k = keys.find((x) => String(x.id) === String(v));
    if (!k) return;
    // A key remembers the model last picked for it; a new one opens on its
    // provider's default — never on the OTHER provider's model.
    const def = providers.find((p) => p.id === k.provider)?.default || "";
    setPick({ keyId: k.id, model: k.model || def });
  };
  const dirty = !!cur && (!active || String(cur.keyId) !== String(active.keyId) || cur.model !== active.model);
  const describe = (a) => {
    const k = keys.find((x) => String(x.id) === String(a.keyId));
    return `${a.providerLabel || k?.providerLabel || ""} · ${modelName(k, a.model)}${a.hint ? ` · ····${a.hint}` : ""}`;
  };
  const apply = useMutation({
    mutationFn: (body) => api.put("/api/leader-ai/active", body).then((r) => r.data),
    onSuccess: (res) => {
      setPick(null);
      toast(fmt(T.aiActiveSaved, { what: describe(res.active) }), "success");
      invalidate();
    },
    onError: (e) => toast(errText(e), "error"),
  });
  const activeKey = keys.find((k) => String(k.id) === String(active?.keyId));

  // ── 2. the saved keys ──────────────────────────────────────────────────────
  const [testing, setTesting] = useState(null);
  const test = useMutation({
    mutationFn: (id) => api.post(`/api/leader-ai/keys/${id}/test`).then((r) => r.data),
    onMutate: (id) => setTesting(id),
    onSettled: () => setTesting(null),
    onSuccess: (res) => {
      const k = res.key;
      toast(k.testOk ? T.aiTestOkToast : `${T.aiTestFailToast}: ${k.testNote || ""}`, k.testOk ? "success" : "error");
      invalidate();
    },
    onError: (e) => toast(errText(e), "error"),
  });
  const [del, setDel] = useState(null);
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/api/leader-ai/keys/${id}`).then((r) => r.data),
    onSuccess: () => { setDel(null); toast(T.aiKeyDeleted, "success"); invalidate(); },
  });
  const delErr = remove.error
    ? (errText(remove.error) === "active" ? T.aiCantDeleteActive : errText(remove.error))
    : null;

  // ── 3. adding a key ────────────────────────────────────────────────────────
  const [adding, setAdding] = useState(false);
  const [prov, setProv] = useState("gemini");
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [label, setLabel] = useState("");
  const [addErr, setAddErr] = useState("");
  const provInfo = providers.find((p) => p.id === prov) || providers[0];
  const add = useMutation({
    mutationFn: (body) => api.post("/api/leader-ai/keys", body).then((r) => r.data),
    onSuccess: (res) => {
      setKey(""); setLabel(""); setAddErr(""); setShow(false); setAdding(false);
      toast(res.activated ? T.aiKeyAddedActive : T.aiKeyAdded, "success");
      invalidate();
    },
    // The refusal lands ON the field that caused it (a key the provider
    // rejected is a typo), never in a toast that vanishes.
    onError: (e) => setAddErr(errText(e)),
  });
  // With nothing saved the form IS the page: the first key is one paste away.
  const noKeys = !isLoading && !isError && keys.length === 0;
  useEffect(() => { if (noKeys) setAdding(true); }, [noKeys]);

  const Section = ({ title, children }) => (
    <section className="flex flex-col gap-2">
      <h3 className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>{title}</h3>
      {children}
    </section>
  );

  let body;
  if (isLoading) {
    body = <SkeletonBlock className="h-48 rounded-2xl" />;
  } else if (isError) {
    body = (
      <EmptyState icon={X} title={T.aiLoadFail} message="" showUploadLink={false} height="h-32"
        action={<Button size="md" variant="secondary" onClick={() => refetch()}>{T.aiRetry}</Button>} />
    );
  } else {
    body = (
      <div className="flex flex-col gap-5">
        {!embedded && (
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-3)" }}>{T.aiOffBody}</p>
        )}

        {/* 1 — what runs now */}
        <Section title={T.aiUseTitle}>
          {keys.length ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label={T.aiUseKey}>
                  <StyledSelect value={cur ? String(cur.keyId) : ""} options={keyOpts}
                    placeholder={T.aiPickKey} onChange={onPickKey} />
                </FormField>
                <FormField label={T.aiUseModel}
                  hint={curKey ? (curKey.provider === "claude" ? T.aiModelHintClaude : T.aiModelHint) : undefined}>
                  <StyledSelect value={cur?.model || ""} options={modelOpts} disabled={!curKey}
                    onChange={(v) => v && cur && setPick({ keyId: cur.keyId, model: v })} />
                </FormField>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Button size="lg" variant="primary" disabled={!dirty || !cur?.model}
                  loading={apply.isPending}
                  onClick={() => apply.mutate({ keyId: cur.keyId, model: cur.model })}>
                  {T.aiApply}
                </Button>
                <span className="text-xs" style={{ color: "var(--text-3)" }}>
                  {active ? fmt(T.aiActiveNow, { what: describe(active) }) : T.aiActiveNone}
                </span>
              </div>
              {activeKey && activeKey.testOk === false && (
                <p className="text-[11px] leading-relaxed" style={{ color: "#eab308" }}>
                  {fmt(T.aiActiveBroken, { note: activeKey.testNote || "" })}
                </p>
              )}
            </>
          ) : (
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-3)" }}>{T.aiNoKeys}</p>
          )}
        </Section>

        {/* 2 — the saved keys */}
        {keys.length > 0 && (
          <TableCard icon={KeyRound} title={T.aiKeysTitle} maxHeight="40vh"
            right={!adding && (
              <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
                <Plus size={14} /> {T.aiAdd}
              </Button>
            )}>
            <thead>
              <tr>
                <Th label={T.aiColAi} cls="hidden sm:table-cell" />
                <Th label={T.aiColName} />
                <Th label={T.aiColStatus} />
                <Th label="" align="right" />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const isActive = String(k.id) === String(active?.keyId);
                const name = k.source === "env" ? T.aiEnvName : k.label;
                return (
                  <tr key={k.id}>
                    <td className="px-3 py-2 hidden sm:table-cell whitespace-nowrap font-medium"
                      style={{ color: "var(--text-1)" }}>{k.providerLabel}</td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-1)" }}>
                      <span className="sm:hidden font-medium">{k.providerLabel}{name ? " · " : ""}</span>
                      {name}
                      {k.hint && (
                        <span className="font-mono text-xs ml-1.5" style={{ color: "var(--text-3)" }}>····{k.hint}</span>
                      )}
                      {isActive && (
                        <span className="ml-2 align-middle inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase"
                          style={{ background: "rgba(var(--brand-rgb), 0.14)", color: "var(--brand-text)" }}>
                          {T.aiActiveChip}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs" title={k.testNote || ""}>
                      {k.testOk === true ? (
                        <span className="inline-flex items-center gap-1" style={{ color: "#22c55e" }}>
                          <Check size={13} /> {T.aiStatusOk}
                          <span style={{ color: "var(--text-3)" }}>· {when(k.testedAt)}</span>
                        </span>
                      ) : k.testOk === false ? (
                        <span className="inline-flex items-center gap-1" style={{ color: "#ef4444" }}>
                          <X size={13} /> {T.aiStatusFail}
                          <span style={{ color: "var(--text-3)" }}>· {when(k.testedAt)}</span>
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-3)" }}>{T.aiUntested}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <span className="inline-flex gap-1.5">
                        <Button size="sm" variant="secondary" tint title={T.aiTest} aria-label={T.aiTest}
                          loading={testing === k.id} onClick={() => test.mutate(k.id)}>
                          <RefreshCw size={14} />
                        </Button>
                        <Button size="sm" variant="danger" tint title={isActive ? T.aiCantDeleteActive : k.source === "env" ? T.aiEnvManaged : T.aiDelete}
                          aria-label={T.aiDelete} disabled={isActive || k.source === "env"}
                          onClick={() => setDel(k)}>
                          <Trash2 size={14} />
                        </Button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableCard>
        )}

        {/* 3 — add a key: pick the AI, paste, save */}
        {adding && (
          <section className="rounded-xl p-3 flex flex-col gap-3"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
            <div className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{T.aiAddTitle}</div>
            <FormField label={T.aiAddAi} required>
              <SegmentedToggle fill value={prov}
                options={providers.map((p) => [p.id, p.label])}
                onChange={(v) => { setProv(v); setAddErr(""); }} />
            </FormField>
            <FormField label={T.aiAddKey} required error={addErr || undefined}
              hint={addErr ? undefined : fmt(T.aiAddHint, { where: provInfo?.vendor || "" })}>
              <div className="flex gap-2">
                <input type={show ? "text" : "password"} value={key}
                  onChange={(e) => { setKey(e.target.value); setAddErr(""); }}
                  autoComplete="off" spellCheck={false}
                  placeholder={prov === "claude" ? "sk-ant-…" : "AIza…"}
                  className={`${inputCls} font-mono`} style={inputStyle} />
                <Button size="lg" variant="secondary" onClick={() => setShow((s) => !s)}>
                  {show ? T.aiKeyHide : T.aiKeyShow}
                </Button>
              </div>
            </FormField>
            <FormField label={T.aiAddName} hint={T.aiAddNameHint}>
              <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
                maxLength={60} className={inputCls} style={inputStyle} />
            </FormField>
            <div className="flex justify-end gap-2">
              {keys.length > 0 && (
                <Button size="lg" variant="secondary"
                  onClick={() => { setAdding(false); setAddErr(""); setKey(""); setShow(false); }}>
                  {T.aiCancel}
                </Button>
              )}
              <Button size="lg" variant="primary" loading={add.isPending} disabled={!key.trim()}
                onClick={() => add.mutate({ provider: prov, key: key.trim(), label: label.trim() })}>
                {T.aiAddSave}
              </Button>
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <>
      {embedded ? body : (
        <div className="rounded-2xl overflow-hidden max-w-2xl"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SectionHead icon={Sparkles} title={T.aiOffTitle} />
          <div className="p-4">{body}</div>
        </div>
      )}
      {del && (
        <ConfirmDialog tone="danger" title={T.aiDelTitle}
          message={fmt(T.aiDelBody, { what: keyTitle(del, T) })}
          confirmLabel={T.aiDelete} loading={remove.isPending} error={delErr}
          onCancel={() => { setDel(null); remove.reset(); }}
          onConfirm={() => remove.mutate(del.id)} />
      )}
      {node}
    </>
  );
}
