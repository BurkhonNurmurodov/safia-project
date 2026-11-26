import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The orb's voice: a WAV played through ONE AudioContext for the tab.
 *
 * An AudioContext and not an <audio> element: iOS and Telegram's web views
 * play sound only from something a touch unlocked, and the answer arrives
 * long after the tap that asked for it — seconds, sometimes minutes. So the
 * tap that starts LISTENING unlocks the context (`unlockAudio`), and the
 * answer is played on that same context later. It also hands out the level
 * the orb moves with while it speaks.
 */
let ctx = null;

/** Call INSIDE a tap. Opens (or wakes) the context the answer will play on. */
export function unlockAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    if (!ctx || ctx.state === "closed") ctx = new AC();
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    // Older iOS unlocks on a source STARTED in the gesture, not on resume().
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
  } catch { /* no sound on this device — the caption still answers */ }
}

/**
 * The orb's two earcons, drawn on the same unlocked context: two soft notes
 * going UP when it starts to listen, DOWN when it stops and sends. They are
 * the instant «I heard the tap» a voice needs — the answer itself is seconds
 * away. Scheduled even while the context is still waking: its clock stands
 * still until it runs, so the notes sound the moment it does.
 */
export function chime(up) {
  if (!ctx) return;
  try {
    const t = ctx.currentTime + 0.01;
    [up ? 660 : 880, up ? 880 : 660].forEach((hz, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = t + i * 0.09;
      osc.type = "sine";
      osc.frequency.value = hz;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.07, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.085);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.09);
    });
  } catch { /* a chime is never worth an error */ }
}

const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });

export default function useSpeaker() {
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const ref = useRef(null);       // the sound playing now: { src, raf, done }

  const stop = useCallback(() => {
    const r = ref.current;
    ref.current = null;
    if (!r) return;
    cancelAnimationFrame(r.raf);
    r.src.onended = null;
    try { r.src.stop(); } catch { /* it had already ended */ }
    setSpeaking(false);
    setLevel(0);
    r.done();
  }, []);

  useEffect(() => stop, [stop]);

  /** Play a WAV (ArrayBuffer). Resolves when it ends or is stopped; rejects
   *  when this device will not play it (never unlocked, or put to sleep). */
  const play = useCallback(async (bytes) => {
    stop();
    if (!ctx) throw new Error("locked");
    // resume() outside a gesture can stay pending for ever on iOS.
    if (ctx.state !== "running") await Promise.race([ctx.resume(), wait(1500)]);
    if (ctx.state !== "running") throw new Error("locked");
    const buffer = await new Promise((res, rej) => { ctx.decodeAudioData(bytes, res, rej); });
    const src = ctx.createBufferSource();
    const meter = ctx.createAnalyser();
    meter.fftSize = 256;
    src.buffer = buffer;
    src.connect(meter);
    meter.connect(ctx.destination);
    const wave = new Uint8Array(meter.fftSize);
    await new Promise((done) => {
      const r = { src, raf: 0, done };
      let last = 0;
      const tick = (now) => {
        r.raf = requestAnimationFrame(tick);
        if (now - last < 70) return;
        last = now;
        meter.getByteTimeDomainData(wave);
        let peak = 0;
        for (let i = 0; i < wave.length; i += 1) peak = Math.max(peak, Math.abs(wave[i] - 128));
        setLevel(peak / 128);
      };
      src.onended = () => { if (ref.current === r) stop(); };
      ref.current = r;
      setSpeaking(true);
      src.start(0);
      r.raf = requestAnimationFrame(tick);
    });
  }, [stop]);

  return { play, stop, speaking, level };
}
