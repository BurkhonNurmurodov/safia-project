import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Upload, Pencil, Trash2, Download, Send, Layers, Loader2, Info, Plus, Link2, ExternalLink, Copy } from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import FormField from "../ui/FormField";
import StyledSelect from "../ui/StyledSelect";
import SearchInput from "../ui/SearchInput";
import SegmentedToggle from "../ui/SegmentedToggle";
import EmptyState from "../ui/EmptyState";
import ConfirmDialog from "../ui/ConfirmDialog";
import ActionMenu from "../ui/ActionMenu";
import FileIcon, { FileTile, humanSize } from "../ui/FileIcon";
import { UploadDropzone, FileStateList, useFileStates } from "../ui/UploadDropzone";
import { SkeletonTable } from "../ui/Skeleton";
import { FilterPanel, PickFilter } from "../ui/ColumnFilter";
import { useToast } from "../ui/Toast";
import { usePersistentState } from "../../hooks/usePersistentState";
import { useTranslit } from "../../utils/transliterate";
import { isWebSession, inTelegram } from "../../utils/session";
import { saveBlob } from "../../utils/exportXlsx";
import { copyText } from "../../utils/copyText";
import api from "../../utils/api";
import { useAT, fill, errText, Chip, DEPT_ICON, fmtDate } from "./assessmentUtil";

// A material belongs to one department or to none («Umumiy»): the server's
// `rules.GENERAL`. Listed first — what everybody reads comes before a
// department's own — then the panel's order.
const GENERAL = "general";
const DEPTS = [GENERAL, "kaizen", "production", "tb", "hr", "okk"];
const ALL = "all";
const KEY = ["assessment-materials"];

const inputCls = "w-full rounded-xl px-3 py-2 text-base sm:text-sm outline-none";
const inputStyle = { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };

const MB = 1024 * 1024;

/** The browser's own key for one upload in pieces — 32 hex digits. */
function uploadKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replace(/-/g, "");
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Send one piece, again (twice, a little later each time) when the line or
 *  the archive failed — never when the server REFUSED it: a 4xx is an answer. */
async function sendPiece(make, onProgress) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await api.post("/api/assessment/materials/parts", make(), { onUploadProgress: onProgress });
    } catch (e) {
      const status = e?.response?.status;
      if (attempt >= 2 || (status && status < 500)) throw e;
      await wait(2000 * (attempt + 1));
    }
  }
}

/** A link material opens in the real browser — inside Telegram a
 *  `target=_blank` is swallowed, so its own opener is asked first. */
