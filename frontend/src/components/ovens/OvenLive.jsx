import { Flame, DoorOpen, DoorClosed, Droplets, Wind, Thermometer, AlertTriangle, WifiOff, Clock3, Sprout } from "lucide-react";
import { TONE_HEX } from "../../utils/statusBands";
import { useOT, fill, ago, clock, fmtN, stamp, MODE_COLOR } from "./ovensUtil";

// «Hozir» — one card per oven, as the collector last read it (every minute).
// The state pill says only what the status can prove: baking (a bake total is
// running) or not, and — before that — whether the reading is current at all.
// The oven's own status line («Выпечка, Печение ручное») is printed as it is.

function Pill({ tone, icon: Icon, children }) {
  const c = tone === "bake" ? MODE_COLOR.bake_manual : tone === "bad" ? TONE_HEX.bad
    : tone === "warn" ? TONE_HEX.warn : "#94a3b8";
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ background: `${c}22`, color: tone === "idle" ? "var(--text-2)" : tone === "bake" ? "var(--text-1)" : `var(--status-${tone})`,
        border: `1px solid ${c}55` }}>
      {Icon && <Icon size={11} aria-hidden />} {children}
    </span>
  );
}

function Fact({ icon: Icon, label, value, tone }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0 text-xs">
      <Icon size={13} aria-hidden className="flex-shrink-0" style={{ color: "var(--text-3)" }} />
      <span className="truncate" style={{ color: "var(--text-3)" }}>{label}</span>
      <span className="font-semibold whitespace-nowrap ml-auto"
        style={{ color: tone ? `var(--status-${tone})` : "var(--text-1)" }}>{value}</span>
    </div>
  );
}

