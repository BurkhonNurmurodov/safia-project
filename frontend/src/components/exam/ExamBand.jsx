/**
 * The band under the header while the exam mode is on: «nothing here is
 * real», plus the way out («Tanaffus» — progress is saved). Rendered by
 * Layout; not dismissible — the mode is left by that button or by finishing.
 */
import { GraduationCap, PauseCircle } from "lucide-react";
import { useLang } from "../../context/LangContext";
import { useExam } from "../../context/ExamContext";
import Button from "../ui/Button";

export default function ExamBand() {
  const exam = useExam();
  const { t } = useLang();
  if (!exam?.on) return null;
  const practice = exam.attempt?.kind === "practice";
  return (
    <div
      role="status"
      className="flex items-center gap-2 px-4 md:px-6"
      style={{
        minHeight: 36, background: "var(--brand-bg)", color: "var(--brand-text)",
        borderBottom: "1px solid var(--brand-border)",
      }}
    >
      <GraduationCap size={15} className="flex-shrink-0" />
      <span className="text-xs font-semibold truncate">
        {practice ? t("exam.band.practice") : t("exam.band.exam")}
        <span className="font-normal" style={{ color: "var(--text-3)" }}> · {t("exam.band.notReal")}</span>
      </span>
      <span className="flex-1" />
      <Button variant="ghost" size="sm" icon={<PauseCircle size={14} />} onClick={exam.leave}>
        {t("exam.band.pause")}
      </Button>
    </div>
  );
}
