import { statusBg } from "../../utils/formatters";
import { useLang } from "../../context/LangContext";

const STATUS_KEY_MAP = {
  "Over Capacity": { full: "status.overCapacity", short: "status.overCap" },
  "Good":          { full: "status.good",          short: "status.good" },
  "On Track":      { full: "status.onTrack",       short: "status.onTrack" },
  "Monitor":       { full: "status.monitor",        short: "status.monitor" },
  "Needs Attention":{ full: "status.needsAttention", short: "status.needsAttn" },
  "No Data":       { full: "status.noData",          short: "status.noData" },
};

// `color` (a hex from the admin diff segments) drives the badge live when the
// status is derived from D = P − A; without it we fall back to the static
// status→class map for legacy/No-Data cases.
export default function StatusBadge({ status, short = false, color = null }) {
  const { t } = useLang();
  const keys = STATUS_KEY_MAP[status];
  const label = keys ? t(short ? keys.short : keys.full) : status;
  const style = color
    ? { background: `${color}22`, borderColor: `${color}59`, color }
    : undefined;
  return (
    <span
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap ${color ? "" : statusBg(status)}`}
      style={style}
    >
      {label}
    </span>
  );
}