function OvenCard({ o, today }) {
  const T = useOT();
  const st = o.status;
  const never = !o.status_at;
  const failing = !!o.error && (!o.status_at || (o.tried_at && o.tried_at > o.status_at));
  const show = st && !never;
  let pill;
  if (never) pill = <Pill tone="idle" icon={WifiOff}>{failing ? T.stNoAnswer : T.stNever}</Pill>;
  else if (o.stale) pill = <Pill tone="warn" icon={Clock3}>{T.stStale}</Pill>;
  else if (st?.baking) pill = <Pill tone="bake" icon={Flame}>{T.stBaking}</Pill>;
  else pill = <Pill tone="idle">{T.stIdle}</Pill>;
  const pct = st?.baking && st.bake_total_s ? Math.min(100, (100 * (st.bake_elapsed_s || 0)) / st.bake_total_s) : null;
  const faults = st?.faults || [];

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3 min-w-0"
      style={{ background: "var(--bg-card)", border: `1px solid ${faults.length && !o.stale ? TONE_HEX.bad : "var(--border)"}`,
        opacity: o.active ? 1 : 0.6 }}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate" style={{ color: "var(--text-1)" }} title={o.name}>{o.name}</div>
          <div className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
            {o.ip}{o.age_s != null && <> · {ago(T, o.age_s)}</>}
          </div>
        </div>
        {pill}
      </div>

      {show ? (
        <>
          <div className="flex items-end gap-3">
            <div className="text-4xl font-bold tabular-nums leading-none" style={{ color: o.stale ? "var(--text-3)" : "var(--text-1)" }}>
              {st.oven_c == null ? "—" : `${fmtN(st.oven_c)}°`}
            </div>
            <div className="text-xs pb-0.5" style={{ color: "var(--text-3)" }}>
              {st.oven_set_c ? fill(T.set, { t: fmtN(st.oven_set_c) }) : T.noSet}
            </div>
          </div>
          {st.status_text && (
            <div className="text-xs truncate" style={{ color: "var(--text-2)" }} title={st.status_text}>{st.status_text}</div>
          )}
          {pct != null && (
            <div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}
                role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: MODE_COLOR.bake_manual }} />
              </div>
              <div className="flex justify-between text-[11px] tabular-nums mt-1" style={{ color: "var(--text-3)" }}>
                <span>{fill(T.of, { a: clock(st.bake_elapsed_s), b: clock(st.bake_total_s) })}</span>
                <span className="font-semibold" style={{ color: "var(--text-1)" }}>{fill(T.left, { t: clock(st.bake_left_s) })}</span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <Fact icon={st.door_open ? DoorOpen : DoorClosed} label={T.door}
              value={st.door_open == null ? "—" : st.door_open ? T.doorOpen : T.doorClosed} tone={st.door_open ? "warn" : null} />
            <Fact icon={Flame} label={T.heater} value={st.heater_on == null ? "—" : st.heater_on ? T.on : T.off} />
            <Fact icon={Droplets} label={T.steam} value={st.steam_on ? T.on : T.off} />
            <Fact icon={Wind} label={T.damper} value={st.damper_open_pct ? `${fmtN(st.damper_open_pct)}%` : T.off} />
            {(st.core1_c != null || st.core1_set_c) && (
              <Fact icon={Thermometer} label={T.core1} value={st.core1_c == null ? T.noProbe : `${fmtN(st.core1_c)}°`} />
            )}
            {(st.core2_c != null || st.core2_set_c) && (
              <Fact icon={Thermometer} label={T.core2} value={st.core2_c == null ? T.noProbe : `${fmtN(st.core2_c)}°`} />
            )}
            {st.energy_save && <Fact icon={Sprout} label={T.energySave} value={T.on} />}
          </div>
          {st.has_prover && (st.prover_set_c || st.prover_c != null || st.prover_status) ? (
            <div className="rounded-xl px-3 py-2 text-xs grid grid-cols-2 gap-x-4 gap-y-1" style={{ background: "var(--bg-inner)" }}>
              <div className="col-span-2 font-semibold" style={{ color: "var(--text-2)" }}>
                {T.prover}{st.prover_status ? ` · ${st.prover_status}` : ""}
              </div>
              <Fact icon={Thermometer} label="°C" value={st.prover_c == null ? "—" : `${fmtN(st.prover_c)}° / ${fmtN(st.prover_set_c)}°`} />
              <Fact icon={Droplets} label={T.proverRh} value={`${fmtN(st.prover_rh)}% / ${fmtN(st.prover_set_rh)}%`} />
            </div>
          ) : null}
          {faults.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {faults.map((f) => (
                <span key={f} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                  style={{ background: `${TONE_HEX.bad}22`, color: "var(--status-bad)", border: `1px solid ${TONE_HEX.bad}55` }}>
                  <AlertTriangle size={11} aria-hidden /> {T.faults[f] || f}
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="text-xs py-4" style={{ color: "var(--text-3)" }}>{T.stNever}</div>
      )}

      {failing && (
        <div className="text-[11px] flex items-start gap-1.5" style={{ color: "var(--status-warn)" }}>
          <WifiOff size={12} className="mt-0.5 flex-shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{fill(T.noAnswer, { at: stamp(o.tried_at), e: o.error })}</span>
        </div>
      )}

      <div className="mt-auto pt-2 text-[11px] flex items-center gap-1.5" style={{ borderTop: "1px solid var(--border)", color: "var(--text-3)" }}>
        <span className="font-semibold" style={{ color: "var(--text-2)" }}>{T.today}:</span>
        <span className="truncate">{today ? fill(T.todayLine, today) : T.todayNone}</span>
      </div>
    </div>
  );
}

export default function OvenLive({ board, todayRows }) {
  const T = useOT();
  const byOven = new Map((todayRows || []).filter((r) => r.logged).map((r) => {
    const bake = (r.mode_h?.bake_manual || 0) + (r.mode_h?.bake_recipe || 0);
    return [r.oven_id, { b: r.bakes, u: r.logged_h ? Math.round((100 * bake) / r.logged_h) : 0, d: r.door_open }];
  }));
  const collectors = [...new Set(board.ovens.map((o) => o.collector).filter(Boolean))];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
        {board.ovens.map((o) => <OvenCard key={o.id} o={o} today={byOven.get(o.id)} />)}
      </div>
      <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
        {T.liveNote}{collectors.length ? ` ${fill(T.collector, { c: collectors.join(", ") })}` : ""}
      </p>
    </div>
  );
}
