import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles, KeyRound, Plus, RefreshCw, Trash2, Pencil, Check, X, AlertTriangle, Eye, EyeOff,
} from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useAdminDirty } from "./AdminPanel";
import Button from "../../components/ui/Button";
import StyledSelect from "../../components/ui/StyledSelect";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import FormField from "../../components/ui/FormField";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import TableCard, { Th } from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";

/**
 * «AI kalitlari» — every AI API key the platform holds, and which key + model
 * each feature runs on (2026-10-19, the operator: «on there we store all API
 * keys; on there we decide which feature uses which key and which model»).
 *
 * Read top to bottom the way the decision is made:
 *   1. the FEATURES — one row each (the proof checker, the assistant's chat
 *      and voice, the two weekly reports): its key, its model, whether it
 *      works right now (the last call, the last error in words) and what it
 *      spent this month. A pick is a draft on its row until «Saqlash», which
 *      first makes ONE tiny real call with the pair — a key the provider
 *      refuses or a model it does not serve is refused and nothing changes.
 *   2. the saved KEYS — who uses each, its last test, this month; tested,
 *      renamed, deleted (never while a feature runs on it).
 *   3. a NEW key — pick the AI, paste, name it; tested on the way in.
 * Everything comes off ONE payload (`GET /api/admin/ai`) and every write
 * answers with that payload again, so the page never re-derives a rule.
 * A key's value never comes back: the last four characters do.
 */

const QK = ["admin-ai"];
const inputCls = "w-full min-w-0 px-3 rounded-xl text-base md:text-sm outline-none";
const inputStyle = { height: 38, background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };
const OK = "var(--status-ok, #22c55e)";
const WARN = "var(--status-warn, #eab308)";
const BAD = "var(--status-bad, #ef4444)";
const GREY = "#94a3b8";

