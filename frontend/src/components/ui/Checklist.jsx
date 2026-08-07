import { CheckCircle2, XCircle } from "lucide-react";
import { useLang } from "../../context/LangContext";

export default function Checklist({ hcMismatch, diffInRange, earlyFlagged, idleFlagged }) {
  const { t } = useLang();

  const items = [
    { key: "hc_match",  ok: !hcMismatch,    label: t("zagruzka.check.hcMatch") },
    { key: "diff_ok",   ok: diffInRange,     label: t("zagruzka.check.diffOk")  },
    { key: "early_ok",  ok: !earlyFlagged,   label: t("zagruzka.check.earlyOk") },
    { key: "idle_ok",   ok: !idleFlagged,    label: t("zagruzka.check.idleOk")  },
  ];

  return (
    <div className="space-y-1">
      {items.map(({ key, ok, label }) => (
        <div key={key} className="flex items-center gap-1.5 text-[11px]">
          {ok
            ? <CheckCircle2 size={13} className="text-green-400 flex-shrink-0" />
            : <XCircle size={13} className="text-red-400 flex-shrink-0" />}
          <span className={ok ? "text-gray-400" : "text-red-300"}>{label}</span>
        </div>
      ))}
    </div>
  );
}
