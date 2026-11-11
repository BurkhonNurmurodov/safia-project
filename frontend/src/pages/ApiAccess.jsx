import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Copy, Check, BookOpen, Download, Trash2 } from "lucide-react";
import api, { detailToText } from "../utils/api";
import { useLang } from "../context/LangContext";
import { useAuth } from "../context/AuthContext";
import { copyText } from "../utils/copyText";
import { exportXlsx } from "../utils/exportXlsx";
import Layout from "../components/layout/Layout";
import TableCard, { SectionHead, Th } from "../components/ui/DataTable";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import FormField from "../components/ui/FormField";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import ActionMenu from "../components/ui/ActionMenu";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";

/**
 * «API» (/tokens) — a person's own tokens for the external read API
 * (/api/ext/v1) and its manual. GitHub's model: name a token, pick how long
 * it lives, copy it once. The server keeps a digest only, so the page can
 * never show a token again (routers/api_tokens.py, docs/ext-api.md).
 */
const MANUAL_LANGS = [["uz", "O'zbekcha"], ["uz_cyrl", "Ўзбекча"], ["ru", "Русский"], ["en", "English"]];
const p2 = (n) => String(n).padStart(2, "0");
const day = (iso) => { const d = new Date(iso); return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}`; };
const stamp = (iso) => { const d = new Date(iso); return `${day(iso)} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const errOf = (e, t) => detailToText(e?.response?.data?.detail) || t("apiAccess.failed");

