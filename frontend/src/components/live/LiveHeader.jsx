import { BookOpenText, Maximize2, Minimize2 } from "lucide-react";
import SegmentedToggle from "../ui/SegmentedToggle";
import Button from "../ui/Button";
import DateRangePicker from "../ui/DateRangePicker";
import { STATUS_COLOR, STATUS_INK, tp, dateOf } from "./liveUtils";

// The top of the wall screen: WHAT is on screen (the shift-day, and whether
// it is live) and the few controls a monitor needs. Quiet on purpose — the
// hero under it is what a viewer across the room reads.
export default function LiveHeader({
  data, t, offline,
  isFs, fsSupported, onToggleFs,
  shiftValue, onShift, canPickShift,
  replay, onReplay, canReplay,
  factoryPanel, onRules,
}) {
  const frame = data?.frame;
  const shifts = data?.shifts || {};
  const state = frame?.state || "running";
  const live = state === "running" && !offline;
  const stopped = data?.kpi?.cells_stopped || 0;

  const dot = offline ? STATUS_COLOR.quiet
    : !live ? STATUS_COLOR.quiet
    : stopped > 0 ? STATUS_COLOR.crit : STATUS_COLOR.ok;
  const stateLabel = offline ? t("live.offline").split(" — ")[0]
    : state === "replay" ? t("live.replay")
    : state === "running" ? (stopped > 0 ? tp(t, "live.status.stoppedN", { n: stopped }) : t("live.running"))
    : t("live.ended");
  const stateInk = offline ? STATUS_INK.warn : live && stopped > 0 ? STATUS_INK.crit : live ? "var(--text-2)" : "var(--text-3)";

  const shiftOptions = [1, 2].map((s) => ({
    value: s,
    label: tp(t, "live.shift", { n: s }),
    title: shifts[s] ? `${shifts[s].start}–${shifts[s].end}` : undefined,
  }));

  return (
    <div className="flex items-center justify-between gap-x-4 gap-y-3 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <span className="relative grid place-items-center w-3 h-3 flex-shrink-0" aria-hidden="true">
          {live && <span className="absolute inset-0 rounded-full live-halo" style={{ background: dot }} />}
          <span className="relative w-2.5 h-2.5 rounded-full" style={{ background: dot }} />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl md:text-[22px] font-semibold leading-tight tracking-[-0.01em]" style={{ color: "var(--text-1)" }}>
            {t("live.title")}
          </h1>
          <div className="mt-0.5 text-xs flex items-center gap-x-1.5 gap-y-0.5 flex-wrap" style={{ color: "var(--text-3)" }}>
            <span className="font-medium" style={{ color: stateInk }}>{stateLabel}</span>
            {frame && (
              <>
                <span aria-hidden="true">·</span>
                <span>{tp(t, "live.shift", { n: frame.shift })} {frame.start}–{frame.end}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{dateOf(frame.day)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {factoryPanel}
        {canPickShift && (
          <SegmentedToggle asTabs ariaLabel={t("filter.shift")} value={shiftValue} onChange={onShift} options={shiftOptions} />
        )}
        {canReplay && frame && (
          <div className="flex items-center gap-1">
            <DateRangePicker
              single compactLabel
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
        {!isFs && onRules && (
          <Button variant="ghost" size="lg" icon={BookOpenText} onClick={onRules} title={t("live.legend")} aria-label={t("live.legend")}>
            <span className="hidden xl:inline">{t("live.legend")}</span>
          </Button>
        )}
        {fsSupported && (
          <Button
            variant="secondary"
            size="lg"
            className="max-sm:hidden"
            icon={isFs ? Minimize2 : Maximize2}
            onClick={onToggleFs}
            title={isFs ? t("live.exitFullscreen") : t("live.fullscreen")}
            aria-label={isFs ? t("live.exitFullscreen") : t("live.fullscreen")}
          />
        )}
      </div>
    </div>
  );
}
