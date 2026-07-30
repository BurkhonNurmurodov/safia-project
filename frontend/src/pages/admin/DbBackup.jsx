import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DatabaseBackup, Send, CheckCircle, ShieldAlert, Table2, Upload, FileArchive, X } from "lucide-react";
import api from "../../utils/api";
import Button from "../../components/ui/Button";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import TableCard, { Th } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useLang } from "../../context/LangContext";

// An oversized dump is DM'd as .part001, .part002, … and those parts are what
// the user re-uploads. `accept` can't express ".partNNN" as a wildcard, so the
// range is enumerated — nine parts is ~400 MB compressed, far past anything
// this database will reach. The server-side guard is the real check either way.
const DUMP_ACCEPT = [".sql", ".gz", ...Array.from({ length: 9 }, (_, i) => `.part00${i + 1}`)].join(",");

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  for (const u of units) {
    if (v < 1024 || u === "GB") return `${v.toFixed(1)} ${u}`;
    v /= 1024;
  }
}

export default function DbBackup() {
  const { t } = useLang();

  const [drops, setDrops]   = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast]   = useState(false);
  const [sort, setSort]     = useState({ key: "bytes", dir: "desc" });

  const { data, isLoading } = useQuery({
    queryKey: ["db-dump-inventory"],
    queryFn: () => api.get("/admin/db-dump/inventory").then((r) => r.data),
    staleTime: 60_000,
  });

  const rows = useMemo(() => {
    const list = [...(data?.tables ?? [])];
    const { key, dir } = sort;
    const mul = dir === "asc" ? 1 : -1;
    list.sort((a, b) =>
      key === "table" ? mul * a.table.localeCompare(b.table) : mul * (a[key] - b[key]));
    return list;
  }, [data, sort]);

  function onSort(k) {
    setSort((p) => (p.key === k
      ? { key: k, dir: p.dir === "asc" ? "desc" : "asc" }
      : { key: k, dir: k === "table" ? "asc" : "desc" }));
  }

  const dumpMut = useMutation({
    mutationFn: () => api.post("/admin/db-dump", { include_drops: drops }),
    onSuccess: () => {
      setConfirm(false);
      setToast(true);
      setTimeout(() => setToast(false), 8000);
    },
  });

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-8 space-y-5">
      {/* What this does */}
      <div className="rounded-2xl p-4 sm:p-5 space-y-4"
           style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 grid place-items-center w-9 h-9 rounded-xl"
                style={{ background: "color-mix(in srgb, var(--brand) 14%, transparent)" }}>
            <DatabaseBackup size={17} style={{ color: "var(--brand-text)" }} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>
              {t("admin.dbdump.title")}
            </div>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-3)" }}>
              {t("admin.dbdump.desc")}
            </p>
          </div>
        </div>

        {/* Personal-data warning — the dump is every phone number in one file */}
        <div className="flex items-start gap-2.5 rounded-xl px-3 py-2.5"
             style={{ background: "color-mix(in srgb, #eab308 12%, transparent)" }}>
          <ShieldAlert size={14} className="flex-shrink-0 mt-0.5" style={{ color: "#eab308" }} />
          <span className="text-[11px] leading-relaxed" style={{ color: "var(--text-2)" }}>
            {t("admin.dbdump.warning")}
          </span>
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={drops}
            onChange={(e) => setDrops(e.target.checked)}
            className="w-4 h-4 mt-0.5 accent-[var(--brand)] flex-shrink-0"
          />
          <span className="min-w-0">
            <span className="text-xs font-medium block" style={{ color: "var(--text-1)" }}>
              {t("admin.dbdump.dropLabel")}
            </span>
            <span className="text-[11px] block mt-0.5" style={{ color: "var(--text-4)" }}>
              {t("admin.dbdump.dropHint")}
            </span>
          </span>
        </label>

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-[11px]" style={{ color: "var(--text-4)" }}>
            {data
              ? t("admin.dbdump.totalSize")
                  .replace("{n}", rows.length)
                  .replace("{size}", fmtBytes(data.total_bytes))
              : ""}
          </span>
          <Button
            size="lg"
            icon={<Send size={14} />}
            loading={dumpMut.isPending}
            onClick={() => setConfirm(true)}
          >
            {t("admin.dbdump.exportBtn")}
          </Button>
        </div>
      </div>

      {/* What's in it */}
      {isLoading ? (
        <SkeletonBlock className="h-72 rounded-2xl" />
      ) : (
        <TableCard
          icon={Table2}
          title={t("admin.dbdump.inventoryTitle")}
          subtitle={t("admin.dbdump.approx")}
          right={<span className="text-[11px]" style={{ color: "var(--text-4)" }}>{rows.length}</span>}
          maxHeight="60vh"
        >
          <thead>
            <tr>
              <Th label={t("admin.dbdump.tableCol")} k="table" sort={sort} onSort={onSort} />
              <Th label={t("admin.dbdump.rowsCol")}  k="rows"  sort={sort} onSort={onSort} align="right" />
              <Th label={t("admin.dbdump.sizeCol")}  k="bytes" sort={sort} onSort={onSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.table}>
                <td className="px-3 py-2 font-mono text-[11px]">{r.table}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-2)" }}>
                  {r.rows.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-2)" }}>
                  {fmtBytes(r.bytes)}
                </td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}

      <ConfirmDialog
        open={confirm}
        onCancel={() => !dumpMut.isPending && setConfirm(false)}
        onConfirm={() => dumpMut.mutate()}
        title={t("admin.dbdump.confirmTitle")}
        message={t("admin.dbdump.confirmMsg")}
        confirmLabel={t("admin.dbdump.exportBtn")}
        cancelLabel={t("admin.broadcast.cancel")}
        loading={dumpMut.isPending}
      />

      {toast && (
        <div
          className="toast-in flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm shadow-lg"
          style={{
            position: "fixed", top: 16, right: 16, zIndex: 9999,
            background: "#22c55e", color: "#fff", maxWidth: 360,
            boxShadow: "0 8px 24px rgba(34,197,94,0.35)",
          }}
        >
          <CheckCircle size={15} style={{ flexShrink: 0 }} />
          <span>{t("admin.dbdump.successToast")}</span>
        </div>
      )}
    </div>
  );
}
