import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { BotMessageSquare, Mic, Volume2, VolumeX, X } from "lucide-react";
import api from "../../utils/api";
import { leaveRef } from "../../utils/leave";
import { CATEGORY_COLORS } from "../../utils/chartPalette";
import { useLang } from "../../context/LangContext";
import { ACTIVE, useAssistant } from "../../context/AssistantContext";
import { hasOpenDialog } from "../ui/dialogLayers";
import Button from "../ui/Button";
import useAT from "./useAT";
import useAssistantPages from "./useAssistantPages";
import useVoiceRecorder, { MAX_SECONDS, voiceSupported } from "./useVoiceRecorder";
import useSpeaker, { unlockAudio } from "./useSpeaker";
import { quietGate, spokenLine } from "./voiceUtil";

/**
 * «Yordamchi» as a VOICE — the orb in the bottom-right corner (2026-11-26, the
 * operator: «a voice assistant just like Siri … when you speak it should move
 * … it should speak also»).
 *
 * It is the small form of the assistant, and the panel stays the full one:
 * the orb hears a question, shows what it heard, shows and SAYS the answer's
 * first line, and hands the rest — a table, a file, a plan to confirm — to
 * the chat behind «To'liq javob». It owns no brain of its own: a spoken
 * question goes down the very road a typed one does (`/transcribe` →
 * `A.send` → the run engine), so every permission, the Confirm step and the
 * Jurnal are the chat's. A change is NEVER confirmed by voice.
 *
 * Four states, told apart by shape first and the halo's hue second:
 *   idle       a microphone          tap → listen
 *   listening  bars moving with YOU   tap → send (it also sends by itself
 *                                     once you stop talking — `quietGate`)
 *   thinking   a turning arc          tap → open the chat
 *   speaking   bars moving with IT    tap → stop and listen again
 *
 * Turned on from the panel's header (`A.orb`, kept per device); hidden while
 * the panel or the full page is open — the conversation is on screen there.
 */
const HUE = { listening: CATEGORY_COLORS[2], thinking: CATEGORY_COLORS[5], speaking: CATEGORY_COLORS[6] };
const BARS = [0.5, 0.8, 1, 0.75, 0.45];
const MUTE_KEY = "assistant_orb_muted";
// Refusals of a send that have words of their own (routers/assistant.py).
const SEND_ERRORS = ["running", "busy", "not_configured", "no_access", "exam"];

export default function VoiceOrb() {
  const A = useAssistant();
  const on = !!A?.allowed && A.orb && !A.open && !A.onPage
    && A.me?.configured !== false && A.me?.voice !== false && voiceSupported();
  return on ? createPortal(<Orb />, document.body) : null;
}