const fill = (tpl, vars = {}) => String(tpl || "").replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
const rawErr = (e) => e?.response?.data?.detail_raw || e?.response?.data?.detail || null;
const pad = (n) => String(n).padStart(2, "0");
const when = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const dayOf = (iso) => {
  const d = iso ? new Date(`${iso}T00:00:00`) : null;
  return d && !Number.isNaN(d.getTime()) ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}` : "";
};

function useN() {
  const { t } = useLang();
  return (n) => {
    const v = Number(n) || 0;
    if (v < 1000) return String(v);
    if (v < 1e6) return `${(v / 1000).toFixed(v < 1e4 ? 1 : 0).replace(".", ",")} ${t("aik.n.k")}`;
    return `${(v / 1e6).toFixed(1).replace(".", ",")} ${t("aik.n.m")}`;
  };
}

// «Claude · Asosiy ····a1b2» — the provider first (what the choice is made by),
// the operator's own name, the hint last. The .env key is named for where it lives.
function keyTitle(k, t) {
  if (!k) return "";
  const name = k.source === "env" ? t("aik.envName") : k.label;
  return `${k.providerLabel}${name ? ` · ${name}` : ""}${k.hint ? ` ····${k.hint}` : ""}`;
}

function modelLabel(k, id) {
  const m = (k?.models || []).find((x) => x.id === id);
  return m ? m.label : id;
}

/** What a feature's row says about it now, as {tone, label, tip}. */
function statusOf(f, t) {
  const err = f.lastError ? (t(`aik.err.${f.lastError}`) !== `aik.err.${f.lastError}`
    ? t(`aik.err.${f.lastError}`) : t("aik.err.other")) : "";
  if (f.status === "off") return { tone: GREY, label: t("aik.st.off"), tip: t("aik.st.offTip") };
  if (f.status === "broken") return { tone: BAD, label: t("aik.st.broken"), tip: t("aik.st.brokenTip") };
  if (f.status === "error") {
    return {
      tone: BAD, label: `${t("aik.st.error")} · ${err}`,
      tip: [fill(t("aik.st.errorAt"), { at: when(f.lastErrorAt) }), f.lastErrorText,
        f.lastOkAt ? fill(t("aik.st.okAt"), { at: when(f.lastOkAt) }) : ""].filter(Boolean).join("\n"),
    };
  }
  if (f.status === "ok") {
    return { tone: OK, label: t("aik.st.ok"), tip: fill(t("aik.st.okAt"), { at: when(f.lastOkAt) }) };
  }
  if (f.check && f.check.ok === false) {
    return { tone: WARN, label: t("aik.st.unchecked"), tip: f.check.note || "" };
  }
  return { tone: GREY, label: t("aik.st.unused"), tip: t("aik.st.unusedTip") };
}

function StatusCell({ s }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full" title={s.tip || undefined}>
      <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: s.tone }} />
      <span className="truncate" style={{ color: s.ink || (s.tone === GREY ? "var(--text-2)" : s.tone) }}>{s.label}</span>
    </span>
  );
}

// Why a save was refused, in words, off the endpoint's code.
const REFUSAL = { refused_key: "aik.err.key", refused_model: "aik.err.model", bad_model: "aik.err.bad_model" };

// `label` names the figure where no column header does (the phone cards).
function MonthCell({ m, n, t, label }) {
  const lead = label ? <span style={{ color: "var(--text-3)" }}>{label}: </span> : null;
  if (!m || !m.calls) return <span style={{ color: "var(--text-3)" }}>{lead}—</span>;
  const tokens = (m.tokensIn || 0) + (m.tokensOut || 0);
  return (
    <span className="tabular-nums" title={fill(t("aik.monthTip"), {
      calls: m.calls, ok: m.ok, failed: m.failed, tin: n(m.tokensIn), tout: n(m.tokensOut),
    })}>
      {lead}{fill(t("aik.monthCalls"), { n: n(m.calls) })}
      <span style={{ color: "var(--text-3)" }}> · {fill(t("aik.monthTokens"), { n: n(tokens) })}</span>
      {m.failed > 0 && <span style={{ color: BAD }}> · {fill(t("aik.monthFailed"), { n: n(m.failed) })}</span>}
    </span>
  );
}

export default function AiKeys() {
  const { t } = useLang();
  const n = useN();
  const qc = useQueryClient();
  const { show: toast, node: toastNode } = useToast({ position: "bottom" });
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: QK,
    queryFn: () => api.get("/api/admin/ai").then((r) => r.data),
  });
  const features = data?.features || [];
  const keys = data?.keys || [];
  const providers = data?.providers || [];
  const keyById = useMemo(() => Object.fromEntries(keys.map((k) => [String(k.id), k])), [keys]);
  const put = (ov) => {
    if (ov) qc.setQueryData(QK, ov);
    // The pages that read a feature's state — the AI tab's «enabled», the
    // assistant's «configured» — ask again.
    qc.invalidateQueries({ queryKey: ["leader-ai-overview"] });
    qc.invalidateQueries({ queryKey: ["leader-ai-queue"] });
    qc.invalidateQueries({ queryKey: ["assistant"] });
  };
  const featName = (id) => t(`aik.f.${id}`);

  // ── 1. drafts: a row's pick before «Saqlash» ─────────────────────────────
  // ONE «Saqlash» in the card's header saves every changed row — it stays in
  // view at any width, where a button at the end of a row scrolled off a
  // laptop's screen. Each row is still checked and saved on its own (one PUT
  // each, in table order): a refused row keeps its draft and says why ON the
  // row (`rowErr`), the others go through.
  const [drafts, setDrafts] = useState({});
  const [rowErr, setRowErr] = useState({});
  const dirtyIds = features.map((f) => f.id).filter((id) => {
    const f = features.find((x) => x.id === id);
    const d = drafts[id];
    return f && d && ((d.keyRef || null) !== (f.keyRef || null) || (d.keyRef && d.model !== f.model));
  });
  useAdminDirty(dirtyIds.length > 0);
  const cur = (f) => drafts[f.id] || { keyRef: f.keyRef || null, model: f.model || null };
  const clearErr = (id) => setRowErr((e) => { if (!e[id]) return e; const x = { ...e }; delete x[id]; return x; });

  const modelsFor = (k) => (k?.models || []);
  const defaultModel = (f, k) => {
    if (!k) return null;
    const want = f.defaults?.[k.provider];
    const list = modelsFor(k);
    if (want && list.some((m) => m.id === want)) return want;
    return providers.find((p) => p.id === k.provider)?.default || list[0]?.id || null;
  };
  const pickKey = (f, ref) => {
    const k = ref ? keyById[String(ref)] : null;
    clearErr(f.id);
    setDrafts((d) => ({ ...d, [f.id]: { keyRef: ref || null, model: k ? defaultModel(f, k) : null } }));
  };
  const pickModel = (f, model) => {
    clearErr(f.id);
    setDrafts((d) => ({ ...d, [f.id]: { ...cur(f), model } }));
  };
  const discardAll = () => { setDrafts({}); setRowErr({}); };
  // A row with a key and no model cannot be saved; the picker defaults a
  // model with the key, so this is a list the provider came back empty on.
  const incomplete = dirtyIds.some((id) => drafts[id]?.keyRef && !drafts[id]?.model);

  const [savingIds, setSavingIds] = useState([]);   // the rows one press is checking and saving
  const savingAll = savingIds.length > 0;
  const [offAsk, setOffAsk] = useState(null);   // ids a save would switch off, awaiting a confirm
  const pairText = (keysNow, ref, model) => {
    const k = keysNow.find((x) => String(x.id) === String(ref));
    return `${k?.providerLabel || ""} · ${modelLabel(k, model)}`;
  };
  // One toast for the whole press: the outcome a person needs, the per-row
  // reasons stay on the rows.
  const announce = (ok, warn, bad, keysNow) => {
    if (bad.length) {
      if (bad.length === 1 && !ok.length) {
        const b = bad[0];
        const head = b.code === "refused_key" ? t("aik.toast.refusedKey")
          : b.code === "refused_model" ? t("aik.toast.refusedModel")
          : b.code === "bad_model" ? t("aik.toast.badModel") : t("aik.toast.saveFailed");
        toast(b.message ? `${head} — ${b.message}` : head, "error");
      } else {
        toast(fill(t("aik.toast.partial"), { ok: ok.length, bad: bad.length }), "error");
      }
      return;
    }
    if (warn.length) {
      if (ok.length === 1) {
        const o = ok[0];
        toast(fill(t("aik.toast.savedUnchecked"), {
          f: featName(o.id), what: pairText(keysNow, o.d.keyRef, o.d.model), note: warn[0].note,
        }), "warning");
      } else {
        toast(fill(t("aik.toast.uncheckedMany"), {
          list: warn.map((w) => featName(w.id)).join(", "), note: warn[0].note,
        }), "warning");
      }
      return;
    }
    if (ok.length === 1) {
      const o = ok[0];
      toast(o.d.keyRef
        ? fill(t("aik.toast.saved"), { f: featName(o.id), what: pairText(keysNow, o.d.keyRef, o.d.model) })
        : fill(t("aik.toast.off"), { f: featName(o.id) }), "success");
    } else if (ok.length > 1) {
      toast(fill(t("aik.toast.savedMany"), { n: ok.length }), "success");
    }
  };
  const runSave = async (ids) => {
    setSavingIds(ids);
    const ok = []; const warn = []; const bad = [];
    let last = null;
    for (const id of ids) {
      const d = drafts[id];
      if (!d) continue;
      try {
        const res = await api.put(`/api/admin/ai/features/${id}`,
          { keyRef: d.keyRef || null, model: d.keyRef ? d.model : null }).then((r) => r.data);
        last = res.overview || last;
        ok.push({ id, d });
        if (d.keyRef && res.check?.ok === false) warn.push({ id, note: res.check.note || "" });
      } catch (e) {
        const raw = rawErr(e);
        const obj = raw && typeof raw === "object" ? raw : null;
        bad.push({ id, code: obj?.code || "", message: obj?.message || (typeof raw === "string" ? raw : "") });
      }
    }
    // Every answer carries the whole tab; the last one has every row that
    // went through already applied.
    if (last) put(last);
    setDrafts((cur0) => { const x = { ...cur0 }; ok.forEach(({ id }) => { delete x[id]; }); return x; });
    setRowErr(Object.fromEntries(bad.map((b) => [b.id, b])));
    setSavingIds([]);
    setOffAsk(null);
    announce(ok, warn, bad, last?.keys || keys);
  };
  const commitAll = () => {
    if (!dirtyIds.length || savingAll) return;
    const off = dirtyIds.filter((id) => !drafts[id]?.keyRef);
    if (off.length) { setOffAsk(off); return; }
    runSave(dirtyIds);
  };
  // What a row says while it is a draft or after its save was refused — the
  // saved pair's own status would describe a pick the screen no longer shows.
  const rowStatus = (f) => {
    if (savingIds.includes(f.id)) return { tone: GREY, label: t("aik.checking") };
    const e = rowErr[f.id];
    if (e) {
      return { tone: BAD, label: `${t("aik.refused")} · ${t(REFUSAL[e.code] || "aik.err.other")}`, tip: e.message || "" };
    }
    if (dirtyIds.includes(f.id)) {
      const k = f.keyRef ? keyById[String(f.keyRef)] : null;
      const now = k ? `${keyTitle(k, t)} · ${modelLabel(k, f.model)}` : t("aik.st.off");
      return { tone: "var(--brand)", ink: "var(--brand-text)", label: t("aik.unsaved"), tip: fill(t("aik.unsavedTip"), { what: now }) };
    }
    return statusOf(f, t);
  };

  // ── 2. keys ──────────────────────────────────────────────────────────────
  const [testing, setTesting] = useState(null);
  const test = useMutation({
    mutationFn: (id) => api.post(`/api/admin/ai/keys/${id}/test`).then((r) => r.data),
    onMutate: (id) => setTesting(id),
    onSettled: () => setTesting(null),
    onSuccess: (res) => {
      put(res.overview);
      const k = res.key;
      if (k.testOk) toast(fill(t("aik.toast.testOk"), { n: (k.models || []).length }), "success");
      else toast(fill(t("aik.toast.testFail"), { note: k.testNote || "" }), "error");
    },
    onError: () => toast(t("aik.toast.saveFailed"), "error"),
  });
  const [del, setDel] = useState(null);
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/api/admin/ai/keys/${id}`).then((r) => r.data),
    onSuccess: (res) => { put(res.overview); setDel(null); toast(t("aik.toast.deleted"), "success"); },
  });
  const delErr = (() => {
    if (!remove.error) return null;
    const d = rawErr(remove.error);
    if (d && typeof d === "object" && d.code === "in_use") {
      return fill(t("aik.del.inUse"), { list: (d.features || []).map(featName).join(", ") });
    }
    return t("aik.toast.saveFailed");
  })();

  const [ren, setRen] = useState(null);
  const [renText, setRenText] = useState("");
  const rename = useMutation({
    mutationFn: ({ id, label }) => api.put(`/api/admin/ai/keys/${id}`, { label }).then((r) => r.data),
    onSuccess: (res) => { put(res.overview); setRen(null); toast(t("aik.toast.renamed"), "success"); },
    onError: () => toast(t("aik.toast.saveFailed"), "error"),
  });

  // ── 3. a new key ─────────────────────────────────────────────────────────
  const [adding, setAdding] = useState(false);
  const [prov, setProv] = useState("gemini");
  const [keyText, setKeyText] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [label, setLabel] = useState("");
  const [addErr, setAddErr] = useState("");
  const provInfo = providers.find((p) => p.id === prov) || providers[0];
  const closeAdd = () => { setAdding(false); setKeyText(""); setLabel(""); setAddErr(""); setShowKey(false); };
  const add = useMutation({
    mutationFn: (body) => api.post("/api/admin/ai/keys", body).then((r) => r.data),
    onSuccess: (res) => {
      put(res.overview);
      closeAdd();
      const k = res.key;
      if (k.testOk) toast(fill(t("aik.toast.added"), { n: (k.models || []).length }), "success");
      else toast(fill(t("aik.toast.addedUntested"), { note: k.testNote || "" }), "warning");
    },
    // The refusal lands ON the field that caused it — a key the provider
    // rejects is a typo — never in a toast that vanishes.
    onError: (e) => {
      const d = rawErr(e);
      const code = d && typeof d === "object" ? d.code : "";
      setAddErr(code === "duplicate" ? t("aik.add.duplicate")
        : code === "key_refused" ? fill(t("aik.add.refused"), { msg: d.message || "" })
        : code === "invalid" ? t("aik.add.invalid") : t("aik.toast.saveFailed"));
    },
  });

  // ── render ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <SkeletonBlock className="h-72 rounded-2xl" />
        <SkeletonBlock className="h-48 rounded-2xl" />
      </div>
    );
  }
  if (isError) {
    return (
      <EmptyState tone="danger" icon={AlertTriangle} title={t("aik.loadFail")} message="" showUploadLink={false}
        action={<Button size="md" variant="secondary" onClick={() => refetch()}>{t("aik.retry")}</Button>} />
    );
  }

  const since = data?.month?.since;
  const first = data?.month?.first;
  const monthHead = since && first && since > first
    ? fill(t("aik.colMonthSince"), { d: dayOf(since) }) : t("aik.colMonth");

  const keyOptions = (f) => [
    { value: "", label: t("aik.keyOff") },
    ...keys.map((k) => {
      const ok = f.providers.includes(k.provider);
      return {
        value: String(k.id), label: keyTitle(k, t), disabled: !ok,
        title: ok ? keyTitle(k, t) : fill(t(`aik.why.${f.id}`) !== `aik.why.${f.id}` ? t(`aik.why.${f.id}`) : t("aik.why.provider"),
          { ai: k.providerLabel }),
      };
    }),
  ];
  // The panel names each model with its note («eng aniq», «tez»); the closed
  // control shows the model alone, so the row keeps its width.
  const modelOptions = (k) => modelsFor(k).map((m) => {
    const note = m.note ? t(`aik.note.${m.note}`) : "";
    return {
      value: m.id, title: m.id, short: m.label,
      label: note && note !== `aik.note.${m.note}`
        ? <span>{m.label} <span style={{ color: "var(--text-3)" }}>· {note}</span></span> : m.label,
    };
  });

  // One row's two pickers, shared by the table and the phone cards.
  const RowControls = ({ f, stacked }) => {
    const d = cur(f);
    const k = d.keyRef ? keyById[String(d.keyRef)] : null;
    const key = (
      <StyledSelect value={d.keyRef ? String(d.keyRef) : ""} options={keyOptions(f)}
        onChange={(v) => pickKey(f, v)} ariaLabel={fill(t("aik.aria.key"), { f: featName(f.id) })}
        triggerClassName={stacked ? "px-3 py-2 text-sm" : "px-2.5 py-1.5 text-xs"} disabled={savingAll} />
    );
    const model = (
      <StyledSelect value={d.model || ""} options={modelOptions(k)} disabled={!k || savingAll}
        placeholder={k ? t("aik.pickModel") : "—"}
        onChange={(v) => v && pickModel(f, v)} ariaLabel={fill(t("aik.aria.model"), { f: featName(f.id) })}
        triggerClassName={stacked ? "px-3 py-2 text-sm" : "px-2.5 py-1.5 text-xs"} />
    );
    return { key, model };
  };

  const featureCards = features.map((f) => {
    const c = RowControls({ f, stacked: true });
    return (
      <div key={f.id} className="rounded-2xl p-4 flex flex-col gap-3"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{featName(f.id)}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>{t(`aik.fd.${f.id}`)}</p>
        </div>
        <FormField label={t("aik.colKey")}>{c.key}</FormField>
        <FormField label={t("aik.colModel")}>{c.model}</FormField>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs min-w-0">
          <StatusCell s={rowStatus(f)} />
          <MonthCell m={f.month} n={n} t={t} label={monthHead} />
        </div>
      </div>
    );
  });

  const saveButtons = (size) => (
    <span className="inline-flex items-center gap-1.5">
      {dirtyIds.length > 0 && !savingAll && (
        <Button size={size} variant="secondary" onClick={discardAll}>{t("aik.cancel")}</Button>
      )}
      <Button size={size} variant="primary" loading={savingAll}
        disabled={!dirtyIds.length || incomplete} onClick={commitAll}>
        {dirtyIds.length ? fill(t("aik.saveN"), { n: dirtyIds.length }) : t("aik.save")}
      </Button>
    </span>
  );

  return (
    <div className="flex flex-col gap-5">
      <TableCard icon={Sparkles} title={t("aik.featuresTitle")} right={saveButtons("sm")}
        maxHeight="none" mobile={featureCards} mobileCards
        footer={(
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-3)" }}>{t("aik.featuresNote")}</p>
        )}>
        <thead>
          <tr>
            <Th label={t("aik.colFeature")} />
            <Th label={t("aik.colKey")} />
            <Th label={t("aik.colModel")} />
            <Th label={t("aik.colStatus")} />
            <Th label={monthHead} hint={t("aik.colMonthHint")} />
          </tr>
        </thead>
        <tbody>
          {features.map((f) => {
            const c = RowControls({ f, stacked: false });
            return (
              <tr key={f.id}>
                <td className="px-3 py-2 font-medium" title={t(`aik.fd.${f.id}`)}
                  style={{ color: "var(--text-1)" }}>{featName(f.id)}</td>
                <td className="px-3 py-2 min-w-[184px]">{c.key}</td>
                <td className="px-3 py-2 min-w-[150px]">{c.model}</td>
                <td className="px-3 py-2 max-w-[210px]"><StatusCell s={rowStatus(f)} /></td>
                <td className="px-3 py-2"><MonthCell m={f.month} n={n} t={t} /></td>
              </tr>
            );
          })}
        </tbody>
      </TableCard>
      {dirtyIds.length > 0 && (
        <div className="sm:hidden sticky bottom-2 z-20 flex flex-wrap items-center justify-between gap-2 px-4 py-3 rounded-2xl"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
          <span className="text-xs" style={{ color: "var(--text-2)" }}>{t("aik.unsavedBar")}</span>
          <span className="ml-auto">{saveButtons("lg")}</span>
        </div>
      )}

      <TableCard icon={KeyRound} title={t("aik.keysTitle")} maxHeight="none"
        right={(
          <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>
            {t("aik.addKey")}
          </Button>
        )}
        mobile={keys.length ? keys.map((k) => (
          <KeyCard key={k.id} k={k} t={t} n={n} featName={featName} monthHead={monthHead}
            onTest={() => test.mutate(k.id)} testing={testing === k.id}
            onRename={() => { setRen(k); setRenText(k.label || ""); }}
            onDelete={() => setDel(k)} />
        )) : null}
        mobileCards>
        {keys.length === 0 ? (
          <tbody>
            <tr>
              <td className="px-3 py-6" colSpan={5}>
                <EmptyState icon={KeyRound} title={t("aik.noKeys")} message={t("aik.noKeysBody")}
                  showUploadLink={false} height="h-32"
                  action={<Button size="md" variant="primary" icon={<Plus size={14} />}
                    onClick={() => setAdding(true)}>{t("aik.addKey")}</Button>} />
              </td>
            </tr>
          </tbody>
        ) : (
          <>
            <thead>
              <tr>
                <Th label={t("aik.colHint")} />
                <Th label={t("aik.colUsedBy")} />
                <Th label={t("aik.colTest")} />
                <Th label={monthHead} />
                <Th label="" align="right" />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const env = k.source === "env";
                const used = k.usedBy || [];
                const delWhy = env ? t("aik.del.envWhy")
                  : used.length ? fill(t("aik.del.usedWhy"), { list: used.map(featName).join(", ") }) : "";
                return (
                  <tr key={k.id}>
                    {/* Named exactly as the feature pickers name it — provider,
                        the operator's own name, the last four characters. */}
                    <td className="px-3 py-2 max-w-[260px]">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="font-medium shrink-0" style={{ color: "var(--text-1)" }}>{k.providerLabel}</span>
                        <span className="shrink-0" style={{ color: "var(--text-3)" }}>·</span>
                        <span className="truncate" title={env ? t("aik.envTip") : undefined}
                          style={{ color: k.label || env ? "var(--text-1)" : "var(--text-3)" }}>
                          {env ? t("aik.envName") : (k.label || t("aik.noName"))}
                        </span>
                        <span className="font-mono shrink-0" style={{ color: "var(--text-3)" }}>····{k.hint}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 max-w-[200px] truncate" title={used.map(featName).join(", ")}
                      style={{ color: used.length ? "var(--text-1)" : "var(--text-3)" }}>
                      {used.length ? used.map(featName).join(", ") : t("aik.unused")}
                    </td>
                    <td className="px-3 py-2"><TestCell k={k} t={t} /></td>
                    <td className="px-3 py-2"><MonthCell m={k.month} n={n} t={t} /></td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <span className="inline-flex gap-1.5">
                        <Button size="sm" variant="secondary" tint icon={<RefreshCw size={13} />}
                          title={t("aik.test")} aria-label={t("aik.test")}
                          loading={testing === k.id} onClick={() => test.mutate(k.id)} />
                        {!env && (
                          <Button size="sm" variant="secondary" tint title={t("aik.rename")} aria-label={t("aik.rename")}
                            icon={<Pencil size={13} />} onClick={() => { setRen(k); setRenText(k.label || ""); }} />
                        )}
                        <Button size="sm" variant="danger" tint title={delWhy || t("aik.delete")}
                          aria-label={t("aik.delete")} disabled={!!delWhy} icon={<Trash2 size={13} />}
                          onClick={() => setDel(k)} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </>
        )}
      </TableCard>

      {adding && (
        <Modal open onClose={closeAdd} title={t("aik.add.title")} subtitle={t("aik.add.subtitle")}
          icon={<KeyRound size={18} />} dirty={!!keyText.trim()}
          footer={(
            <>
              <Button variant="secondary" onClick={closeAdd}>{t("aik.cancel")}</Button>
              <Button variant="primary" loading={add.isPending} disabled={!keyText.trim()}
                onClick={() => add.mutate({ provider: prov, key: keyText.trim(), label: label.trim() })}>
                {add.isPending ? t("aik.checking") : t("aik.add.save")}
              </Button>
            </>
          )}>
          <FormField label={t("aik.add.ai")} required>
            <SegmentedToggle fill value={prov} options={providers.map((p) => [p.id, p.label])}
              onChange={(v) => { setProv(v); setAddErr(""); }} />
          </FormField>
          <FormField label={t("aik.add.key")} required error={addErr || undefined}
            hint={addErr ? undefined : (
              <span>
                {fill(t("aik.add.keyHint"), { where: provInfo?.vendor || "" })}{" "}
                {provInfo?.keyUrl && (
                  <a href={provInfo.keyUrl} target="_blank" rel="noreferrer" className="underline"
                    style={{ color: "var(--brand-text)" }}>{t("aik.add.getKey")}</a>
                )}
              </span>
            )}>
            <div className="flex gap-2">
              <input type={showKey ? "text" : "password"} value={keyText}
                onChange={(e) => { setKeyText(e.target.value); setAddErr(""); }}
                autoComplete="off" spellCheck={false} maxLength={400}
                placeholder={prov === "claude" ? "sk-ant-…" : "AIza…"}
                className={`${inputCls} font-mono`} style={inputStyle} />
              <Button size="lg" variant="secondary" aria-label={showKey ? t("aik.add.hide") : t("aik.add.show")}
                title={showKey ? t("aik.add.hide") : t("aik.add.show")} onClick={() => setShowKey((s) => !s)}>
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </Button>
            </div>
          </FormField>
          <FormField label={t("aik.add.name")} hint={t("aik.add.nameHint")}>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60}
              className={inputCls} style={inputStyle} />
          </FormField>
        </Modal>
      )}

      {ren && (
        <Modal open onClose={() => setRen(null)} title={t("aik.rename")} subtitle={keyTitle(ren, t)}
          icon={<Pencil size={18} />} dirty={renText !== (ren.label || "")}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setRen(null)}>{t("aik.cancel")}</Button>
              <Button variant="primary" loading={rename.isPending}
                onClick={() => rename.mutate({ id: ren.id, label: renText.trim() })}>{t("aik.save")}</Button>
            </>
          )}>
          <FormField label={t("aik.add.name")} hint={t("aik.add.nameHint")}>
            <input type="text" value={renText} onChange={(e) => setRenText(e.target.value)} maxLength={60}
              className={inputCls} style={inputStyle} />
          </FormField>
        </Modal>
      )}

      {del && (
        <ConfirmDialog tone="danger" title={t("aik.del.title")}
          message={fill(t("aik.del.body"), { what: keyTitle(del, t) })}
          confirmLabel={t("aik.delete")} loading={remove.isPending} error={delErr}
          onCancel={() => { setDel(null); remove.reset(); }}
          onConfirm={() => remove.mutate(del.id)} />
      )}

      {/* Switching a feature off stops it until somebody picks a key again,
          so the press asks first and says what stops, feature by feature. */}
      {offAsk && (
        <ConfirmDialog
          title={offAsk.length === 1 ? fill(t("aik.offAsk.title"), { f: featName(offAsk[0]) })
            : fill(t("aik.offAsk.titleMany"), { n: offAsk.length })}
          message={offAsk.length === 1 ? t(`aik.offAsk.${offAsk[0]}`) : (
            <ul className="space-y-1.5">
              {offAsk.map((id) => (
                <li key={id}>
                  <span className="font-semibold" style={{ color: "var(--text-2)" }}>{featName(id)}.</span>{" "}
                  {t(`aik.offAsk.${id}`)}
                </li>
              ))}
            </ul>
          )}
          confirmLabel={dirtyIds.length > offAsk.length ? t("aik.save") : t("aik.offAsk.confirm")}
          loading={savingAll}
          onCancel={() => setOffAsk(null)}
          onConfirm={() => runSave(dirtyIds)} />
      )}
      {toastNode}
    </div>
  );
}