function openUrl(url) {
  const tg = window?.Telegram?.WebApp;
  if (inTelegram() && tg?.openLink) {
    try { tg.openLink(url); return; } catch { /* the plain way below */ }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

const deptName = (d, T) => (d === GENERAL ? T.matGeneral : T.dept[d] || d);
const deptIcon = (d) => (d === GENERAL ? Layers : DEPT_ICON[d]);

/** The department a material belongs to — the page's neutral chip (a
 *  category, never a status), «Umumiy» for one that belongs to them all. */
function MatDeptChip({ dept, T }) {
  return <Chip icon={deptIcon(dept)} title={dept === GENERAL ? T.matGeneralTip : undefined}>{deptName(dept, T)}</Chip>;
}

function DeptSelect({ value, onChange, T }) {
  return (
    <StyledSelect value={value} onChange={onChange} ariaLabel={T.colDept}
      options={DEPTS.map((d) => {
        const Icon = deptIcon(d);
        return { value: d, label: <span className="inline-flex items-center gap-1.5"><Icon size={13} />{deptName(d, T)}</span>, title: deptName(d, T) };
      })} />
  );
}

/**
 * Add a material: a FILE (uploaded here) or a LINK (a video or a file kept on
 * a drive, however large — only its address is stored).
 *
 * Upload — pick the files first, send them with «Yuklash». Every file is one
 * material, sent on its own, so each has its own progress and a refused one
 * takes nothing else with it; the department and the note go with them all,
 * a title only with a single file. A failed file stays listed with its reason.
 *
 * A file the archive keeps as ONE document (up to `wholeMb`) goes in one
 * request. A bigger one (up to `maxMb`) is cut HERE into pieces of
 * `partBytes`, sent one request each and completed at the end — the bot API
 * hands back no single file over 20 MB, and one long request for a big file
 * is the kind a phone line drops.
 */
function AddModal({ startDept, wholeMb, maxMb, partBytes, onClose, onDone, onLinked, T }) {
  const [mode, setMode] = useState("file");   // file | link
  const [dept, setDept] = useState(startDept);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const [linkErr, setLinkErr] = useState(null);
  const link = mode === "link";
  const addLink = useMutation({
    mutationFn: () => api.post("/api/assessment/materials/link",
      { url: url.trim(), title: title.trim(), department: dept, note: note.trim() }).then((r) => r.data),
    onSuccess: () => onLinked(),
    onError: (e) => setLinkErr(e),
  });
  const [staged, setStaged] = useState([]);   // [{id, file}] — picked, not sent yet
  const [busy, setBusy] = useState(false);
  const fs = useFileStates();
  const limit = maxMb * MB;
  const tooBig = (f) => f.size > limit;
  const inPieces = (f) => partBytes > 0 && f.size > wholeMb * MB;
  const ready = staged.filter((s) => !tooBig(s.file));
  const many = ready.length > 1;   // a title names ONE file; the server refuses it with several

  const pick = (files) => {
    fs.clear();
    setStaged((prev) => [...prev, ...files.map((file, i) => ({ id: `${Date.now()}-${prev.length + i}`, file }))]);
  };

  const run = async () => {
    if (!ready.length || busy) return;
    setBusy(true);
    const entries = fs.begin(ready.map((s) => s.file));
    let ok = 0;
    const meta = { department: dept, note: note.trim(), title: entries.length === 1 ? title.trim() : "" };
    for (const { id, file } of entries) {
      fs.patch(id, { status: "uploading", progress: 0 });
      try {
        if (inPieces(file)) {
          const key = uploadKey();
          const n = Math.ceil(file.size / partBytes);
          for (let seq = 1; seq <= n; seq += 1) {
            const from = (seq - 1) * partBytes;
            await sendPiece(() => {
              const fd = new FormData();
              fd.append("upload", key);
              fd.append("seq", String(seq));
              fd.append("name", file.name);
              fd.append("part", file.slice(from, from + partBytes), `${file.name}.part`);
              return fd;
            }, (e) => fs.patch(id, { progress: Math.min(99, Math.floor(((from + (e.loaded || 0)) * 100) / file.size)) }));
          }
          fs.patch(id, { status: "processing", progress: 100 });
          await api.post("/api/assessment/materials/complete", { upload: key, name: file.name, size: file.size, ...meta });
        } else {
          const fd = new FormData();
          fd.append("department", meta.department);
          if (meta.note) fd.append("note", meta.note);
          if (meta.title) fd.append("title", meta.title);
          fd.append("files", file, file.name);
          await api.post("/api/assessment/materials", fd, {
            onUploadProgress: (e) => {
              const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 50;
              fs.patch(id, { progress: pct, status: pct >= 100 ? "processing" : "uploading" });
            },
          });
        }
        fs.patch(id, { status: "ok", progress: 100 });
        ok += 1;
      } catch (e) {
        fs.patch(id, { status: "error", progress: 100, detail: errText(e, T) });
      }
    }
    setBusy(false);
    setStaged([]);
    onDone(ok, entries.length - ok);
  };

  return (
    <Modal open onClose={busy ? null : onClose} title={T.matAdd} subtitle={link ? T.matLinkSub : T.matUploadSub}
      icon={link ? <Link2 size={18} /> : <Upload size={18} />} maxWidth="max-w-xl" dismissable={!busy}
      dirty={!busy && (staged.length > 0 || !!title.trim() || !!note.trim() || !!url.trim())}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>{!link && fs.states.length && !staged.length ? T.close : T.cancel}</Button>
          {link
            ? <Button icon={Plus} onClick={() => { setLinkErr(null); addLink.mutate(); }}
                disabled={!url.trim() || !title.trim()} loading={addLink.isPending}>{T.matAddBtn}</Button>
            : <Button icon={Upload} onClick={run} disabled={!ready.length} loading={busy}>{T.matUploadBtn}</Button>}
        </>
      )}>
      <SegmentedToggle fill value={mode} onChange={(m) => { if (!busy && !addLink.isPending) setMode(m); }} ariaLabel={T.matAdd}
        options={[
          { value: "file", label: <><Upload size={13} aria-hidden="true" />{T.matModeFile}</> },
          { value: "link", label: <><Link2 size={13} aria-hidden="true" />{T.matModeLink}</> },
        ]} />
      <FormField label={T.colDept} required hint={T.matDeptHint}>
        <DeptSelect value={dept} onChange={setDept} T={T} />
      </FormField>
      {link ? (
        <FormField label={T.matUrl} required hint={T.matUrlHint}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={T.matUrlPh}
            maxLength={2000} autoComplete="off" inputMode="url" spellCheck={false}
            className={inputCls} style={inputStyle} />
        </FormField>
      ) : (
        <FormField label={T.matFiles} required
          hint={maxMb > wholeMb ? fill(T.matBigHint, { mb: wholeMb }) : null}>
          <UploadDropzone multiple busy={busy} onFiles={pick} label={T.matDrop}
            hint={fill(T.matDropHint, { mb: maxMb })} />
          {staged.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {staged.map((s) => (
                <FileTile key={s.id} name={s.file.name} bytes={s.file.size}
                  error={tooBig(s.file) ? fill(T.matTooBig, { mb: maxMb }) : ""}
                  removeLabel={T.matRemoveFile}
                  onRemove={busy ? undefined : () => setStaged((prev) => prev.filter((x) => x.id !== s.id))} />
              ))}
            </div>
          )}
          <FileStateList states={fs.states} busy={busy} className="mt-2" />
        </FormField>
      )}
      {link ? (
        <FormField label={T.matTitle} required hint={T.matLinkTitleHint}>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder={T.matTitlePh} maxLength={200} autoComplete="off"
            className={inputCls} style={inputStyle} />
        </FormField>
      ) : (
        <FormField label={T.matTitle} hint={many ? T.matTitleMany : T.matTitleHint}>
          <input value={many ? "" : title} onChange={(e) => setTitle(e.target.value)} disabled={many || busy}
            placeholder={T.matTitlePh} maxLength={200} autoComplete="off"
            className={`${inputCls} disabled:opacity-50`} style={inputStyle} />
        </FormField>
      )}
      <FormField label={T.matNote} hint={T.matNoteHint}>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={busy}
          placeholder={T.matNotePh} rows={3} maxLength={1000}
          className={`${inputCls} resize-y disabled:opacity-50`} style={inputStyle} />
      </FormField>
      {link && linkErr && <div role="alert" className="text-xs" style={{ color: "var(--status-bad)" }}>{errText(linkErr, T)}</div>}
    </Modal>
  );
}

