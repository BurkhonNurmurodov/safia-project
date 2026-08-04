import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Database, RefreshCw, Copy, Check, AtSign, ExternalLink } from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import Button from "../../components/ui/Button";
import { SectionHead } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import Toast, { useToast } from "../../components/ui/Toast";
import UploadDropzone, { FileStateList, useFileStates } from "../../components/ui/UploadDropzone";

/**
 * «Ishchilar davomati» — the daily verifix upload plus the Google Sheet source
 * configuration.
 *
 * Split out of the old AdminUpload shell, which welded the panel's chrome, this
 * uploader, and two chart-colour editors for two OTHER pages into one 878-line
 * file under a tab called "Data". The colour editors now live in their own
 * destination; what remains here is one job: get today's data in.
 */

const SOURCES = [
  { name: "source",       labelKey: "admin.source" },
  { name: "shift_report", labelKey: "admin.shiftReport" },
  { name: "leaders",      labelKey: "admin.leadersSheet" },
  { name: "quality",      labelKey: "admin.qualitySheet" },
];

const ACCEPT = { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] };

// ─── Sheet sources ────────────────────────────────────────────────────────────

function SheetSourceEditor() {
  const { t } = useLang();
  const qc = useQueryClient();
  const toast = useToast();

  const { data: sources, isLoading } = useQuery({
    queryKey: ["sheet-sources"],
    queryFn: () => api.get("/admin/sheet-sources").then((r) => r.data),
  });
  const { data: svc } = useQuery({
    queryKey: ["service-account"],
    queryFn: () => api.get("/admin/service-account").then((r) => r.data),
    staleTime: Infinity,
  });

  const [copied, setCopied] = useState(false);
  // Seeded from the server so the inputs are CONTROLLED. They used to be
  // uncontrolled with `editing` populated only onChange, so pressing Save on a
  // row nobody typed in serialized `{ sheet_id: undefined }`.
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState({});
  const [result, setResult] = useState({});

  useEffect(() => {
    if (!sources) return;
    setDraft(Object.fromEntries(SOURCES.map(({ name }) =>
      [name, sources.find((s) => s.name === name)?.sheet_id || ""])));
  }, [sources]);

  const savedOf = (name) => sources?.find((s) => s.name === name)?.sheet_id || "";
  const valueOf = (name) => draft[name] ?? "";
  const isDirty = (name) => sources != null && valueOf(name).trim() !== savedOf(name).trim();

  async function copyEmail() {
    const email = svc?.email;
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
    } catch {
      // Fallback for non-secure contexts / older webviews
      const ta = document.createElement("textarea");
      ta.value = email;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  // Open the Google Sheet — inside Telegram the WebView needs tg.openLink()
  function openSheet(id) {
    if (!id) return;
    const url = `https://docs.google.com/spreadsheets/d/${id}/edit`;
    const tg = window?.Telegram?.WebApp;
    try {
      if (tg?.openLink) tg.openLink(url);
      else window.open(url, "_blank", "noopener");
    } catch {
      window.open(url, "_blank", "noopener");
    }
  }

  async function save(name) {
    setBusy((p) => ({ ...p, [name]: "saving" }));
    try {
      await api.put(`/admin/sheet-sources/${name}`, { sheet_id: valueOf(name).trim() });
      await qc.invalidateQueries({ queryKey: ["sheet-sources"] });
      toast.success(t("admin.saved"));
      return true;
    } catch (err) {
      // A silent failure here breaks every sheet sync on the platform.
      toast.error(err?.response?.data?.detail || t("admin.saveFailed"));
      return false;
    } finally {
      setBusy((p) => ({ ...p, [name]: null }));
    }
  }

  function refreshDetail(name, data) {
    if (name === "source") {
      return t("admin.refreshDetail.source")
        .replace("{p}", data.production_rows ?? 0)
        .replace("{h}", data.headcount_rows ?? 0);
    }
    if (name === "leaders") return t("admin.refreshDetail.leaders").replace("{n}", data.leader_rows ?? 0);
    if (name === "quality") return t("admin.refreshDetail.quality").replace("{n}", data.quality_rows ?? 0);
    return t("admin.refreshDetail.shift")
      .replace("{n}", data.downtime_rows ?? 0)
      .replace("{m}", data.managers_synced ?? 0);
  }

  /**
   * The bug this closes: Refresh posted to the endpoint that reads the SAVED id
   * while the input beside it held the operator's unsaved edit — so pasting a
   * new spreadsheet id and pressing Refresh returned a green success with row
   * counts from the OLD sheet, and the operator walked away believing the new
   * one was connected. Meanwhile the external-link button opened the TYPED id.
   * Three buttons on one row, two different ids. Now a dirty row saves first,
   * and every control acts on the same value.
   */
  async function refresh(name) {
    if (isDirty(name) && !(await save(name))) return;
    setBusy((p) => ({ ...p, [name]: "refreshing" }));
    setResult((p) => ({ ...p, [name]: null }));
    try {
      const { data } = await api.post(`/admin/refresh-sheet/${name}`);
      setResult((p) => ({ ...p, [name]: { ok: true, msg: refreshDetail(name, data) } }));
    } catch (err) {
      setResult((p) => ({
        ...p,
        [name]: { ok: false, msg: err?.response?.data?.detail || t("admin.refreshFailed") },
      }));
    } finally {
      setBusy((p) => ({ ...p, [name]: null }));
    }
  }

  return (
    <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={Database} title={t("admin.sheetSources")} />

      <div className="p-4 space-y-4">
        {/* Service account — every source sheet must be shared with this email */}
        {svc?.email && (
          <div className="rounded-lg p-3" style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)" }}>
            <div className="flex items-center gap-1.5 mb-2">
              <AtSign size={13} style={{ color: "var(--brand-text)" }} />
              <span className="text-xs" style={{ color: "var(--text-2)" }}>{t("admin.serviceAccountHint")}</span>
            </div>
            <div className="flex items-center gap-2">
              <code
                onClick={copyEmail}
                title={t("admin.copy")}
                className="min-w-0 flex-1 truncate text-xs font-mono cursor-pointer rounded-lg px-3 py-2"
                style={{ color: "var(--brand-text)", background: "var(--bg-base)", border: "1px solid var(--border-md)" }}
              >
                {svc.email}
              </code>
              <Button
                size="lg"
                variant={copied ? "success" : "secondary"}
                tint={copied}
                icon={copied ? <Check size={13} /> : <Copy size={13} />}
                onClick={copyEmail}
                className="flex-shrink-0"
              >
                {copied ? t("admin.copied") : t("admin.copy")}
              </Button>
            </div>
          </div>
        )}

        {isLoading
          ? SOURCES.map(({ name }) => <SkeletonBlock key={name} className="h-20 rounded-lg" />)
          : SOURCES.map(({ name, labelKey }) => {
              const dirty = isDirty(name);
              const state = busy[name];
              const res = result[name];
              const id = valueOf(name).trim();
              return (
                <div
                  key={name}
                  className="rounded-lg p-3"
                  style={{
                    background: "var(--bg-inner)",
                    // A dirty row announces itself, so "I edited this but never
                    // saved it" can't stay invisible.
                    border: `1px solid ${dirty ? "var(--brand-border)" : "var(--border)"}`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                      {t(labelKey)}
                    </span>
                    {dirty && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                        style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}
                      >
                        {t("admin.unsavedRow")}
                      </span>
                    )}
                  </div>

                  {/* Stacks below sm: three flex-shrink-0 buttons on one line left
                      the 44-character id input about 100px wide on a phone, so
                      verifying a pasted id was impossible on the primary device. */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={valueOf(name)}
                      onChange={(e) => setDraft((p) => ({ ...p, [name]: e.target.value }))}
                      placeholder={t("admin.sheetId")}
                      className="min-w-0 flex-1 rounded-lg px-3 py-2 text-xs font-mono outline-none"
                      style={{ background: "var(--bg-base)", border: "1px solid var(--border-md)", color: "var(--text-2)" }}
                    />
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        size="lg"
                        variant="secondary"
                        onClick={() => openSheet(id)}
                        disabled={!id}
                        title={t("admin.openSheet")}
                        aria-label={t("admin.openSheet")}
                      >
                        <ExternalLink size={13} />
                      </Button>
                      <Button
                        size="lg"
                        variant="secondary"
                        onClick={() => save(name)}
                        disabled={!dirty}
                        loading={state === "saving"}
                      >
                        {t("admin.save")}
                      </Button>
                      <Button
                        size="lg"
                        variant="primary"
                        icon={<RefreshCw size={13} />}
                        onClick={() => refresh(name)}
                        loading={state === "refreshing"}
                        className="flex-1 sm:flex-none"
                      >
                        {dirty ? t("admin.saveAndRefresh") : t("admin.refresh")}
                      </Button>
                    </div>
                  </div>

                  {res && (
                    <div
                      className="text-[11px] mt-2 leading-snug break-words"
                      style={{ color: res.ok ? "#22c55e" : "#ef4444" }}
                    >
                      {res.msg}
                    </div>
                  )}
                </div>
              );
            })}
      </div>

      {toast.node}
    </div>
  );
}

// ─── Verifix upload ───────────────────────────────────────────────────────────

export default function DataSources() {
  const { t } = useLang();
  const { states, begin, patch, addRejections, clear } = useFileStates();
  const [uploading, setUploading] = useState(false);

  async function uploadFiles(files) {
    const entries = begin(files);
    setUploading(true);

    for (const { id, file } of entries) {
      patch(id, { status: "uploading", progress: 0 });
      const form = new FormData();
      form.append("files", file);
      try {
        const { data } = await api.post("/admin/upload", form, {
          onUploadProgress: (e) => {
            const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 50;
            // Bytes are only the transfer. Parsing and the row insert happen
            // after, so 100% flips to "processing" rather than sitting on a
            // full bar that reads as a hang.
            patch(id, { progress: pct, status: pct >= 100 ? "processing" : "uploading" });
          },
        });
        const result = data.results[0];
        if (result.status === "ok") {
          patch(id, {
            status: "ok",
            progress: 100,
            detail: t("admin.rowsInserted").replace("{n}", result.rows_inserted),
          });
        } else {
          patch(id, { status: "error", progress: 100, detail: result.detail });
        }
      } catch (err) {
        // The server's reason matters most exactly when the request fails —
        // the old catch discarded the error and showed a generic string.
        patch(id, {
          status: "error",
          progress: 100,
          detail: err?.response?.data?.detail || t("admin.uploadFailed"),
        });
      }
    }
    setUploading(false);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={Upload} title={t("admin.uploadTitle")} />
        <div className="p-4">
          <UploadDropzone
            accept={ACCEPT}
            busy={uploading}
            onFiles={uploadFiles}
            onRejected={(r) => addRejections(r, t("admin.upload.onlyXlsx"))}
            hint={t("admin.format")}
          />
          <FileStateList states={states} busy={uploading} onClear={clear} className="mt-4" />
        </div>
      </div>

      <SheetSourceEditor />
    </div>
  );
}