function TestCell({ k, t }) {
  if (k.testOk === true) {
    return (
      <span className="inline-flex items-center gap-1" style={{ color: OK }} title={k.testNote || ""}>
        <Check size={13} /> {t("aik.testOk")}
        <span style={{ color: "var(--text-3)" }}>· {when(k.testedAt)}</span>
      </span>
    );
  }
  if (k.testOk === false) {
    return (
      <span className="inline-flex items-center gap-1 min-w-0" style={{ color: BAD }} title={k.testNote || ""}>
        <X size={13} /> {t("aik.testFail")}
        <span style={{ color: "var(--text-3)" }}>· {when(k.testedAt)}</span>
      </span>
    );
  }
  return <span style={{ color: "var(--text-3)" }}>{t("aik.untested")}</span>;
}

function KeyCard({ k, t, n, featName, monthHead, onTest, testing, onRename, onDelete }) {
  const env = k.source === "env";
  const used = k.usedBy || [];
  const delWhy = env ? t("aik.del.envWhy")
    : used.length ? fill(t("aik.del.usedWhy"), { list: used.map(featName).join(", ") }) : "";
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-2"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold min-w-0 truncate" style={{ color: "var(--text-1)" }}>
          {k.providerLabel} · {env ? t("aik.envName") : (k.label || t("aik.noName"))}
        </p>
        <span className="font-mono text-xs shrink-0" style={{ color: "var(--text-2)" }}>····{k.hint}</span>
      </div>
      <p className="text-xs" style={{ color: used.length ? "var(--text-2)" : "var(--text-3)" }}>
        {used.length ? fill(t("aik.usedByLine"), { list: used.map(featName).join(", ") }) : t("aik.unused")}
      </p>
      <div className="flex items-center justify-between gap-2 text-xs">
        <TestCell k={k} t={t} />
        <MonthCell m={k.month} n={n} t={t} label={monthHead} />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button size="lg" variant="secondary" tint icon={<RefreshCw size={14} />} loading={testing} onClick={onTest}>
          {t("aik.test")}
        </Button>
        {!env && (
          <Button size="lg" variant="secondary" tint aria-label={t("aik.rename")} onClick={onRename}>
            <Pencil size={14} />
          </Button>
        )}
        <Button size="lg" variant="danger" tint aria-label={t("aik.delete")} title={delWhy || t("aik.delete")}
          disabled={!!delWhy} onClick={onDelete}>
          <Trash2 size={14} />
        </Button>
      </div>
      {used.length > 0 && !env && <p className="text-[11px]" style={{ color: "var(--text-3)" }}>{t("aik.del.usedShort")}</p>}
    </div>
  );
}