export default function ApiAccess() {
  const { t, lang } = useLang();
  const admin = useAuth()?.auth?.role === "admin";
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(null);       // {name, days} while the create dialog is open
  const [made, setMade] = useState(null);       // the token just made — shown once
  const [copied, setCopied] = useState(false);
  const [revoke, setRevoke] = useState(null);
  const [docLang, setDocLang] = useState(MANUAL_LANGS.some(([c]) => c === lang) ? lang : "ru");
  const [busy, setBusy] = useState(null);       // "pdf" | "md" while a manual is on its way

  const { data, isLoading } = useQuery({
    queryKey: ["api-tokens"],
    queryFn: () => api.get("/api/api-tokens").then((r) => r.data),
  });
  const rows = data?.tokens || [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["api-tokens"] });

  const create = useMutation({
    mutationFn: (body) => api.post("/api/api-tokens", body).then((r) => r.data),
    onSuccess: (res) => { setForm(null); setCopied(false); setMade(res); refresh(); },
  });
  const drop = useMutation({
    mutationFn: (row) => api.delete(`/api/api-tokens/${row.id}`).then((r) => r.data),
    onSuccess: () => { setRevoke(null); refresh(); toast.success(t("apiAccess.revoked")); },
  });

  const copy = async () => {
    const ok = await copyText(made?.token);
    setCopied(ok);
    if (!ok) toast.error(t("apiAccess.copyFailed"));
  };

  const manual = async (format) => {
    setBusy(format);
    try {
      const how = await exportXlsx("/api/api-tokens/manual", {
        method: "get", params: { lang: docLang, format },
        fallbackName: `safia-ims-api-${docLang}.${format}`,
      });
      toast.success(t(how === "download" ? "apiAccess.downloaded" : "apiAccess.sentToChat"));
    } catch (e) {
      toast.error(errOf(e, t));
    } finally {
      setBusy(null);
    }
  };

  const cols = admin ? 7 : 6;
  const dayOptions = (data?.days || [30, 90, 365]).map((d) =>
    [d, d === 365 ? t("apiAccess.year") : t("apiAccess.days").replace("{n}", d)]);

  return (
    <Layout title={t("nav.api")}>
      <div className="space-y-4">
        <TableCard
          icon={KeyRound}
          title={t("apiAccess.tokens")}
          right={<span className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{rows.length}</span>}
          toolbar={(
            <>
              <span className="text-xs min-w-0" style={{ color: "var(--text-3)" }}>{t("apiAccess.tokensHint")}</span>
              <Button size="lg" className="ml-auto" icon={Plus} onClick={() => { create.reset(); setForm({ name: "", days: 90 }); }}>
                {t("apiAccess.create")}
              </Button>
            </>
          )}
        >
          <thead>
            <tr>
              <Th label={t("apiAccess.colName")} />
              <Th label={t("apiAccess.colToken")} />
              {admin && <Th label={t("apiAccess.colOwner")} />}
              <Th label={t("apiAccess.colCreated")} />
              <Th label={t("apiAccess.colExpires")} />
              <Th label={t("apiAccess.colUsed")} />
              <Th label="" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(2)].map((_, i) => (
                <tr key={i}><td colSpan={cols} className="px-3 py-2.5"><SkeletonBlock className="h-4 w-full" /></td></tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={cols} className="px-3 py-8 text-center text-sm whitespace-normal" style={{ color: "var(--text-3)" }}>
                  {t("apiAccess.empty")}
                </td>
              </tr>
            ) : rows.map((r) => {
              const expired = r.state === "expired";
              return (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-semibold max-w-[260px] truncate" title={r.name}>{r.name}</td>
                  <td className="px-3 py-2 font-mono" style={{ color: "var(--text-2)" }}>{r.prefix}…</td>
                  {admin && <td className="px-3 py-2 max-w-[220px] truncate" title={r.owner || ""}>{r.owner || "—"}</td>}
                  <td className="px-3 py-2 tabular-nums">{day(r.created_at)}</td>
                  <td className="px-3 py-2 tabular-nums" style={expired ? { color: "#ef4444", fontWeight: 600 } : undefined}>
                    {day(r.expires_at)}{expired ? ` · ${t("apiAccess.expired")}` : ""}
                  </td>
                  <td className="px-3 py-2 tabular-nums" style={r.last_used_at ? undefined : { color: "var(--text-3)" }}>
                    {r.last_used_at ? stamp(r.last_used_at) : t("apiAccess.neverUsed")}
                  </td>
                  <td className="px-1 py-0.5 w-10 text-center">
                    <ActionMenu
                      label={`${t("apiAccess.actions")}: ${r.name}`}
                      items={[{ key: "revoke", label: t("apiAccess.revoke"), icon: Trash2, tone: "danger",
                                onSelect: () => { drop.reset(); setRevoke(r); } }]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableCard>

        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SectionHead icon={BookOpen} title={t("apiAccess.manual")} />
          <div className="px-4 py-3 space-y-3">
            <p className="text-sm" style={{ color: "var(--text-2)" }}>{t("apiAccess.manualHint")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedToggle options={MANUAL_LANGS} value={docLang} onChange={setDocLang} />
              <Button size="lg" variant="secondary" icon={Download} loading={busy === "pdf"} disabled={!!busy}
                onClick={() => manual("pdf")}>
                {t("apiAccess.pdf")}
              </Button>
              <Button size="lg" variant="secondary" icon={Download} loading={busy === "md"} disabled={!!busy}
                onClick={() => manual("md")}>
                {t("apiAccess.md")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {form && (
        <Modal
          onClose={() => setForm(null)}
          icon={<KeyRound size={18} />}
          title={t("apiAccess.createTitle")}
          subtitle={t("apiAccess.createSub")}
          dirty={!!form.name.trim()}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setForm(null)}>{t("common.cancel")}</Button>
              <Button loading={create.isPending} disabled={!form.name.trim()}
                onClick={() => create.mutate({ name: form.name.trim(), days: form.days })}>
                {t("apiAccess.create")}
              </Button>
            </>
          )}
        >
          <FormField label={t("apiAccess.name")} required hint={t("apiAccess.nameHint")}
            error={create.isError ? errOf(create.error, t) : null}>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={80}
              placeholder={t("apiAccess.namePlaceholder")}
              autoComplete="off"
              className="w-full rounded-xl px-3 py-2 text-base md:text-sm outline-none"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }}
            />
          </FormField>
          <FormField label={t("apiAccess.lifetime")} hint={t("apiAccess.lifetimeHint")}>
            <SegmentedToggle fill options={dayOptions} value={form.days} onChange={(d) => setForm({ ...form, days: d })} />
          </FormField>
        </Modal>
      )}

      {made && (
        <Modal
          onClose={() => setMade(null)}
          dismissable={false}
          icon={<KeyRound size={18} />}
          title={t("apiAccess.madeTitle")}
          subtitle={made.name}
          footer={<Button onClick={() => setMade(null)}>{t("apiAccess.done")}</Button>}
        >
          <p className="text-sm font-semibold" style={{ color: "#ef4444" }}>{t("apiAccess.madeWarn")}</p>
          <div className="rounded-xl px-3 py-2.5 font-mono text-sm break-all select-all"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }}>
            {made.token}
          </div>
          <Button size="lg" variant={copied ? "success" : "primary"} icon={copied ? Check : Copy} className="w-full" onClick={copy}>
            {t(copied ? "apiAccess.copied" : "apiAccess.copy")}
          </Button>
        </Modal>
      )}

      {revoke && (
        <ConfirmDialog
          tone="danger"
          title={t("apiAccess.revokeTitle")}
          message={t("apiAccess.revokeMsg").replace("{name}", revoke.name)}
          confirmLabel={t("apiAccess.revoke")}
          loading={drop.isPending}
          error={drop.isError ? errOf(drop.error, t) : null}
          onCancel={() => setRevoke(null)}
          onConfirm={() => drop.mutate(revoke)}
        />
      )}
      {toast.node}
    </Layout>
  );
}
