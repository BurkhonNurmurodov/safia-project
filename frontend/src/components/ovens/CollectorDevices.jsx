import { useEffect, useRef, useState } from "react";
import { Cpu, RefreshCw, Loader2, Wifi, WifiOff } from "lucide-react";
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

function dur(T, s) {
  const n = Math.max(0, Math.round(Number(s) || 0));
  const d = Math.floor(n / 86400), h = Math.floor((n % 86400) / 3600), m = Math.floor((n % 3600) / 60);
  const part = (tpl, v) => tpl.replace("{n}", v);
  if (d) return `${part(T.day, d)} ${part(T.hr, h)}`;
  if (h) return `${part(T.hr, h)} ${part(T.min, m)}`;
  return part(T.min, m);
}

function Fact({ k, v }) {
  if (v == null || v === "") return null;
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-3)" }}>{k}</div>
      <div className="text-sm truncate tabular-nums" style={{ color: "var(--text-1)" }} title={String(v)}>{v}</div>
    </div>
  );
}

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
        <Fact k={onEth ? T.devWifiBackup : T.devWifi} v={wifi} />
        <Fact k={T.devLan} v={info.ip} />
        <Fact k={T.devUp} v={info.up ? dur(T, info.up) : null} />
        <Fact k={T.devMem} v={mem} />
        <Fact k={T.devOut} v={d.remote_ip} />
        <Fact k={T.devLastReq} v={d.last_path ? (T.devReq[d.last_path] || d.last_path) : null} />
      </div>
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