/** Rename a material, move it to another department, rewrite its note. A
 *  file is shown, never replaced — a new version is a new upload; a link's
 *  address is a field like the rest. */
function EditModal({ row, opening, onOpen, onClose, onSaved, T }) {
  const [dept, setDept] = useState(row.department);
  const [title, setTitle] = useState(row.title);
  const [note, setNote] = useState(row.note || "");
  const [url, setUrl] = useState(row.url || "");
  const [err, setErr] = useState(null);
  const save = useMutation({
    mutationFn: () => api.put(`/api/assessment/materials/${row.id}`,
      { department: dept, title, note, ...(row.url ? { url: url.trim() } : {}) }).then((r) => r.data),
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e) => setErr(e),
  });
  return (
    <Modal open onClose={onClose} title={T.matEditTitle} icon={<Pencil size={18} />} maxWidth="max-w-xl"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{T.cancel}</Button>
          <Button onClick={() => { setErr(null); save.mutate(); }} disabled={!title.trim() || (!!row.url && !url.trim())} loading={save.isPending}>{T.save}</Button>
        </>
      )}>
      {row.url ? (
        <FormField label={T.matUrl} required hint={T.matUrlHint}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={T.matUrlPh}
            maxLength={2000} autoComplete="off" inputMode="url" spellCheck={false}
            className={inputCls} style={inputStyle} />
        </FormField>
      ) : (
        <FormField label={T.matFile} hint={T.matFileHint}>
          <FileTile name={row.name} bytes={row.size} loading={opening === row.id}
            title={isWebSession() ? T.matDownload : T.matSend} onClick={() => onOpen(row)} />
        </FormField>
      )}
      <FormField label={T.colDept} required hint={T.matDeptHint}>
        <DeptSelect value={dept} onChange={setDept} T={T} />
      </FormField>
      <FormField label={T.matTitle} required>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoComplete="off"
          className={inputCls} style={inputStyle} />
      </FormField>
      <FormField label={T.matNote} hint={T.matNoteHint}>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={T.matNotePh}
          rows={3} maxLength={1000} className={`${inputCls} resize-y`} style={inputStyle} />
      </FormField>
      {err && <div role="alert" className="text-xs" style={{ color: "var(--status-bad)" }}>{errText(err, T)}</div>}
    </Modal>
  );
}