function Orb() {
  const t = useAT();
  const A = useAssistant();
  const { lang } = useLang();
  const pages = useAssistantPages();
  const rec = useVoiceRecorder();
  const voice = useSpeaker();
  const [phase, setPhase] = useState("idle");
  const [caption, setCaption] = useState(null);     // { text, tone: heard · answer · error, more }
  const [job, setJob] = useState(null);             // the run this orb asked for: { tid, runId }
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
  });
  // Bumped by every new action: an answer to an older one that lands late
  // (a transcript, a spoken line still downloading) is dropped.
  const seq = useRef(0);

  const fail = (key, more = false) => {
    setPhase("idle");
    setCaption({ text: t(key), tone: "error", more });
  };

  // The orb goes away when the panel opens. A question still being turned
  // into text then is sent all the same (it appears in the chat that just
  // opened), but its answer is announced the usual way, not hushed for an orb
  // that is no longer there.
  const gone = useRef(false);
  useEffect(() => {
    gone.current = false;
    return () => { gone.current = true; A.hush(null); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The microphone was refused, or would not open.
  useEffect(() => {
    if (rec.state !== "denied" && rec.state !== "error") return;
    fail(rec.state === "denied" ? "assistant.voice.denied" : "assistant.voice.failed");
    rec.reset();
  }, [rec.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const say = async (text, more) => {
    const my = ++seq.current;
    setCaption({ text, tone: "answer", more });
    if (muted || !A.me?.speech) { setPhase("idle"); return; }
    // «Speaking» from here on, the second or two the voice takes to arrive
    // included: the answer is on screen, so the orb is no longer thinking —
    // and its shoulder button is the mute, not a Stop that would wipe it.
    setPhase("speaking");
    try {
      const r = await api.post("/api/assistant/speak", { text, lang }, { responseType: "arraybuffer" });
      // Dropped when something newer happened — or the orb itself is gone:
      // a sound started now would have nothing left to stop it.
      if (my !== seq.current || gone.current) return;
      await voice.play(r.data);
    } catch { /* the caption already answers; a voice that failed is not a second message */ }
    if (my === seq.current) setPhase("idle");
  };

  const finish = async () => {
    const out = rec.stop();
    if (!out) { fail("assistant.voice.tooShort"); return; }
    const my = ++seq.current;
    setPhase("thinking");
    setCaption(null);
    let said;
    try {
      const fd = new FormData();
      fd.append("audio", out.blob, "voice.wav");
      fd.append("lang", lang);
      said = ((await api.post("/api/assistant/transcribe", fd)).data?.text || "").trim();
    } catch (e) {
      if (my === seq.current) {
        fail(e?.response?.data?.detail === "no_key" ? "assistant.voice.noKey" : "assistant.voice.failed");
      }
      return;
    }
    if (my !== seq.current) return;
    if (!said) { fail("assistant.voice.empty"); return; }
    setCaption({ text: said, tone: "heard" });
    try {
      // `orb` is what makes the server answer on the fast model, in words to be heard.
      const d = await A.send({ text: said, voice: { seconds: out.seconds, orb: true }, pages });
      if (gone.current) return;
      if (my !== seq.current) { A.cancel(d.run_id).catch(() => {}); return; }   // stopped while it was being sent
      A.hush(d.run_id);
      setJob({ tid: d.thread_id, runId: d.run_id });
    } catch (e) {
      if (my !== seq.current) return;
      const code = e?.response?.data?.detail;
      fail(SEND_ERRORS.includes(code) ? `assistant.err.${code}` : "assistant.err.send");
    }
  };

  const stopAll = () => {
    seq.current += 1;
    rec.cancel();
    if (job) { A.cancel(job.runId).catch(() => {}); setJob(null); }
    setPhase("idle");
    setCaption(null);
  };

  // It sends by itself once the speaker has stopped talking, gives up when
  // nobody spoke, and never records past the recorder's cap.
  const recording = rec.state === "recording";
  // What the timers below read: this render's level and handlers.
  const live = useRef({});
  useEffect(() => {
    live.current = { level: rec.level, finish, fail, cancel: rec.cancel, stopAll };
  });
  // A microphone that opens AFTER the listening was called off (the browser's
  // permission prompt answered late) is closed again at once.
  useEffect(() => {
    if (recording && phase !== "listening") rec.cancel();
  }, [recording, phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!recording) return undefined;
    const gate = quietGate();
    const from = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const verdict = now - from >= MAX_SECONDS * 1000 ? "send" : gate(live.current.level, now);
      if (verdict) clearInterval(id);      // one verdict per recording — never a second send
      if (verdict === "send") live.current.finish();
      else if (verdict === "nothing") {
        seq.current += 1;
        live.current.cancel();
        live.current.fail("assistant.voice.empty");
      }
    }, 100);
    return () => clearInterval(id);
  }, [recording]);

  // The run it asked for, read twice a second while it works — a spoken
  // question is waited for with nothing to read (the chat reads its own once
  // a second, the context an out-of-sight chat every three).
  const q = useQuery({
    queryKey: ["assistant", "thread", job?.tid],
    queryFn: () => api.get(`/api/assistant/threads/${job.tid}`).then((r) => r.data),
    enabled: !!job,
    refetchInterval: (query) => (ACTIVE.includes(query.state.data?.run?.status) ? 500 : false),
    retry: false,
  });
  const run = q.data?.run;
  useEffect(() => {
    if (!job || !run || run.id !== job.runId || ACTIVE.includes(run.status)) return;
    setJob(null);
    if (run.status === "cancelled") { setPhase("idle"); setCaption(null); return; }
    // A change waits for a tap on its plan card in the chat — never for a spoken «yes».
    if (run.status === "awaiting_confirm") { say(t("assistant.orb.plan"), true); return; }
    if (run.status !== "done") { fail("assistant.orb.failed", true); return; }
    const m = [...(q.data.messages || [])].reverse().find((x) => x.role === "assistant" && x.run_id === run.id);
    const { line, more } = spokenLine(m?.text);
    const extra = (m?.data?.files || []).length > 0 || (m?.data?.links || []).length > 0;
    say(line || t("assistant.orb.ready"), more || extra || !line);
  }, [job, run?.id, run?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const onOrb = () => {
    unlockAudio();      // inside the tap: the answer plays long after it
    if (phase === "listening") { if (recording) finish(); return; }
    if (phase === "thinking") { A.setOpen(true); return; }
    seq.current += 1;
    voice.stop();
    setCaption(null);
    setPhase("listening");
    rec.start();
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    try { localStorage.setItem(MUTE_KEY, next ? "1" : "0"); } catch { /* storage refused */ }
    if (next && phase === "speaking") {      // also the voice still on its way
      seq.current += 1;
      voice.stop();
      setPhase("idle");
    }
  };

  useEffect(() => {
    if (phase !== "listening") return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented || hasOpenDialog()) return;
      live.current.stopAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  const level = phase === "listening" ? Math.min(1, rec.level * 2.2)
    : phase === "speaking" ? Math.min(1, voice.level * 1.6) : 0;
  const bars = phase === "listening" || phase === "speaking";
  const busy = phase === "listening" || phase === "thinking";
  const label = t(`assistant.orb.${phase}`);
  const stopLabel = t(phase === "listening" ? "assistant.voice.cancel" : "assistant.stop");
  const muteLabel = t(muted ? "assistant.orb.unmute" : "assistant.orb.mute");

  return (
    <div ref={leaveRef} className="orb-dock rise-in">
      <div role="status" aria-live="polite">
        {caption && (
          <div ref={leaveRef} className="orb-caption pop" data-side="top">
            <div className="flex items-start gap-2">
              <p className="flex-1 min-w-0 text-sm leading-snug break-words"
                style={{ color: caption.tone === "error" ? "var(--status-bad)"
                  : caption.tone === "heard" ? "var(--text-3)" : "var(--text-1)" }}>
                {caption.text}
              </p>
              {phase !== "thinking" && (
                <button type="button" onClick={() => setCaption(null)}
                  aria-label={t("assistant.close")} title={t("assistant.close")}
                  className="relative -mr-1 -mt-0.5 w-6 h-6 flex items-center justify-center rounded-md flex-shrink-0 hover:bg-[var(--bg-inner)]"
                  style={{ color: "var(--text-3)" }}>
                  <X size={14} />
                  <span className="absolute -inset-2.5 md:hidden" aria-hidden="true" />
                </button>
              )}
            </div>
            {caption.more && (
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => A.setOpen(true)}>
                {t("assistant.orb.open")}
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="relative flex-shrink-0">
        <button type="button" onClick={onOrb} className="orb" data-phase={phase}
          style={{ "--orb-hue": HUE[phase], "--orb-live": level }}
          aria-label={label} title={label}>
          <span className="orb-halo" aria-hidden="true" />
          <span className="orb-halo orb-halo-2" aria-hidden="true" />
          <span className="orb-core" aria-hidden="true">
            {bars ? BARS.map((w) => <span key={w} className="orb-bar" style={{ "--w": w }} />)
              : phase === "thinking" ? <BotMessageSquare size={22} /> : <Mic size={24} />}
          </span>
        </button>
        {/* The button on its shoulder: stop while it works; at rest, the
            voice's mute — where there is a voice to mute. */}
        {busy ? (
          <button type="button" onClick={stopAll} className="orb-chip" aria-label={stopLabel} title={stopLabel}>
            <X size={13} />
          </button>
        ) : A.me?.speech ? (
          <button type="button" onClick={toggleMute} className="orb-chip" aria-pressed={muted}
            aria-label={muteLabel} title={muteLabel}>
            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
        ) : null}
      </div>
    </div>
  );
}
