import { useCallback, useEffect, useRef, useState } from "react";
import { inAndroidApp } from "../../utils/session";

/**
 * Voice → a 16 kHz mono WAV, recorded with the Web Audio API.
 *
 * WAV and not MediaRecorder: Chrome records WebM/Opus, Safari MP4/AAC,
 * Telegram's web views either, and Gemini's audio formats list neither WebM nor
 * MP4 — a PCM WAV is the one container every recorder here can produce and
 * every model reads. 16 kHz mono is speech quality: a minute is ~1.9 MB.
 *
 * ScriptProcessorNode, deprecated as it is, rather than an AudioWorklet: a
 * worklet module is a script load the CSP and older iOS web views make
 * fragile, and a two-minute voice note does not need its real-time guarantees.
 *
 * The Safia Android app grants a page the camera only (MainActivity) — the
 * microphone needs a new APK — so the mic is not offered there until the app
 * says it can (`window.__safiaApp.mic`).
 */
export const MAX_SECONDS = 120;
const RATE = 16000;

export function voiceSupported() {
  if (typeof window === "undefined") return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  if (!(window.AudioContext || window.webkitAudioContext)) return false;
  if (inAndroidApp() && !window.__safiaApp?.mic) return false;
  return true;
}

export default function useVoiceRecorder() {
  const [state, setState] = useState("idle");   // idle · asking · recording · denied · error
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const ref = useRef(null);

  const cleanup = useCallback(() => {
    const r = ref.current;
    ref.current = null;
    if (!r) return;
    try { r.proc.disconnect(); } catch { /* already gone */ }
    try { r.src.disconnect(); } catch { /* already gone */ }
    r.stream.getTracks().forEach((tr) => tr.stop());
    clearInterval(r.timer);
    r.ctx.close().catch(() => {});
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (ref.current) return;
    setState("asking");
    setSeconds(0);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (e) {
      setState(e?.name === "NotAllowedError" || e?.name === "SecurityError" ? "denied" : "error");
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    proc.onaudioprocess = (ev) => {
      const input = ev.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(input));
      let peak = 0;
      for (let i = 0; i < input.length; i += 64) peak = Math.max(peak, Math.abs(input[i]));
      setLevel(peak);
    };
    src.connect(proc);
    proc.connect(ctx.destination);
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(s);
    }, 250);
    ref.current = { stream, ctx, src, proc, chunks, timer, startedAt };
    setState("recording");
  }, []);

  /** Stop and hand back { blob, seconds } — or null when nothing was said. */
  const stop = useCallback(() => {
    const r = ref.current;
    if (!r) return null;
    const secs = Math.max(1, Math.round((Date.now() - r.startedAt) / 1000));
    const rate = r.ctx.sampleRate;
    const chunks = r.chunks;
    cleanup();
    setState("idle");
    setLevel(0);
    const total = chunks.reduce((n, c) => n + c.length, 0);
    if (total < rate * 0.4) return null;
    const merged = new Float32Array(total);
    let off = 0;
    for (const c of chunks) { merged.set(c, off); off += c.length; }
    return { blob: encodeWav(downsample(merged, rate, RATE), RATE), seconds: secs };
  }, [cleanup]);

  const cancel = useCallback(() => {
    cleanup();
    setState("idle");
    setLevel(0);
    setSeconds(0);
  }, [cleanup]);

  return { state, seconds, level, start, stop, cancel, reset: () => setState("idle") };
}

function downsample(buf, from, to) {
  if (from === to) return buf;
  const ratio = from / to;
  const len = Math.floor(buf.length / ratio);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i += 1) {
    const a = Math.floor(i * ratio);
    const b = Math.min(buf.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = a; j < b; j += 1) sum += buf[j];
    out[i] = sum / Math.max(1, b - a);
  }
  return out;
}

function encodeWav(samples, rate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const w = (o, s) => { for (let i = 0; i < s.length; i += 1) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i += 1, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([v], { type: "audio/wav" });
}
