import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { BloodyButton } from "@/components/themes/bloody";
import type { QuizQuestion } from "@/lib/quizQuestions";

type Props = Readonly<{
  questions: readonly QuizQuestion[];
  onChange: (questions: QuizQuestion[]) => void;
  answersPerQuestion: number;
  onAnswersPerQuestionChange: (value: number) => void;
}>;

function newKey(): string {
  return `q_${crypto.randomUUID()}`;
}

/** Questions the staff asks a team at this post, checked off right/wrong on
 * the evaluation form instead of typing a raw score — e.g. "Qual é a música
 * favorita do teu colega?" for pairs. Stored in `config.quiz_questions`;
 * `achieved_points` becomes however many were marked correct.
 *
 * When the team splits into subgroups that each answer the same question
 * (e.g. 3 pairs), `answersPerQuestion` says how many attempts each question
 * gets — the staff form then counts correct answers per question instead of
 * a single yes/no. */
export default function QuizQuestionConfigFields({
  questions,
  onChange,
  answersPerQuestion,
  onAnswersPerQuestionChange,
}: Props) {
  const addQuestion = () => {
    onChange([...questions, { key: newKey(), text: "" }]);
  };

  const updateQuestion = (index: number, text: string) => {
    onChange(questions.map((q, i) => (i === index ? { ...q, text } : q)));
  };

  const removeQuestion = (index: number) => {
    onChange(questions.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted p-4">
      <div>
        <h4 className="font-medium text-foreground">Perguntas do quiz (opcional)</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          O staff marca no local quais a equipa acertou. Pontos Máximos devem ficar iguais a
          (nº de perguntas × respostas por pergunta), para que cada resposta valha o mesmo.
        </p>
      </div>

      <div>
        <label
          htmlFor="quiz-answers-per-question"
          className="mb-1 block text-xs text-muted-foreground"
        >
          Respostas por pergunta (ex: nº de pares em que a equipa se divide)
        </label>
        <Input
          id="quiz-answers-per-question"
          type="number"
          min={1}
          value={answersPerQuestion}
          onChange={(e) => onAnswersPerQuestionChange(Math.max(1, Number(e.target.value) || 1))}
          className="w-24 border-border bg-card"
        />
      </div>

      {questions.map((question, index) => (
        <div key={question.key} className="flex items-end gap-2">
          <div className="flex-1">
            <label
              htmlFor={`quiz-question-${index}`}
              className="mb-1 block text-xs text-muted-foreground"
            >
              Pergunta {index + 1}
            </label>
            <Input
              id={`quiz-question-${index}`}
              value={question.text}
              placeholder="Ex: Qual é a música favorita do teu colega?"
              onChange={(e) => updateQuestion(index, e.target.value)}
              className="border-border bg-card"
            />
          </div>
          <BloodyButton
            type="button"
            variant="neutral"
            onClick={() => removeQuestion(index)}
            aria-label={`Remover pergunta ${index + 1}`}
          >
            <Trash2 className="h-4 w-4" />
          </BloodyButton>
        </div>
      ))}

      <BloodyButton type="button" variant="neutral" onClick={addQuestion}>
        <Plus className="h-4 w-4" />
        <span className="ml-1.5">Adicionar pergunta</span>
      </BloodyButton>
    </div>
  );
}
