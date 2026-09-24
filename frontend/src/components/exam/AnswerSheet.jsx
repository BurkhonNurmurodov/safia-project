/**
 * The answer sheet for an `answer` task: a number, a text, a clock, one pick
 * from a list or several. The list is served per task by the backend
 * (`GET /api/exam/attempts/{id}/tasks/{key}`), built from the same source the
 * check reads and never cached. A wrong answer keeps the sheet open with a
 * neutral toast — no hints (ruling 10).
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLang } from "../../context/LangContext";
import { useExam } from "../../context/ExamContext";
import api from "../../utils/api";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import StyledSelect from "../ui/StyledSelect";
import TimeField from "../ui/TimeField";
import CheckboxTree from "../ui/CheckboxTree";
import { useToast } from "../ui/Toast";
import { SkeletonBlock } from "../ui/Skeleton";
import { useTranslit } from "../../utils/transliterate";

export default function AnswerSheet({ task }) {
  const exam = useExam();
  const { t, lang } = useLang();
  const { tx } = useTranslit();
  const toast = useToast({ position: "bottom" });
  const [value, setValue] = useState(task.answer?.type === "multi" ? [] : "");
  const type = task.answer?.type || "text";

  const q = useQuery({
    queryKey: ["exam-task", exam.attemptId, task.key, lang],
    queryFn: () => api.get(`/api/exam/attempts/${exam.attemptId}/tasks/${task.key}`, { params: { lang } }).then((r) => r.data),
    staleTime: 0,
    gcTime: 0,
  });
  const options = q.data?.options || null;

  // «not yet» — the context bumps `wrong` on a refused answer.
  const [seenWrong, setSeenWrong] = useState(exam.wrong);
  useEffect(() => {
    if (exam.wrong !== seenWrong) {
      setSeenWrong(exam.wrong);
      toast.info(t("exam.sheet.wrong"), 2500);
    }
  }, [exam.wrong]);   // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    if (type === "multi" ? !value.length : String(value).trim() === "") return;
    exam.check({ answer: value, taskKey: task.key });
  };

  const control = () => {
    if (q.isLoading && (type === "choice" || type === "multi")) return <SkeletonBlock className="h-10 w-full" />;
    if (type === "choice") {
      return (
        <StyledSelect
          value={value}
          onChange={setValue}
          options={(options || []).map((o) => ({ value: String(o), label: tx(String(o)) }))}
          placeholder={t("exam.sheet.pick")}
          searchable={(options || []).length > 8}
          className="w-full"
        />
      );
    }
    if (type === "multi") {
      const groups = [{
        key: "all", label: t("exam.sheet.pickMany"),
        children: (options || []).map((o) => ({ key: String(o), label: tx(String(o)) })),
      }];
      return <CheckboxTree groups={groups} selected={value} onChange={setValue} />;
    }
    if (type === "time") {
      return <TimeField value={value} onChange={setValue} />;
    }
    return (
      <input
        type={type === "number" ? "number" : "text"}
        inputMode={type === "number" ? "decimal" : "text"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        autoFocus
        className="w-full rounded-xl px-3 py-2 text-sm"
        style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }}
        placeholder={type === "number" ? t("exam.sheet.numberPh") : t("exam.sheet.textPh")}
      />
    );
  };

  return (
    <>
      <Modal
        open
        onClose={exam.closeSheet}
        title={`${t("exam.strip.task")} ${task.n}`}
        subtitle={t(`exam.area.${task.area}`)}
        maxWidth="max-w-md"
        zIndex={60}
        footer={(
          <>
            <Button variant="secondary" onClick={exam.closeSheet}>{t("common.cancel")}</Button>
            <Button onClick={submit} loading={exam.busy}
                    disabled={type === "multi" ? !value.length : String(value).trim() === ""}>
              {t("exam.sheet.check")}
            </Button>
          </>
        )}
      >
        <p className="text-sm" style={{ color: "var(--text-1)" }}>{t(`exam.t.${task.key}`)}</p>
        <FormField label={t("exam.sheet.answer")} required>
          {control()}
        </FormField>
      </Modal>
      {toast.node}
    </>
  );
}
