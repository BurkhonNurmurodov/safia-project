import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Factory, Plus, Pencil, Trash2, Archive, ArchiveRestore,
  ChevronUp, ChevronDown, AlertTriangle, Users, Settings2, ArrowRightLeft,
} from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { useFactory, factoryName } from "../../context/FactoryContext";
import { useAdminDirty } from "./AdminPanel";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import FormField from "../../components/ui/FormField";
import LangTextInput from "../../components/ui/LangTextInput";
import StyledSelect from "../../components/ui/StyledSelect";
import SearchInput from "../../components/ui/SearchInput";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import TableCard, { SectionHead, Th } from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";

/**
 * «Zavodlar» — the plant register, the supervisor→factory assignment, and the
 * two settings that decide how the factory tabs open.
 *
 * The screen is ordered by how consequential each part is, top to bottom:
 *
 *   1. THE REGISTER — what plants exist, in the order their tabs appear.
 *   2. THE DEFAULT  — which tab the six factory-aware pages land on.
 *   3. ASSIGNMENT   — which supervisor works where. Deliberately LAST and the
 *      largest block, because it is the part that moves real numbers: changing
 *      one supervisor's factory moves that unit's rows between tabs on
 *      Overview, Zagruzka, Ojidaniya, Workers, Quality and Concerns at once.
 *
 * Assignment is a per-row dropdown plus a bulk "move selected", not drag and
 * drop. This app's primary device is a phone inside Telegram's WebView, where
 * dragging fights the page scroll and there is no hover state to advertise that
 * a row is draggable at all.
 *
 * Unassigned supervisors are pinned to the top under a warning, never sorted
 * into the middle of the list: a unit with no factory shows up on NO factory
 * tab (only «All»), and that is invisible from every other screen in the app —
 * this is the one place it can be noticed.
 */

const ALL = "all";

