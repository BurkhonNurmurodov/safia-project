import { useEffect, useRef, useState } from "react";
import { Cpu, RefreshCw, Loader2, Wifi, WifiOff, AlertTriangle } from "lucide-react";
import api from "../../utils/api";
import Button from "../ui/Button";
import { SectionHead } from "../ui/DataTable";
import { TONE_HEX, toneTint } from "../../utils/statusBands";
import { fill, ago, stamp, fmtN, errOf } from "./ovensUtil";

// «Kollektor qurilmasi» on /panel/ovens — is the device that reads the ovens
// in touch right now? IMS cannot reach it (it sits on the factory network);
// it only hears it: every collector request counts, and firmware 1.1+ adds a
// heartbeat every 10 s. «Tekshirish» answers at once when the device was heard
// recently (the server's `online`), and otherwise waits up to the device's
// own `wait_s` for it to call in.

const POLL_MS = 3000;
// the board posts every oven's status once a minute; three missed is «stale»
const STATUS_STALE_S = 180;

function dur(T, s) {
  const n = Math.max(0, Math.round(Number(s) || 0));
  const d = Math.floor(n / 86400), h = Math.floor((n % 86400) / 3600), m = Math.floor((n % 3600) / 60);
  const part = (tpl, v) => tpl.replace("{n}", v);
  if (d) return `${part(T.day, d)} ${part(T.hr, h)}`;
  if (h) return `${part(T.hr, h)} ${part(T.min, m)}`;
  return part(T.min, m);
}

function Fact({ k, v, tone }) {
  if (v == null || v === "") return null;
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-3)" }}>{k}</div>
      <div className="text-sm truncate tabular-nums" style={{ color: tone ? TONE_HEX[tone] : "var(--text-1)", fontWeight: tone ? 600 : undefined }} title={String(v)}>{v}</div>
    </div>
  );
}

// Wi-Fi signal: from about -80 dBm a big POST (a status of every oven, a log
// file) starts to fail while the small plan GET and the heartbeat still pass.
const WEAK_DBM = -80;
const VERY_WEAK_DBM = -85;

