import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, CheckCircle2, XCircle } from "lucide-react";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import { useLang } from "../../context/LangContext";
import api from "../../utils/api";

/* ══ run progress ═════════════════════════════════════════════════════════════
 *
 * Queueing ten thousand verdicts from a button and then showing a toast is how
 * an operator ends up pressing that button three more times. A drain paces
 * itself over hours; without a bar the only observable difference between
 * "working" and "broken" is that the numbers eventually change.
 *
 * So: one strip, directly under the page tabs, on EVERY tab of /leaders — the
 * run is started from the register on Monitoring and watched from the AI tab,
 * and a progress bar you have to navigate to is a progress bar nobody sees.
 *
 * It polls only while a run is live, and it survives a reload because the run
 * is a server-side record rather than component state. When the queue empties
 * it flips to a short "finished" state instead of vanishing — a bar that
 * disappears at 100% leaves you unsure whether it completed or crashed.
 */

const BRAND = "#C8973F";
const GOOD = "#22c55e";

const TXT = {
  uz: {
    title: "AI tekshiruvi ketmoqda", of: "dan", checked: "tekshirildi",
    left: "qoldi", eta: "taxminan {t} qoldi", etaSoon: "tugay deb qoldi",
    stop: "To'xtatish", done: "Tekshiruv tugadi",
    doneN: "{n} ta xulosa yozildi", hide: "Yopish",
    cTitle: "Tekshiruv to'xtatilsinmi?",
    cBody: "Navbatdagi {n} ta qator o'tkazib yuboriladi. Ular keyin «Tekshirilmagan» rejimi bilan qaytariladi. Allaqachon yozilgan xulosalar saqlanib qoladi.",
    cGo: "Ha, to'xtatilsin", cCancel: "Yo'q, davom etsin",
    scope: { unchecked: "Tekshirilmaganlar", flagged: "Shubhalilar", clean: "Tozalar", all: "Hammasi" },
    h: "s", m: "daq", d: "kun",
  },
  uz_cyrl: {
    title: "AI текшируви кетмоқда", of: "дан", checked: "текширилди",
    left: "қолди", eta: "тахминан {t} қолди", etaSoon: "тугай деб қолди",
    stop: "Тўхтатиш", done: "Текширув тугади",
    doneN: "{n} та хулоса ёзилди", hide: "Ёпиш",
    cTitle: "Текширув тўхтатилсинми?",
    cBody: "Навбатдаги {n} та қатор ўтказиб юборилади. Улар кейин «Текширилмаган» режими билан қайтарилади. Аллақачон ёзилган хулосалар сақланиб қолади.",
    cGo: "Ҳа, тўхтатилсин", cCancel: "Йўқ, давом этсин",
    scope: { unchecked: "Текширилмаганлар", flagged: "Шубҳалилар", clean: "Тозалар", all: "Ҳаммаси" },
    h: "с", m: "дақ", d: "кун",
  },
  ru: {
    title: "Идёт проверка ИИ", of: "из", checked: "проверено",
    left: "осталось", eta: "осталось примерно {t}", etaSoon: "почти готово",
    stop: "Остановить", done: "Проверка завершена",
    doneN: "Записано выводов: {n}", hide: "Закрыть",
    cTitle: "Остановить проверку?",
    cBody: "Оставшиеся в очереди строки ({n}) будут пропущены. Их можно вернуть позже режимом «Непроверенные». Уже записанные выводы сохранятся.",
    cGo: "Да, остановить", cCancel: "Нет, продолжить",
    scope: { unchecked: "Непроверенные", flagged: "Сомнительные", clean: "Чистые", all: "Все" },
    h: "ч", m: "мин", d: "дн.",
  },
  en: {
    title: "AI review running", of: "of", checked: "checked",
    left: "left", eta: "about {t} left", etaSoon: "almost done",
    stop: "Stop", done: "Review finished",
    doneN: "{n} verdicts written", hide: "Dismiss",
    cTitle: "Stop the review?",
    cBody: "The {n} rows still queued will be skipped. You can bring them back later with the «Unchecked» mode. Verdicts already written are kept.",
    cGo: "Yes, stop", cCancel: "No, keep going",
    scope: { unchecked: "Unchecked", flagged: "Flagged", clean: "Clean", all: "All" },
    h: "h", m: "min", d: "d",
  },
};

const fmt = (s, v) => String(s).replace("{n}", v).replace("{t}", v);

/** Remaining time from the rate actually observed, not a guess. Null until
 *  enough has happened to mean anything — an ETA off the first verdict swings
 *  by hours and teaches people to ignore the number. */