/**
 * «Materiallar» (2026-11-21, the operator: «another table in which I can
 * upload the materials for candidates to prepare») — the files a candidate
 * prepares from, one row each: the department it belongs to (or «Umumiy»),
 * its title and note, its size, who uploaded it and when. Admins only, like
 * the bank (the server refuses anybody else).
 *
 * A file is opened the way every attachment on the platform is: downloaded in
 * a browser, put into the reader's own chat with the bot inside Telegram —
 * and that chat is where it is forwarded to a candidate from (no
 * candidate-facing view exists), so a browser offers both. A file over the
 * one-document limit is kept in pieces (`sendable: false`): the bot cannot
 * send it, a browser downloads it whole.
 *
 * A material may be a LINK (`url`) instead — a video or a file kept on a
 * drive. Its title opens the address, the menu copies it, and the bot sends
 * it as a message.
 */
export default function MaterialList() {
  const T = useAT();
  const { tx } = useTranslit();
  const qc = useQueryClient();
  const toast = useToast();
  const web = isWebSession();
  const [q, setQ] = useState("");
  const [fDept, setFDept] = usePersistentState("assessment_mat_dept", ALL);
  const [sort, setSort] = useState({ k: "dept", d: "asc" });
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [removeErr, setRemoveErr] = useState(null);
  const [opening, setOpening] = useState(null);   // the row whose file is on its way
  const [openPct, setOpenPct] = useState(null);   // …and how much of a big one has arrived

  const list = useQuery({
    queryKey: KEY,
    queryFn: () => api.get("/api/assessment/materials").then((r) => r.data),
  });
  // `material_mb`: what the archive keeps as ONE document; `material_max_mb`:
  // the cap of a file kept in pieces (absent on a server from before them).
  const lim = list.data?.meta?.limits || {};
  const wholeMb = lim.material_mb || 20;
  const maxMb = lim.material_max_mb || wholeMb;
  const partBytes = lim.material_part_bytes || 0;
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });

  const remove = useMutation({
    mutationFn: (row) => api.delete(`/api/assessment/materials/${row.id}`).then((r) => r.data),
    onSuccess: () => { setRemoving(null); refresh(); toast.success(T.matDeleted); },
    onError: (e) => setRemoveErr(errText(e, T)),
  });

  // `how`: "download" (a browser), "send" (the reader's chat with the bot),
  // "open" (a link's address — what a tap on a link does everywhere).
  // A file kept in pieces is too big for the bot: a browser downloads it, and
  // inside Telegram — no downloads folder there — the tap says where to get it.
  const openFile = async (row, how = row.url ? "open" : web ? "download" : "send") => {
    if (how === "open") { openUrl(row.url); return; }
    if (opening) return;
    if (how === "send" && row.sendable === false) {
      toast.show(fill(T.matBigOpen, { mb: wholeMb }), "info");
      return;
    }
    setOpening(row.id);
    setOpenPct(null);
    try {
      if (how === "download") {
        const r = await api.get(`/api/assessment/materials/${row.id}/file`, {
          responseType: "blob",
          onDownloadProgress: (e) => {
            const total = e.total || row.size;
            if (total > wholeMb * MB) setOpenPct(Math.min(99, Math.floor((e.loaded * 100) / total)));
          },
        });
        saveBlob(r.data, row.name);
      } else {
        await api.post(`/api/assessment/materials/${row.id}/send`);
        toast.success(row.url ? T.matLinkSent : T.matSent);
      }
    } catch (e) {
      // A blob request's refusal arrives as a blob too — nothing to read a code from.
      toast.error(how === "download" ? T.matOpenFailed : errText(e, T));
    } finally {
      setOpening(null);
    }
  };

  const rows = useMemo(() => {
    const all = list.data?.rows || [];
    const needle = q.trim().toLowerCase();
    const f = all.filter((r) =>
      (fDept === ALL || r.department === fDept)
      && (!needle || `${r.title} ${tx(r.title)} ${r.note || ""} ${tx(r.note || "")} ${r.name} ${r.url || ""}`.toLowerCase().includes(needle)));
    const newest = (r) => String(1e9 - r.id).padStart(10, "0");
    const key = (r) => sort.k === "dept" ? `${DEPTS.indexOf(r.department)}-${newest(r)}`
      : sort.k === "title" ? r.title.toLowerCase()
      : sort.k === "size" ? (r.size || 0)
      : r.created_at || "";
    const dir = sort.d === "asc" ? 1 : -1;
    return f.map((r) => [key(r), r]).sort((a, b) => (a[0] > b[0] ? dir : a[0] < b[0] ? -dir : 0)).map((x) => x[1]);
  }, [list.data, q, fDept, sort, tx]);

  const onSort = (k) => setSort((s) => (s.k === k ? { k, d: s.d === "asc" ? "desc" : "asc" } : { k, d: k === "size" || k === "added" ? "desc" : "asc" }));

  const sections = [
    {
      key: "dept", icon: FolderOpen, label: T.fDept, active: fDept !== ALL,
      display: fDept === ALL ? T.allDepts : deptName(fDept, T), onClear: () => setFDept(ALL),
      render: ({ close }) => (
        <PickFilter value={fDept} onChange={setFDept} close={close}
          opts={[{ value: ALL, label: T.allDepts }, ...DEPTS.map((d) => ({ value: d, label: deptName(d, T) }))]} />
      ),
    },
  ];

  const copyLink = async (r) => {
    if (await copyText(r.url)) toast.success(T.matLinkCopied);
    else toast.error(T.matCopyFailed);
  };

  const menu = (r) => (
    <ActionMenu label={fill(T.matActions, { title: r.title })} items={[
      r.url && { key: "open", label: T.matOpenLink, icon: ExternalLink, onSelect: () => openFile(r, "open") },
      r.url && { key: "copy", label: T.matCopyLink, icon: Copy, onSelect: () => copyLink(r) },
      !r.url && web && { key: "download", label: T.matDownload, icon: Download, onSelect: () => openFile(r, "download") },
      {
        key: "send", label: T.matSend, icon: Send, onSelect: () => openFile(r, "send"),
        disabled: r.sendable === false, title: r.sendable === false ? fill(T.matBigOpen, { mb: wholeMb }) : undefined,
      },
      { key: "edit", label: T.edit, icon: Pencil, onSelect: () => setEditing(r) },
      { key: "delete", tone: "danger", label: T.deleteA, icon: Trash2, onSelect: () => { setRemoveErr(null); setRemoving(r); } },
    ]} />
  );

  // The file's icon, and a spinner in its place while the file is on its way —
  // one box either way, so nothing in the row moves.
  const icon = (r, size) => (opening === r.id ? (
    <span className="inline-flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      {openPct == null
        ? <Loader2 size={Math.round(size * 0.55)} className="animate-spin" style={{ color: "var(--brand-text)" }} aria-hidden="true" />
        : <span className="text-[10px] font-semibold tabular-nums" style={{ color: "var(--brand-text)" }}>{openPct}%</span>}
    </span>
  ) : <FileIcon name={r.name} size={size} link={!!r.url} />);

  const openTip = (r) => (r.url ? `${T.matOpenLink} — ${r.name}`
    : !web && r.sendable === false ? fill(T.matBigOpen, { mb: wholeMb })
    : `${web ? T.matDownload : T.matSend} — ${r.name}`);

  const empty = !list.isLoading && rows.length === 0;
  const emptyNode = list.isError ? (
    <EmptyState tone="danger" title={T.loadFailed} message={errText(list.error, T)} showUploadLink={false}
      action={<Button variant="secondary" onClick={() => list.refetch()}>{T.retry}</Button>} />
  ) : (list.data?.rows || []).length === 0 ? (
    <EmptyState title={T.matEmpty} message={fill(T.matEmptyMsg, { mb: maxMb })} showUploadLink={false} icon={FolderOpen}
      action={<Button icon={Plus} onClick={() => setUploading(true)}>{T.matAdd}</Button>} />
  ) : (
    <EmptyState title={T.noMatch} message="" showUploadLink={false} icon={FolderOpen} />
  );

  const mobile = list.isLoading ? <div className="p-4"><SkeletonTable rows={4} cols={2} /></div> : empty ? emptyNode : (
    <ul>
      {rows.map((r) => (
        <li key={r.id} className="px-4 py-3 flex items-start gap-3" style={{ borderTop: "1px solid var(--border)" }}>
          {icon(r, 36)}
          <div className="min-w-0 flex-1">
            <button type="button" onClick={() => openFile(r)} title={openTip(r)}
              className="cell-link text-sm font-medium break-words" style={{ color: "var(--text-1)" }}>
              {r.title}
            </button>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" style={{ color: "var(--text-3)" }}>
              <MatDeptChip dept={r.department} T={T} />
              <span className="tabular-nums">{r.url ? r.name : humanSize(r.size)}</span>
              <span className="tabular-nums">{fmtDate(r.created_at)}</span>
            </div>
            {r.note && <p className="mt-1.5 text-xs whitespace-pre-wrap break-words" style={{ color: "var(--text-2)" }}>{r.note}</p>}
          </div>
          {menu(r)}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-4">
      <TableCard icon={FolderOpen} title={T.tabMaterials}
        right={list.data ? <span className="text-xs" style={{ color: "var(--text-3)" }}>{fill(T.rowsN, { n: rows.length })}</span> : null}
        toolbar={(
          <>
            <SearchInput value={q} onChange={setQ} placeholder={T.matSearch} className="w-full sm:w-64" />
            <FilterPanel sections={sections} />
            <Button size="lg" icon={Plus} onClick={() => setUploading(true)} className="sm:ml-auto">{T.matAdd}</Button>
          </>
        )}
        footer={(
          <div className="flex items-start gap-2 text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
            <Info size={13} className="mt-[1px] flex-shrink-0" aria-hidden="true" />
            <span>{T.matHow}</span>
          </div>
        )}
        mobile={mobile} fixed minWidth={640}>
        <colgroup>
          <col style={{ width: 170 }} /><col /><col style={{ width: 96 }} />
          <col style={{ width: 108 }} /><col style={{ width: 56 }} />
        </colgroup>
        <thead>
          <tr>
            <Th label={T.colDept} k="dept" sort={sort} onSort={onSort} />
            <Th label={T.colMaterial} k="title" sort={sort} onSort={onSort} />
            <Th label={T.colSize} k="size" sort={sort} onSort={onSort} align="right" />
            <Th label={T.colAdded} k="added" sort={sort} onSort={onSort} />
            <Th label="" />
          </tr>
        </thead>
        <tbody>
          {list.isLoading ? (
            [...Array(5)].map((_, i) => (
              <tr key={i}><td colSpan={5} className="px-3 py-3"><div className="h-4 rounded animate-pulse" style={{ background: "var(--bg-inner)" }} /></td></tr>
            ))
          ) : empty ? (
            <tr><td colSpan={5}>{emptyNode}</td></tr>
          ) : rows.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2"><MatDeptChip dept={r.department} T={T} /></td>
              <td className="px-3 py-1.5">
                <span className="flex items-center gap-2 min-w-0">
                  {icon(r, 26)}
                  <span className="min-w-0 truncate">
                    <button type="button" onClick={() => openFile(r)} title={openTip(r)}
                      className="cell-link font-medium" style={{ color: "var(--text-1)" }}>
                      {r.title}
                    </button>
                    {r.note && <span className="ml-2" title={r.note} style={{ color: "var(--text-3)" }}>{r.note}</span>}
                  </span>
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{humanSize(r.size) || "—"}</td>
              <td className="px-3 py-2 tabular-nums" title={r.created_by ? fill(T.matAddedBy, { who: r.created_by }) : ""}>{fmtDate(r.created_at)}</td>
              <td className="px-2 py-1 text-center">{menu(r)}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
      {uploading && (
        <AddModal T={T} wholeMb={wholeMb} maxMb={maxMb} partBytes={partBytes}
          onLinked={() => { refresh(); setUploading(false); toast.success(T.matLinkAdded); }}
          startDept={fDept === ALL ? GENERAL : fDept}
          onClose={() => setUploading(false)}
          onDone={(ok, bad) => {
            if (ok) refresh();
            if (!bad) { setUploading(false); toast.success(fill(T.matUploadedN, { n: ok })); }
            else toast.error(fill(T.matUploadSome, { ok, bad }));
          }} />
      )}
      {editing && (
        <EditModal row={editing} T={T} opening={opening} onOpen={openFile} onClose={() => setEditing(null)}
          onSaved={() => { refresh(); toast.success(T.saved); }} />
      )}
      {removing && (
        <ConfirmDialog tone="danger" title={T.matDeleteTitle} message={fill(T.matDeleteMsg, { title: removing.title })}
          confirmLabel={T.del} cancelLabel={T.cancel} loading={remove.isPending} error={removeErr}
          onCancel={() => setRemoving(null)} onConfirm={() => { setRemoveErr(null); remove.mutate(removing); }} />
      )}
      {toast.node}
    </div>
  );
}