function Device({ d, T, waited, published }) {
  const tone = d.online ? "ok" : "bad";
  const info = d.info || {};
  const rich = !!(info.rssi || info.up || info.heap);
  const wifi = info.ssid || info.rssi ? [info.ssid, info.rssi ? `${info.rssi} dBm` : null].filter(Boolean).join(" · ") : null;
  // firmware 1.2.0+: the way out it used — Ethernet (a W5500), else Wi-Fi
  const onEth = info.net === "eth";
  const net = onEth ? (info.link ? fill(T.netEth, { n: info.link }) : T.netEthBare) : info.net === "wifi" ? T.netWifi : null;
  // RAM in KB, the 2 MB PSRAM in MB — short enough for a quarter of the card
  const mem = info.heap ? `${fmtN(info.heap)} KB${info.psram ? ` · ${fmtN(info.psram / 1024, 1)} MB` : ""}` : null;
  const dbm = info.rssi != null && info.rssi !== "" ? Number(info.rssi) : NaN;
  const weakTone = Number.isFinite(dbm) && dbm <= WEAK_DBM ? (dbm <= VERY_WEAK_DBM ? "bad" : "warn") : null;
  const stale = d.online && d.status_at && d.status_age_s > STATUS_STALE_S;
  return (
    <div className="px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ background: toneTint(tone), color: TONE_HEX[tone] }}>
          {d.online ? <Wifi size={13} /> : <WifiOff size={13} />}
          {d.online ? T.devOnline : T.devOffline}
        </span>
        <span className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>{T.devNames[d.name] || d.name}</span>
        <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
          {d.last_seen ? fill(T.devHeard, { t: `${ago(T, d.age_s)} (${stamp(d.last_seen)})` }) : T.devNever}
        </span>
      </div>
      {!d.online && waited > 0 && (
        <p className="mt-1.5 text-xs" style={{ color: "var(--text-2)" }}>{fill(T.devNoAnswer, { s: waited })}</p>
      )}
      {/* offline: these are the device's LAST report, not live values — dimmed */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2.5" style={{ opacity: d.online ? 1 : 0.55 }}>
        <Fact k={T.devFw} v={d.fw && published && published !== d.fw ? fill(T.devFwNext, { v: d.fw, n: published }) : d.fw} />
        <Fact k={T.devNet} v={net} />
        <Fact k={onEth ? T.devWifiBackup : T.devWifi} v={wifi} tone={weakTone} />
        <Fact k={T.devLan} v={info.ip} />
        <Fact k={T.devUp} v={info.up ? dur(T, info.up) : null} />
        <Fact k={T.devMem} v={mem} />
        <Fact k={T.devBlk} v={info.blk ? `${fmtN(info.blk)} KB` : null} />
        <Fact k={T.devSent} v={info.sent != null && info.sent !== "" ? ago(T, Number(info.sent)) : null} />
        <Fact k={T.devOut} v={d.remote_ip} />
        <Fact k={T.devLastReq} v={d.last_path ? (T.devReq[d.last_path] || d.last_path) : null} />
        <Fact k={T.devStatusAt} v={d.status_at ? `${ago(T, d.status_age_s)} (${stamp(d.status_at)})` : null} />
        <Fact k={T.devFileAt} v={d.file_at ? stamp(d.file_at) : null} />
      </div>
      {stale && (
        <p className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-xs"
          style={{ background: toneTint("warn"), color: "var(--text-1)" }}>
          <AlertTriangle size={14} className="shrink-0 mt-px" style={{ color: TONE_HEX.warn }} />
          <span>
            {fill(T.devStale, { t: stamp(d.status_at) })}
            {info.err ? <>{" "}{T.devErr}: <b className="font-semibold">{info.err}</b></> : null}
          </span>
        </p>
      )}
      {d.online && weakTone === "bad" && (
        <p className="mt-2 flex items-start gap-2 rounded-xl px-3 py-2 text-xs"
          style={{ background: toneTint("warn"), color: "var(--text-1)" }}>
          <WifiOff size={14} className="shrink-0 mt-px" style={{ color: TONE_HEX.warn }} />
          <span>{fill(T.devWeak, { n: info.rssi })}</span>
        </p>
      )}
      {(d.trouble || []).length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-3)" }}>{T.devTrouble}</div>
          <ul className="mt-1 space-y-1">
            {d.trouble.slice(0, 4).map((x, i) => (
              <li key={i} className="text-xs tabular-nums" style={{ color: "var(--text-2)" }}>
                <span style={{ color: "var(--text-1)" }}>{stamp(x.at)}</span>
                {" · "}{T.devReq[x.what] || x.what}{x.http ? ` · HTTP ${x.http}` : ""}{" — "}{x.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!rich && d.fw && <p className="mt-2 text-[11px]" style={{ color: "var(--text-3)" }}>{T.devOldFw}</p>}
    </div>
  );
}

export default function CollectorDevices({ T }) {
  const [st, setSt] = useState({ phase: "idle" });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const check = async () => {
    const t0 = Date.now();
    setSt({ phase: "checking", wait: 0 });
    try {
      for (;;) {
        const { data } = await api.get("/api/admin/ovens/devices");
        if (!alive.current) return;
        const devs = data.devices || [];
        const pending = devs.filter((d) => !d.online);
        const waitMax = Math.max(0, ...pending.map((d) => d.wait_s || 0));
        const elapsed = (Date.now() - t0) / 1000;
        if (!pending.length || elapsed >= waitMax) {
          setSt({ phase: "done", devs, fw: data.firmware?.version || null, waited: pending.length ? Math.round(elapsed) : 0, at: new Date().toISOString() });
          return;
        }
        setSt({ phase: "checking", wait: Math.round(waitMax - elapsed), devs, fw: data.firmware?.version || null });
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (!alive.current) return;
      }
    } catch (e) {
      if (alive.current) setSt({ phase: "error", error: errOf(T, e) });
    }
  };

  const busy = st.phase === "checking";
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={Cpu} title={T.devTitle}
        right={
          <Button size="md" variant="primary" onClick={check} disabled={busy} aria-busy={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {busy ? T.devChecking : T.devCheck}
          </Button>
        } />
      <div aria-live="polite">
        {st.phase === "idle" && <p className="px-4 py-4 text-sm" style={{ color: "var(--text-2)" }}>{T.devPrompt}</p>}
        {st.phase === "checking" && (
          <p className="px-4 py-4 text-sm flex items-center gap-2" style={{ color: "var(--text-2)" }}>
            <Loader2 size={14} className="animate-spin shrink-0" />
            {st.wait ? fill(T.devWaiting, { s: st.wait }) : T.devChecking}
          </p>
        )}
        {st.phase === "error" && <p className="px-4 py-4 text-sm" style={{ color: TONE_HEX.bad }}>{st.error}</p>}
        {st.phase === "done" && (
          st.devs.length ? (
            <>
              {st.devs.map((d) => <Device key={d.name} d={d} T={T} waited={st.waited} published={st.fw} />)}
              <p className="px-4 py-2 text-[11px] tabular-nums" style={{ color: "var(--text-3)", borderTop: "1px solid var(--border)" }}>
                {fill(T.devCheckedAt, { t: stamp(st.at) })}
              </p>
            </>
          ) : <p className="px-4 py-4 text-sm" style={{ color: "var(--text-2)" }}>{T.devNone}</p>
        )}
      </div>
    </div>
  );
}