function etaText(p, T) {
  if (!p.startedAt || p.done < 3) return null;
  const elapsed = (Date.now() - new Date(p.startedAt).getTime()) / 1000;
  if (elapsed < 5) return null;
  const left = Math.max(0, p.total - p.done);
  if (!left) return null;
  const secs = Math.round(left / (p.done / elapsed));
  if (secs < 60) return T.etaSoon;
  if (secs < 3600) return fmt(T.eta, `${Math.round(secs / 60)} ${T.m}`);
  // Days past two: the drain is batch-capped and timer-paced, so a real
  // backfill genuinely lands here — and "83.2 h" is a number nobody converts.
  if (secs < 172800) return fmt(T.eta, `${(secs / 3600).toFixed(1)} ${T.h}`);
  return fmt(T.eta, `${Math.round(secs / 86400)} ${T.d}`);
}

export default function AiProgress() {
  const { lang } = useLang();
  const T = TXT[lang] || TXT.ru;
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const { data: p } = useQuery({
    queryKey: ["leader-ai-progress"],
    queryFn: () => api.get("/api/leader-ai/progress").then((r) => r.data),
    // Poll HARD while a run is live and not at all otherwise. A dashboard that
    // polls all day for an event that happens twice a month is a cost with no
    // reader; one that polls every 30s during a run is a bar that looks frozen.
    refetchInterval: (q) => (q.state.data?.active ? 4000 : false),
    refetchOnWindowFocus: true,
  });

  const stop = useMutation({
    mutationFn: () => api.post("/api/leader-ai/progress/cancel").then((r) => r.data),
    onSuccess: () => {
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ["leader-ai-progress"] });
      qc.invalidateQueries({ queryKey: ["leader-ai-overview"] });
    },
  });

  // The run finished while this page was open: say so, once, then get out of
  // the way. `justFinished` only comes back on the poll that observes the
  // queue empty, so it cannot nag on every later load.
  const finished = p?.justFinished && !dismissed;
  if (!p || (!p.active && !finished)) return null;

  if (finished) {
    return (
      <div className="mb-3 rounded-xl px-3 py-2 flex items-center gap-2.5 flex-wrap"
        style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.30)" }}
        role="status">
        <CheckCircle2 size={15} color={GOOD} className="flex-shrink-0" />
        <span className="text-[13px] font-semibold" style={{ color: GOOD }}>{T.done}</span>
        <span className="text-xs tabular-nums" style={{ color: "var(--text-4)" }}>
          {fmt(T.doneN, p.done ?? 0)}
        </span>
        <Button size="sm" variant="ghost" className="ml-auto"
          onClick={() => setDismissed(true)}>{T.hide}</Button>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((p.done / Math.max(1, p.total)) * 100));
  const eta = etaText(p, T);

  return (
    <>
      <div className="mb-3 rounded-xl px-3 py-2.5"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2.5 flex-wrap mb-2">
          <Sparkles size={15} color={BRAND} className="flex-shrink-0" />
          <span className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
            {T.title}
          </span>
          {p.scope && (
            <span className="text-[11px] px-1.5 py-0.5 rounded"
              style={{ background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
              {T.scope[p.scope] || p.scope}
              {p.from || p.to ? ` · ${(p.from || "…").slice(5)}–${(p.to || "…").slice(5)}` : ""}
            </span>
          )}
          {/* Numbers first, percentage second: "1 129 of 1 174" answers "how
              much is left to pay for", which is the question quota makes you
              ask. The percentage alone never does. */}
          <span className="text-xs tabular-nums ml-auto" style={{ color: "var(--text-3)" }}>
            <b style={{ color: "var(--text-1)" }}>{p.done.toLocaleString()}</b>
            {" "}{T.of}{" "}{p.total.toLocaleString()} {T.checked}
          </span>
          <Button size="sm" variant="secondary" tint icon={<XCircle size={13} />}
            loading={stop.isPending} onClick={() => setConfirm(true)}>
            {T.stop}
          </Button>
        </div>

        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}
          role="progressbar" aria-valuemin={0} aria-valuemax={p.total}
          aria-valuenow={p.done} aria-label={T.title}>
          <div className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%`, background: BRAND }} />
        </div>

        <div className="flex items-center gap-2 mt-1.5 text-[11px] tabular-nums flex-wrap"
          style={{ color: "var(--text-4)" }}>
          <span>{pct}%</span>
          <span>·</span>
          <span>{p.pending.toLocaleString()} {T.left}</span>
          {eta && <><span>·</span><span>{eta}</span></>}
        </div>
      </div>

      {confirm && (
        <ConfirmDialog
          open
          tone="danger"
          title={T.cTitle}
          message={fmt(T.cBody, (p.pending ?? 0).toLocaleString())}
          confirmLabel={T.cGo}
          cancelLabel={T.cCancel}
          loading={stop.isPending}
          error={stop.error ? (stop.error?.response?.data?.detail || String(stop.error)) : null}
          onCancel={() => setConfirm(false)}
          onConfirm={() => stop.mutate()}
        />
      )}
    </>
  );
}
