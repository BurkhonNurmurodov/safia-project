import { statusBg } from "../../utils/formatters";
import { useLang } from "../../context/LangContext";

const STATUS_KEY_MAP = {
  "Over Capacity": { full: "status.overCapacity", short: "status.overCap" },
  "On Track":      { full: "status.onTrack",       short: "status.onTrack" },
  "Monitor":       { full: "status.monitor",        short: "status.monitor" },
  "Needs Attention":{ full: "status.needsAttention", short: "status.needsAttn" },
  "No Data":       { full: "status.noData",          short: "status.noData" },
};

export default function StatusBadge({ status, short = false }) {
  const { t } = useLang();
  const keys = STATUS_KEY_MAP[status];
  const label = keys ? t(short ? keys.short : keys.full) : status;
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap ${statusBg(status)}`}>
      {label}
    </span>
  );
}
