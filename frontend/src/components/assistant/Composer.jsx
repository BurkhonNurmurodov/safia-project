import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ArrowUp, Loader2, Mic, Paperclip, Square, Trash2 } from "lucide-react";
import api from "../../utils/api";
import { FileTile } from "../ui/FileIcon";
import { useLang } from "../../context/LangContext";
import useAT from "./useAT";
import useVoiceRecorder, { MAX_SECONDS, voiceSupported } from "./useVoiceRecorder";
import { fmtSecs } from "./Message";

const MAX_FILES = 5;
const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT = "image/*,application/pdf,.xlsx,.csv,.txt,.json,.md";
let seq = 0;

/**
 * ONE rounded field — the clip, the text and the send button inside it, like
 * every chat on the platform. The send button becomes a microphone while the
 * field is empty (a voice message is sent at once, the operator's choice, and
 * its transcript is what the user's bubble shows) and a Stop square while the
 * assistant is working. Files can be picked, dropped or pasted; one that is
 * refused stays as a red tile saying why.
 */
const Composer = forwardRef(function Composer({ onSend, running, onStop, disabled, autoFocus }, ref) {
  const { lang } = useLang();
  const t = useAT();
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);       // {key, name, size, id?, loading?, error?}
  const [sending, setSending] = useState(false);
  const [voiceErr, setVoiceErr] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const taRef = useRef(null);
  const pickRef = useRef(null);
  const rec = useVoiceRecorder();
  const canVoice = voiceSupported();

  useImperativeHandle(ref, () => ({
    focus: () => taRef.current?.focus(),
    fill: (v) => { setText(v); requestAnimationFrame(() => taRef.current?.focus()); },
  }));

  useEffect(() => {
    if (autoFocus && window.matchMedia?.("(pointer: fine)")?.matches) taRef.current?.focus();
  }, [autoFocus]);

  // The field grows with its text up to a third of the screen.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    // Empty: one line, whatever the placeholder would wrap to.
    if (!text) { ta.style.height = ""; return; }
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, Math.round(window.innerHeight * 0.33))}px`;
  }, [text]);

  const addFiles = useCallback((list) => {
    const room = MAX_FILES - files.length;
    [...list].slice(0, Math.max(0, room)).forEach((file) => {
      const key = `f${++seq}`;
      if (file.size > MAX_BYTES) {
        setFiles((fs) => [...fs, { key, name: file.name, size: file.size, error: t("assistant.file.tooLarge") }]);
        return;
      }
      setFiles((fs) => [...fs, { key, name: file.name || "file", size: file.size, loading: true }]);
      const fd = new FormData();
      fd.append("file", file, file.name || "file");
      api.post("/api/assistant/files", fd)
        .then((r) => setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, loading: false, id: r.data.id } : f))))
        .catch((e) => {
          const code = e?.response?.data?.detail;
          const msg = code === "unsupported" ? t("assistant.file.unsupported")
            : code === "too_large" ? t("assistant.file.tooLarge") : t("assistant.file.failed");
          setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, loading: false, error: msg } : f)));
        });
    });
  }, [files.length, t]);

  const ready = files.filter((f) => f.id);
  const uploading = files.some((f) => f.loading);
  const hasContent = text.trim() || ready.length;

  const submit = async (override) => {
    const body = override || { text: text.trim(), attachments: ready.map((f) => f.id) };
    if (!body.text && !(body.attachments || []).length) return;
    if (running || sending || disabled) return;
    setSending(true);
    try {
      // onSend answers false when the message did not go out (the reason is
      // already on screen) — the text stays, so nothing typed is lost.
      const ok = await onSend(body);
      if (ok !== false && !override) {
        setText("");
        setFiles([]);
      }
      return ok;
    } finally {
      setSending(false);
    }
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing
        && window.matchMedia?.("(pointer: fine)")?.matches) {
      e.preventDefault();
      submit();
    }
  };

  const finishVoice = useCallback(async () => {
    const out = rec.stop();
    if (!out) { setVoiceErr(t("assistant.voice.tooShort")); return; }
    setTranscribing(true);
    setVoiceErr("");
    try {
      const fd = new FormData();
      fd.append("audio", out.blob, "voice.wav");
      fd.append("lang", lang);
      const r = await api.post("/api/assistant/transcribe", fd);
      const said = (r.data?.text || "").trim();
      if (!said) { setVoiceErr(t("assistant.voice.empty")); return; }
      const ok = await submit({ text: said, attachments: ready.map((f) => f.id), voice: { seconds: out.seconds } });
      if (ok !== false) setFiles([]);
      else setText(said);
    } catch {
      setVoiceErr(t("assistant.voice.failed"));
    } finally {
      setTranscribing(false);
    }
  }, [rec, lang, t, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (rec.state === "recording" && rec.seconds >= MAX_SECONDS) finishVoice();
  }, [rec.state, rec.seconds, finishVoice]);

  useEffect(() => {
    if (rec.state === "denied") setVoiceErr(t("assistant.voice.denied"));
    else if (rec.state === "error") setVoiceErr(t("assistant.voice.failed"));
  }, [rec.state, t]);

  const recording = rec.state === "recording" || rec.state === "asking";

  return (
    <div
      onDragOver={(e) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); }}
      onDrop={(e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } }}
    >
      {files.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-1.5 mb-2">
          {files.map((f) => (
            <FileTile key={f.key} name={f.name} bytes={f.size} loading={f.loading} error={f.error}
              onRemove={() => setFiles((fs) => fs.filter((x) => x.key !== f.key))}
              removeLabel={t("assistant.file.remove")} />
          ))}
        </div>
      )}
      {(voiceErr || transcribing) && (
        <p className="text-xs mb-1.5 flex items-center gap-1.5" role="status"
          style={{ color: transcribing ? "var(--text-3)" : "var(--status-bad, #ef4444)" }}>
          {transcribing && <Loader2 size={12} className="animate-spin" />}
          {transcribing ? t("assistant.voice.transcribing") : voiceErr}
        </p>
      )}
      <div className="flex items-end gap-1.5 rounded-2xl pl-1.5 pr-1.5 py-1.5"
        style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)" }}>
        {recording ? (
          <>
            <button type="button" onClick={() => { rec.cancel(); setVoiceErr(""); }}
              aria-label={t("assistant.voice.cancel")} title={t("assistant.voice.cancel")}
              className="w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0 hover:bg-[var(--bg-card)]"
              style={{ color: "var(--text-3)" }}>
              <Trash2 size={17} />
            </button>
            <div className="flex-1 min-w-0 h-9 flex items-center gap-2.5 px-1" role="status">
              <span className="w-2.5 h-2.5 rounded-full animate-pulse flex-shrink-0" style={{ background: "#ef4444" }} />
              <span className="text-sm tabular-nums" style={{ color: "var(--text-1)" }}>
                {rec.state === "asking" ? t("assistant.voice.asking") : fmtSecs(rec.seconds)}
              </span>
              <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                <span className="block h-full rounded-full transition-[width] duration-100"
                  style={{ width: `${Math.min(100, Math.round(rec.level * 160))}%`, background: "var(--brand)" }} />
              </span>
              <span className="text-[11px] hidden sm:inline" style={{ color: "var(--text-3)" }}>
                {t("assistant.voice.limit", { m: MAX_SECONDS / 60 })}
              </span>
            </div>
            <button type="button" onClick={finishVoice} disabled={rec.state !== "recording"}
              aria-label={t("assistant.voice.send")} title={t("assistant.voice.send")}
              className="w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0"
              style={{ background: "var(--brand)", color: "var(--on-brand)" }}>
              <ArrowUp size={18} />
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => pickRef.current?.click()}
              disabled={disabled || files.length >= MAX_FILES}
              aria-label={t("assistant.attach")} title={t("assistant.attach")}
              className="w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0 hover:bg-[var(--bg-card)] disabled:opacity-40"
              style={{ color: "var(--text-3)" }}>
              <Paperclip size={17} />
            </button>
            <input ref={pickRef} type="file" multiple accept={ACCEPT} className="hidden"
              onChange={(e) => { addFiles(e.target.files || []); e.target.value = ""; }} />
            <textarea
              ref={taRef}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
              onPaste={(e) => {
                const imgs = [...(e.clipboardData?.files || [])];
                if (imgs.length) { e.preventDefault(); addFiles(imgs); }
              }}
              placeholder={t("assistant.placeholder")}
              aria-label={t("assistant.placeholder")}
              disabled={disabled}
              maxLength={8000}
              className="flex-1 min-w-0 resize-none bg-transparent outline-none py-2 leading-snug text-base md:text-sm"
              style={{ color: "var(--text-1)", maxHeight: "33vh" }}
            />
            {running ? (
              <button type="button" onClick={onStop}
                aria-label={t("assistant.stop")} title={t("assistant.stop")}
                className="w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0"
                style={{ background: "var(--text-1)", color: "var(--bg-card)" }}>
                <Square size={13} fill="currentColor" />
              </button>
            ) : !hasContent && canVoice && !uploading ? (
              <button type="button" onClick={() => { setVoiceErr(""); rec.start(); }} disabled={disabled || transcribing}
                aria-label={t("assistant.voice.start")} title={t("assistant.voice.start")}
                className="w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0 hover:bg-[var(--bg-card)] disabled:opacity-40"
                style={{ color: "var(--text-2)" }}>
                {transcribing ? <Loader2 size={17} className="animate-spin" /> : <Mic size={18} />}
              </button>
            ) : (
              <button type="button" onClick={() => submit()}
                disabled={!hasContent || uploading || sending || disabled}
                aria-label={t("assistant.send")} title={t("assistant.send")}
                className="w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0 disabled:opacity-40"
                style={{ background: "var(--brand)", color: "var(--on-brand)" }}>
                {sending ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={18} />}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
});

export default Composer;
