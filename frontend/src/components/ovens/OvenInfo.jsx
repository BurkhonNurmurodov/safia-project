import { useMemo, useState } from "react";
import { Cpu, Gauge, Settings2, RotateCcw } from "lucide-react";
import TableCard, { Th, SectionHead } from "../ui/DataTable";
import SearchInput from "../ui/SearchInput";
import { cardStyle } from "../ui/AnalysisBoard";
import { useOT, fill, ddmmyy, hhmm, stamp, fmtN } from "./ovensUtil";

// «Pech ma'lumotlari» — what the oven says about itself: its settings file
// (OvenSettings.xml, every setting with the oven's own label; passwords never
// shown), its software versions read off the log, and the running-hour
// counters of ServiceData.txt, which the oven does not name.

function Row({ label, value }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5 text-sm" style={{ borderTop: "1px solid var(--border)" }}>
      <span className="w-40 flex-shrink-0 text-xs" style={{ color: "var(--text-3)" }}>{label}</span>
      <span className="min-w-0 break-words font-medium tabular-nums" style={{ color: value ? "var(--text-1)" : "var(--text-4)" }}>{value || "—"}</span>
    </div>
  );
}

export default function OvenInfo({ info }) {
  const T = useOT();
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (info.settings || []).filter((s) => !n || `${s.id} ${s.label || ""} ${s.value || ""} ${s.section || ""}`
      .toLowerCase().includes(n));
  }, [info.settings, q]);

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <div className="rounded-2xl overflow-hidden lg:col-span-2" style={cardStyle}>
          <SectionHead icon={Cpu} title={T.secOven} subtitle={info.oven.name} />
          <div className="px-4 pb-3">
            <Row label={T.serial} value={info.serial} />
            <Row label={T.modelType} value={info.model_type} />
            <Row label={T.ovenName} value={info.oven_name} />
            <Row label={T.release} value={info.release} />
            <Row label={T.oi} value={info.oi ? `HW ${info.oi.hw} · SW ${info.oi.sw}` : null} />
            <Row label={T.mcp} value={info.mcp_version} />
            <Row label={T.ipLabel} value={`${info.oven.ip}:${info.oven.port}`} />
          </div>
        </div>
        <div className="rounded-2xl overflow-hidden flex flex-col" style={cardStyle}>
          <SectionHead icon={Gauge} title={T.secService} subtitle={T.serviceSub} />
          <div className="px-4 pb-3 flex-1">
            {info.service?.length ? info.service.map((c) => (
              <Row key={c.id} label={fill(T.counter, { n: c.id })} value={c.hours != null ? `${fmtN(c.hours, 1)} h` : c.raw} />
            )) : <p className="text-xs py-3" style={{ color: "var(--text-3)" }}>—</p>}
            {info.service_at && <p className="text-[11px] pt-2" style={{ color: "var(--text-4)" }}>{stamp(info.service_at)}</p>}
          </div>
          {info.restarts?.length > 0 && (
            <>
              <SectionHead icon={RotateCcw} title={T.restarts} subtitle={T.restartsSub} />
              <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                {info.restarts.map((r, i) => (
                  <span key={i} className="text-[11px] tabular-nums px-2 py-0.5 rounded-md"
                    style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
                    {ddmmyy(r.t).slice(0, 5)} {hhmm(r.t)}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <TableCard icon={Settings2} title={T.secSettings}
        subtitle={info.settings?.length ? fill(T.settingsSub, { n: fmtN(info.settings.length), at: stamp(info.settings_at) }) : T.noSettings}
        right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{fmtN(rows.length)}</span>}
        toolbar={<SearchInput value={q} onChange={setQ} placeholder={T.settingsSearch} className="w-full sm:w-72" />}
        fixed minWidth={820}
        mobile={rows.length ? (
          <ul>
            {rows.map((s) => (
              <li key={s.id} className="px-4 py-2.5 text-xs" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1" style={{ color: "var(--text-2)" }}>{s.label || s.id}</span>
                  <span className="font-semibold tabular-nums break-all" style={{ color: "var(--text-1)" }}>{s.value ?? "—"}</span>
                </div>
                <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-4)" }}>{s.id}</div>
              </li>
            ))}
          </ul>
        ) : <div className="px-4 py-6 text-center text-xs" style={{ color: "var(--text-3)" }}>{T.noSettings}</div>}>
        <colgroup><col style={{ width: "34%" }} /><col style={{ width: "30%" }} /><col style={{ width: "20%" }} /><col style={{ width: "16%" }} /></colgroup>
        <thead>
          <tr><Th label={T.cSetting} /><Th label="ID" /><Th label={T.cValue} align="right" /><Th label={T.cRange} align="right" /></tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td className="px-3 py-2 max-w-0 truncate" title={s.label || ""} style={{ color: "var(--text-1)" }}>{s.label || "—"}</td>
              <td className="px-3 py-2 max-w-0 truncate text-[11px] font-mono" title={s.id} style={{ color: "var(--text-3)" }}>{s.id}</td>
              <td className="px-3 py-2 max-w-0 truncate text-right tabular-nums font-semibold" title={s.value || ""}>{s.value ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums text-[11px]" style={{ color: "var(--text-3)" }}>
                {s.min != null || s.max != null ? `${s.min ?? ""}…${s.max ?? ""}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </div>
  );
}
