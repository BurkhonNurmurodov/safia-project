import { Maximize2, Minimize2, Radio, WifiOff, Clock3, CalendarDays } from "lucide-react";
import SegmentedToggle from "../ui/SegmentedToggle";
import Button from "../ui/Button";
import DateRangePicker from "../ui/DateRangePicker";
import { STATUS_COLOR, hexA, tp, fmtHM, clockOf, dateOf } from "./liveUtils";

// The top of the wall screen: WHICH shift-day is on the clock, how far through
// it we are, whether the screen is live, and the two controls a monitor needs
// (shift, fullscreen). Everything a viewer across the room must be able to
// read without walking over is on the first row.
export default function LiveHeader({
  data, t, tl, now, refreshedAt, interval, fetching, offline,
  isFs, fsSupported, onToggleFs,
  shiftValue, onShift, canPickShift,
  replay, onReplay, canReplay,
  factoryPanel,
}) {
  const frame = data?.frame;
  const shifts = data?.shifts || {};
  const state = frame?.state || "running";
  const live = state === "running" && !offline;

  // Elapsed runs off the client clock between polls, so the bar moves every
  // second rather than every 30 — the server's own figure is the anchor.
  let elapsed = frame?.elapsed_min ?? 0;
  let progress = frame?.progress ?? 0;
  if (frame && state === "running" && frame.started_at) {
    const started = new Date(frame.started_at).getTime();
    if (!Number.isNaN(started)) {
      elapsed = Math.max(0, Math.min(frame.duration_min, (now - started) / 60000));
      progress = frame.duration_min ? elapsed / frame.duration_min : 0;
    }
  }
  const left = fmtHM(frame ? Math.max(0, frame.duration_min - elapsed) : null);
  const ago = refreshedAt ? Math.max(0, Math.round((now - refreshedAt) / 1000)) : null;

  const dotColor = offline ? STATUS_COLOR.quiet : live ? STATUS_COLOR.ok : STATUS_COLOR.quiet;
  const stateLabel = state === "replay" ? t("live.replay") : state === "running" ? t("live.running") : t("live.ended");

  const shiftOptions = [1, 2].map((s) => ({
    value: s,
    label: shifts[s] ? `${tp(t, "live.shift", { n: s })} · ${shifts[s].start}–${shifts[s].end}` : tp(t, "live.shift", { n: s }),
  }));

  const clock = new Date(now).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      {/* Poll sweep: a hairline that fills over one interval, restarted on every
          refresh — the screen visibly breathes, so a frozen one is noticeable. */}
      <div className="h-[3px] w-full" style={{ background: "var(--bg-inner)" }}>
        <div
          key={refreshedAt || 0}
          className="h-full live-sweep"
          style={{ background: offline ? STATUS_COLOR.quiet : "var(--brand)", "--live-interval": `${interval / 1000}s`, opacity: 0.9 }}
        />
      </div>

      <div className="px-4 md:px-5 pt-3 pb-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="grid place-items-center w-11 h-11 rounded-xl flex-shrink-0"
              style={{ background: hexA(dotColor, 0.14), color: dotColor }}
              title={stateLabel}
            >
              <Radio size={22} className={live ? "live-glow" : ""} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-2xl font-bold leading-tight" style={{ color: "var(--text-1)" }}>
                  {t("live.title")}
                </h1>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{ background: hexA(dotColor, 0.14), color: dotColor, border: `1px solid ${hexA(dotColor, 0.35)}` }}>
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${live ? "live-dot" : ""}`} style={{ background: dotColor }} />
                  {offline ? t("live.offline").split(" — ")[0] : stateLabel}
                </span>
              </div>
              <div className="text-xs mt-0.5 flex items-center gap-x-2 gap-y-0.5 flex-wrap" style={{ color: "var(--text-3)" }}>
                {frame && (
                  <>
                    <span className="font-semibold" style={{ color: "var(--text-2)" }}>{tp(t, "live.shift", { n: frame.shift })}</span>
                    <span>·</span>
                    <span title={t("live.windowNote")}>{tp(t, "live.window", { a: frame.start, b: frame.end })}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1"><CalendarDays size={12} />{dateOf(frame.day)}</span>
                    {state === "ended" && frame.next_start_at && (
                      <>
                        <span>·</span>
                        <span>{tp(t, "live.nextStart", { t: clockOf(frame.next_start_at) })}</span>
                      </>
                    )}
                  </>
                )}
                {!frame && <span>{t("live.subtitle")}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="hidden sm:flex items-center gap-1.5 font-mono text-2xl font-bold tabular-nums px-3 py-1 rounded-xl"
              style={{ background: "var(--bg-inner)", color: "var(--text-1)", border: "1px solid var(--border)" }}>
              <Clock3 size={18} style={{ color: "var(--text-3)" }} />
              {clock}
            </div>
            {factoryPanel}
            {canPickShift && (
              <SegmentedToggle
                asTabs
                ariaLabel={t("filter.shift")}
                value={shiftValue}
                onChange={onShift}
                options={shiftOptions}
              />
            )}
            {canReplay && frame && (
              <div className="flex items-center gap-1">
                <DateRangePicker
                  single
                  dateFrom={replay || frame.day}
                  dateTo={replay || frame.day}
                  setDateFrom={onReplay}
                  setDateTo={onReplay}
                  max={data?.shifts?.[data?.scope?.shift]?.day || frame.day}
                  triggerClassName="px-3 py-2 text-sm"
                />
                {replay && (
                  <Button variant="secondary" size="lg" onClick={() => onReplay(null)}>{t("live.backToLive")}</Button>
                )}
              </div>
            )}
            {fsSupported && (
              <Button
                variant="secondary"
                size="lg"
                icon={isFs ? Minimize2 : Maximize2}
                onClick={onToggleFs}
                title={isFs ? t("live.exitFullscreen") : t("live.fullscreen")}
              >
                <span className="hidden lg:inline">{isFs ? t("live.exitFullscreen") : t("live.fullscreen")}</span>
              </Button>
            )}
          </div>
        </div>

        {frame && (
          <div className="flex flex-col gap-1.5">
            <div className="relative h-3 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
              <div
                className="absolute inset-y-0 left-0 rounded-full live-bar"
                style={{
                  width: `${Math.round(progress * 1000) / 10}%`,
                  background: state === "running"
                    ? "linear-gradient(90deg, rgba(200,151,63,.55), var(--brand))"
                    : "linear-gradient(90deg, rgba(148,163,184,.4), #94a3b8)",
                }}
              />
              {state === "running" && (
                <div className="absolute top-0 bottom-0 w-[3px] rounded-full live-marker"
                  style={{ left: `calc(${Math.round(progress * 1000) / 10}% - 1px)`, background: "var(--text-1)", boxShadow: "0 0 0 2px var(--bg-card)" }} />
              )}
            </div>
            <div className="flex items-center justify-between gap-3 text-xs flex-wrap" style={{ color: "var(--text-3)" }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold" style={{ color: "var(--text-2)" }}>
                  {tp(t, "live.ofShift", { p: Math.round(progress * 100) })}
                </span>
                {state === "running" && left && (
                  <>
                    <span>·</span>
                    <span>{tp(t, "live.left", { h: left.h, m: left.m })}</span>
                  </>
                )}
                <span>·</span>
                <span className="font-mono">{frame.start} → {frame.end}</span>
              </div>
              <div className="flex items-center gap-2">
                {offline ? (
                  <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: STATUS_COLOR.warn }}>
                    <WifiOff size={13} />
                    {tp(t, "live.offline", { t: refreshedAt ? clockOf(new Date(refreshedAt).toISOString()) : "—" })}
                  </span>
                ) : fetching ? (
                  <span>{t("live.updating")}</span>
                ) : ago != null ? (
                  <span>{tp(t, "live.updated", { s: ago })}</span>
                ) : null}
              </div>
            </div>
            {state === "replay" && (
              <div className="text-xs font-semibold px-3 py-2 rounded-xl mt-1"
                style={{ background: hexA(STATUS_COLOR.warn, 0.12), color: STATUS_COLOR.warn, border: `1px solid ${hexA(STATUS_COLOR.warn, 0.3)}` }}>
                {t("live.replayHint")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
