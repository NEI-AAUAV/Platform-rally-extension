import { useState, useEffect, type FormEvent } from "react";
import { useExtraShotsAndPenalties, getSubmitLabel } from "@/hooks/useExtraShotsAndPenalties";
import { useAppToast } from "@/hooks/use-toast";
import ExtraShotsField from "@/components/forms/shared/ExtraShotsField";
import PenaltiesFieldset from "@/components/forms/shared/PenaltiesFieldset";
import NotesField from "@/components/forms/shared/NotesField";
import FormSubmitButton from "@/components/forms/shared/FormSubmitButton";
import { countCorrect, type QuizQuestion } from "@/lib/quizQuestions";
import type { BaseActivityFormProps } from "@/types/forms";

/** Reads a possibly-legacy `quiz_correct` map — old results stored booleans
 * (single yes/no answer), current ones store counts (subgroups correct). */
function normalizeStoredCorrect(stored: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(stored).map(([key, value]) => [
      key,
      typeof value === "boolean" ? Number(value) : Number(value) || 0,
    ]),
  );
}

type Props = Readonly<
  BaseActivityFormProps & {
    /** This activity's own quiz questions (config.quiz_questions), if any. */
    quizQuestions?: readonly QuizQuestion[];
    /** How many subgroups (e.g. pairs) each question is put to. */
    answersPerQuestion?: number;
  }
>;

export default function ScoreBasedForm({
  existingResult,
  team,
  onSubmit,
  isSubmitting,
  penaltyCounters = [],
  quizQuestions = [],
  answersPerQuestion = 1,
}: Props) {
  const [achievedPoints, setAchievedPoints] = useState<number>(0);
  // Only used when quizQuestions is non-empty — how many subgroups (e.g.
  // pairs) got each question right, staff-counted at the post.
  const [correct, setCorrect] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<string>("");
  const toast = useAppToast();
  const isQuiz = quizQuestions.length > 0;

  const {
    extraShots,
    setExtraShots,
    penalties,
    penaltiesInPoints,
    setPenalties,
    maxExtraShots,
    maxExtraShotsPerMember,
    showExtraShots,
    penaltyValues,
    showVomitPenalty,
    showNotDrinkingPenalty,
    showPenalties,
    validateExtraShots,
  } = useExtraShotsAndPenalties(team, existingResult, penaltyCounters);

  useEffect(() => {
    if (existingResult?.result_data) {
      setAchievedPoints((existingResult.result_data.achieved_points as number) || 0);
      const storedCorrect = existingResult.result_data.quiz_correct;
      if (storedCorrect && typeof storedCorrect === "object") {
        setCorrect(normalizeStoredCorrect(storedCorrect as Record<string, unknown>));
      }
      setNotes((existingResult.result_data.notes as string) || "");
    }
  }, [existingResult]);

  // The quiz score IS the count of correct answers — keep it in sync as the
  // staff checks/unchecks questions, rather than a second field to update.
  useEffect(() => {
    if (isQuiz) setAchievedPoints(countCorrect(correct));
  }, [isQuiz, correct]);

  const setQuestionCorrect = (key: string, value: number) => {
    const clamped = Math.min(Math.max(0, Math.round(value) || 0), answersPerQuestion);
    setCorrect((prev) => ({ ...prev, [key]: clamped }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (!validateExtraShots()) return;

    if (achievedPoints < 0) {
      toast.error("Os pontos têm de ser positivos.");
      return;
    }

    onSubmit({
      result_data: {
        achieved_points: achievedPoints,
        ...(isQuiz ? { quiz_correct: correct } : {}),
        notes: notes,
      },
      extra_shots: extraShots,
      penalties: penaltiesInPoints,
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {isQuiz ? (
        <fieldset>
          <legend className="mb-2 block text-sm font-medium text-foreground">
            Perguntas ({countCorrect(correct)}/{quizQuestions.length * answersPerQuestion} certas)
          </legend>
          {answersPerQuestion > 1 && (
            <p className="mb-2 text-xs text-muted-foreground">
              Indica quantos ({answersPerQuestion === 1 ? "" : `de ${answersPerQuestion}`})
              acertaram cada pergunta.
            </p>
          )}
          <ul className="space-y-2">
            {quizQuestions.map((question) => (
              <li key={question.key} className="flex items-center gap-2">
                {answersPerQuestion > 1 ? (
                  <input
                    id={`quiz-${question.key}`}
                    type="number"
                    min={0}
                    max={answersPerQuestion}
                    value={correct[question.key] ?? 0}
                    onChange={(e) => setQuestionCorrect(question.key, Number(e.target.value))}
                    className="h-8 w-16 rounded border border-border bg-muted p-1 text-center text-foreground"
                  />
                ) : (
                  <input
                    id={`quiz-${question.key}`}
                    type="checkbox"
                    checked={!!correct[question.key]}
                    onChange={(e) => setQuestionCorrect(question.key, e.target.checked ? 1 : 0)}
                    className="h-4 w-4"
                  />
                )}
                <label htmlFor={`quiz-${question.key}`} className="text-sm text-foreground">
                  {question.text}
                  {answersPerQuestion > 1 && ` (/${answersPerQuestion})`}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : (
        <div>
          <label
            htmlFor="score-achieved"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Achieved Points
          </label>
          <input
            id="score-achieved"
            type="number"
            min="0"
            value={achievedPoints}
            onChange={(e) => setAchievedPoints(Number(e.target.value))}
            className="w-full rounded border border-border bg-muted p-3 text-foreground placeholder:text-muted-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
            placeholder="Introduz os pontos alcançados"
            required
          />
        </div>
      )}

      {showExtraShots && (
        <ExtraShotsField
          idPrefix="score"
          extraShots={extraShots}
          onChange={setExtraShots}
          maxExtraShots={maxExtraShots}
          maxExtraShotsPerMember={maxExtraShotsPerMember}
        />
      )}

      {showPenalties && (
        <PenaltiesFieldset
          idPrefix="score"
          penalties={penalties}
          onChange={setPenalties}
          penaltyValues={penaltyValues}
          penaltyCounters={penaltyCounters}
          showVomitPenalty={showVomitPenalty}
          showNotDrinkingPenalty={showNotDrinkingPenalty}
        />
      )}

      <NotesField idPrefix="score" notes={notes} onChange={setNotes} />

      <FormSubmitButton
        isSubmitting={isSubmitting}
        label={getSubmitLabel(isSubmitting, !!existingResult)}
      />
    </form>
  );
}