export default function Factories() {
  const { t, lang, languages } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const toast = useToast();
  const { reload: reloadFactoryContext } = useFactory();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-factories"],
    queryFn: () => api.get("/api/factories/admin").then((r) => r.data),
  });

  const factories = useMemo(() => data?.factories || [], [data]);
  const managers = useMemo(() => data?.managers || [], [data]);
  const live = useMemo(() => factories.filter((f) => !f.archived), [factories]);

  // Every mutation here changes what other people see on six pages, so the
  // page-level factory context is refreshed too — otherwise the admin's own tab
  // strip keeps showing a factory they just renamed or archived.
  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["admin-factories"] });
    reloadFactoryContext?.();
  }, [qc, reloadFactoryContext]);

  const nameOf = useCallback((f) => (f ? (factoryName(f, lang) || f.code) : ""), [lang]);

  // ── register: create / edit ────────────────────────────────────────────────
  const [form, setForm] = useState(null);   // null | {id?, code, name_*}
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const emptyForm = () => ({
    id: null, code: "",
    name_uz: "", name_uz_cyrl: "", name_ru: "", name_en: "",
  });

  // An open form holds a draft; the shell must warn before unmounting it.
  useAdminDirty(!!form);

  const saveFactory = async () => {
    const code = (form.code || "").trim();
    if (!code) { setFormError(t("factories.errNoCode")); return; }
    setSaving(true);
    setFormError("");
    try {
      const body = {
        code,
        name_uz: form.name_uz, name_uz_cyrl: form.name_uz_cyrl,
        name_ru: form.name_ru, name_en: form.name_en,
      };
      if (form.id) await api.put(`/api/factories/${form.id}`, body);
      else await api.post("/api/factories", body);
      setForm(null);
      refresh();
      toast.success(t("common.saved"));
    } catch (e) {
      // Inside the modal, not as a toast: the failure belongs to the field the
      // operator is looking at, and a modal that closes on failure loses the
      // typed values along with the reason.
      setFormError(e?.response?.data?.detail || e?.message || t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  // ── register: archive / delete ─────────────────────────────────────────────
  const [confirm, setConfirm] = useState(null);  // {kind, factory}
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState(null);

  const runConfirm = async () => {
    setConfirmBusy(true);
    setConfirmError(null);
    try {
      if (confirm.kind === "delete") {
        await api.delete(`/api/factories/${confirm.factory.id}`);
      } else {
        await api.put(`/api/factories/${confirm.factory.id}`, {
          code: confirm.factory.code,
          name_uz: confirm.factory.name_uz, name_uz_cyrl: confirm.factory.name_uz_cyrl,
          name_ru: confirm.factory.name_ru, name_en: confirm.factory.name_en,
          archived: confirm.kind === "archive",
        });
      }
      setConfirm(null);
      refresh();
      toast.success(t("common.saved"));
    } catch (e) {
      setConfirmError(e?.response?.data?.detail || e?.message || t("common.error"));
    } finally {
      setConfirmBusy(false);
    }
  };

  const move = async (idx, dir) => {
    const next = [...live];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    try {
      await api.put("/api/factories/reorder/all", { order: next.map((f) => f.id) });
      refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || t("common.error"));
    }
  };

  // ── defaults ───────────────────────────────────────────────────────────────
  const [defTab, setDefTab] = useState(null);
  const [allTab, setAllTab] = useState(null);
  useEffect(() => {
    if (!data) return;
    setDefTab(data.default_factory);
    setAllTab(data.all_tab);
  }, [data]);

  const saveSettings = async (patch) => {
    try {
      const r = await api.put("/api/factories/settings/defaults", patch);
      setDefTab(r.data.default_factory);
      setAllTab(r.data.all_tab);
      refresh();
      toast.success(t("common.saved"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || t("common.error"));
    }
  };

  // ── assignment ─────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [shiftF, setShiftF] = useState(null);
  const [sel, setSel] = useState([]);          // selected manager ids
  const [bulkTo, setBulkTo] = useState("");
  const [busyIds, setBusyIds] = useState([]);

  const assign = async (ids, factoryId) => {
    if (!ids.length) return;
    setBusyIds(ids);
    try {
      await api.put("/api/factories/assign/managers", {
        manager_ids: ids,
        factory_id: factoryId === "" || factoryId == null ? null : Number(factoryId),
      });
      setSel([]);
      refresh();
      toast.success(t("factories.moved").replace("{n}", String(ids.length)));
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || t("common.error"));
    } finally {
      setBusyIds([]);
    }
  };

  const visibleManagers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = managers.filter((m) => {
      if (m.archived) return false;
      if (shiftF && m.shift !== shiftF) return false;
      if (q && !tl(m.name).toLowerCase().includes(q) && !String(m.id).includes(q)) return false;
      return true;
    });
    // Unassigned first — they are on no factory tab and nothing else surfaces it.
    return rows.sort((a, b) => {
      const au = a.factory_id == null ? 0 : 1;
      const bu = b.factory_id == null ? 0 : 1;
      if (au !== bu) return au - bu;
      return tl(a.name).localeCompare(tl(b.name));
    });
  }, [managers, search, shiftF, tl]);

  const unassignedCount = useMemo(
    () => managers.filter((m) => !m.archived && m.factory_id == null).length,
    [managers]
  );

  const factoryOptions = useMemo(
    () => live.map((f) => ({ value: String(f.id), label: nameOf(f) })),
    [live, nameOf]
  );

  const allVisibleSelected = visibleManagers.length > 0
    && visibleManagers.every((m) => sel.includes(m.id));

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-48" />
        <SkeletonBlock className="h-32" />
        <SkeletonBlock className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── 1. Register ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead
          icon={Factory}
          title={t("factories.registerTitle")}
          subtitle={t("factories.registerSub")}
          right={
            <Button size="lg" onClick={() => { setForm(emptyForm()); setFormError(""); }}>
              <Plus size={14} /> {t("factories.add")}
            </Button>
          }
        />
        {factories.length === 0 ? (
          <div className="p-4">
            <EmptyState title={t("factories.emptyTitle")} message={t("factories.emptyMsg")} height="h-32" />
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {factories.map((f) => {
              const idx = live.findIndex((x) => x.id === f.id);
              return (
                <div key={f.id} className="flex items-center gap-3 px-4 py-3 flex-wrap"
                     style={{ borderTop: "1px solid var(--border)", opacity: f.archived ? 0.55 : 1 }}>
                  {/* Order controls — only for live factories; an archived one
                      has no tab, so it has no place in the order. */}
                  <div className="flex flex-col flex-shrink-0">
                    <button
                      onClick={() => move(idx, -1)}
                      disabled={f.archived || idx <= 0}
                      title={t("factories.moveUp")}
                      className="p-0.5 rounded disabled:opacity-25"
                      style={{ color: "var(--text-3)", background: "none", border: "none" }}
                    ><ChevronUp size={13} /></button>
                    <button
                      onClick={() => move(idx, 1)}
                      disabled={f.archived || idx < 0 || idx >= live.length - 1}
                      title={t("factories.moveDown")}
                      className="p-0.5 rounded disabled:opacity-25"
                      style={{ color: "var(--text-3)", background: "none", border: "none" }}
                    ><ChevronDown size={13} /></button>
                  </div>

                  <span
                    className="text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0 tracking-wider"
                    style={{
                      background: "color-mix(in srgb, var(--brand) 12%, transparent)",
                      color: "var(--brand-text)",
                    }}
                  >{f.code}</span>

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>
                      {nameOf(f)}
                    </div>
                    <div className="text-[11px] mt-0.5 flex items-center gap-1.5" style={{ color: "var(--text-4)" }}>
                      <Users size={11} />
                      {t("factories.supCount").replace("{n}", String(f.manager_count))}
                      {f.archived && <span>· {t("factories.archived")}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button size="sm" variant="secondary" tint
                            onClick={() => { setForm({ ...f }); setFormError(""); }}>
                      <Pencil size={12} /> {t("common.edit")}
                    </Button>
                    <Button
                      size="sm" variant="secondary" tint
                      onClick={() => { setConfirmError(null); setConfirm({ kind: f.archived ? "unarchive" : "archive", factory: f }); }}
                    >
                      {f.archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
                      {f.archived ? t("factories.unarchive") : t("factories.archive")}
                    </Button>
                    {/* Deleting is offered only while the factory holds nobody —
                        matching what the server will allow, so the button is
                        never a promise the API breaks. */}
                    {f.manager_count === 0 && (
                      <Button size="sm" variant="danger" tint
                              onClick={() => { setConfirmError(null); setConfirm({ kind: "delete", factory: f }); }}>
                        <Trash2 size={12} />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 2. Defaults ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={Settings2} title={t("factories.defaultsTitle")} subtitle={t("factories.defaultsSub")} />
        <div className="px-4 py-4 grid gap-4 sm:grid-cols-2">
          <FormField label={t("factories.defaultTab")} hint={t("factories.defaultTabHint")}>
            <StyledSelect
              value={defTab ?? ""}
              onChange={(v) => saveSettings({ default_factory: v })}
              options={[
                ...factoryOptions,
                ...(allTab ? [{ value: ALL, label: t("factory.all") }] : []),
              ]}
              triggerClassName="w-full px-3 py-2 text-sm"
            />
          </FormField>
          <FormField label={t("factory.all")} hint={t("factories.allTabHint")}>
            <SegmentedToggle
              value={allTab ? "on" : "off"}
              onChange={(v) => saveSettings({ all_tab: v === "on" })}
              options={[["on", t("common.yes")], ["off", t("common.no")]]}
              fill
            />
          </FormField>
        </div>
      </div>

      {/* ── 3. Assignment ───────────────────────────────────────────────── */}
      {unassignedCount > 0 && (
        <div
          className="flex items-start gap-2.5 px-4 py-3 rounded-2xl"
          style={{
            background: "color-mix(in srgb, #eab308 10%, transparent)",
            border: "1px solid color-mix(in srgb, #eab308 35%, transparent)",
          }}
        >
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" style={{ color: "#eab308" }} />
          <div className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
            <span className="font-semibold" style={{ color: "var(--text-1)" }}>
              {t("factories.unassignedTitle").replace("{n}", String(unassignedCount))}
            </span>
            <br />
            {t("factories.unassignedMsg")}
          </div>
        </div>
      )}

      <TableCard
        icon={ArrowRightLeft}
        title={t("factories.assignTitle")}
        subtitle={t("factories.assignSub")}
        right={
          <span className="text-[11px]" style={{ color: "var(--text-4)" }}>
            {visibleManagers.length} / {managers.filter((m) => !m.archived).length}
          </span>
        }
        toolbar={
          <>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t("filter.searchBrigadirs")}
              className="w-full sm:w-56"
            />
            <SegmentedToggle
              value={shiftF}
              onChange={setShiftF}
              options={[[null, t("filter.all")], [1, "S1"], [2, "S2"]]}
              ariaLabel={t("filter.shift")}
            />
            {/* Bulk move appears only once something is selected — an always-on
                control with nothing to act on is noise on a 390px toolbar. */}
            {sel.length > 0 && (
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <span className="text-[11px] font-semibold" style={{ color: "var(--text-2)" }}>
                  {t("factories.selected").replace("{n}", String(sel.length))}
                </span>
                <StyledSelect
                  value={bulkTo}
                  onChange={(v) => { setBulkTo(v); assign(sel, v === "__none__" ? null : v); setBulkTo(""); }}
                  options={[
                    ...factoryOptions,
                    { value: "__none__", label: t("factories.unassign") },
                  ]}
                  placeholder={t("factories.moveTo")}
                  triggerClassName="px-3 py-2 text-sm"
                />
                <Button size="lg" variant="ghost" onClick={() => setSel([])}>
                  {t("common.cancel")}
                </Button>
              </div>
            )}
          </>
        }
        minWidth="640px"
      >
        <thead>
          <tr>
            <Th label={
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(e) => setSel(e.target.checked ? visibleManagers.map((m) => m.id) : [])}
                aria-label={t("common.selectAll")}
                style={{ accentColor: "var(--brand)" }}
              />
            } className="w-9" />
            <Th label={t("tasks.colSupervisor")} />
            <Th label={t("filter.shift")} className="w-20" />
            <Th label={t("factory.label")} className="w-56" />
          </tr>
        </thead>
        <tbody>
          {visibleManagers.length === 0 ? (
            <tr>
              <td colSpan={4} className="text-center py-8 text-xs" style={{ color: "var(--text-4)" }}>
                {t("common.noMatch")}
              </td>
            </tr>
          ) : visibleManagers.map((m) => (
            <tr key={m.id}>
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={sel.includes(m.id)}
                  onChange={(e) => setSel((s) => e.target.checked ? [...s, m.id] : s.filter((x) => x !== m.id))}
                  aria-label={tl(m.name)}
                  style={{ accentColor: "var(--brand)" }}
                />
              </td>
              <td className="px-3 py-2">
                <span style={{ color: "var(--text-1)" }}>{tl(m.name)}</span>
                {m.factory_id == null && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: "color-mix(in srgb, #eab308 15%, transparent)", color: "#eab308" }}>
                    {t("factories.unassigned")}
                  </span>
                )}
              </td>
              <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>
                {m.shift ? `S${m.shift}` : "—"}
              </td>
              <td className="px-3 py-2">
                <StyledSelect
                  value={m.factory_id == null ? "__none__" : String(m.factory_id)}
                  onChange={(v) => assign([m.id], v === "__none__" ? null : v)}
                  disabled={busyIds.includes(m.id)}
                  options={[
                    ...factoryOptions,
                    { value: "__none__", label: t("factories.unassign") },
                  ]}
                  triggerClassName="w-full px-2.5 py-1.5 text-xs"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </TableCard>

      {/* ── create / edit modal ─────────────────────────────────────────── */}
      {form && (
        <Modal
          open
          onClose={() => setForm(null)}
          icon={Factory}
          title={form.id ? t("factories.editTitle") : t("factories.addTitle")}
          subtitle={t("factories.formSub")}
          footer={
            <>
              <Button variant="secondary" onClick={() => setForm(null)}>{t("common.cancel")}</Button>
              <Button onClick={saveFactory} loading={saving}>{t("common.save")}</Button>
            </>
          }
        >
          <FormField label={t("factories.code")} required hint={t("factories.codeHint")} error={formError || undefined}>
            <input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg outline-none"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }}
              placeholder="SAFIA-2"
              autoFocus
            />
          </FormField>
          <FormField label={t("factories.name")} hint={t("factories.nameHint")}>
            <LangTextInput
              className="mt-1"
              value={{
                uz: form.name_uz, uz_cyrl: form.name_uz_cyrl,
                ru: form.name_ru, en: form.name_en,
              }}
              onChange={(l, v) => setForm((f) => ({ ...f, [`name_${l}`]: v }))}
            />
          </FormField>
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          open
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirm}
          loading={confirmBusy}
          error={confirmError}
          tone={confirm.kind === "delete" ? "danger" : "warning"}
          icon={confirm.kind === "delete" ? Trash2 : Archive}
          title={
            confirm.kind === "delete" ? t("factories.confirmDeleteTitle")
              : confirm.kind === "archive" ? t("factories.confirmArchiveTitle")
              : t("factories.confirmUnarchiveTitle")
          }
          message={
            (confirm.kind === "delete" ? t("factories.confirmDeleteMsg")
              : confirm.kind === "archive" ? t("factories.confirmArchiveMsg")
              : t("factories.confirmUnarchiveMsg")
            ).replace("{name}", nameOf(confirm.factory))
          }
          confirmLabel={
            confirm.kind === "delete" ? t("common.delete")
              : confirm.kind === "archive" ? t("factories.archive")
              : t("factories.unarchive")
          }
        />
      )}

      {toast.node}
    </div>
  );
}
