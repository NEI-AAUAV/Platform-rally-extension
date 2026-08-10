import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { BloodyButton } from "@/components/themes/bloody";
import type { QuizQuestion } from "@/lib/quizQuestions";

type Props = Readonly<{
  questions: readonly QuizQuestion[];
  onChange: (questions: QuizQuestion[]) => void;
}>;

function newKey(): string {
  return `q_${crypto.randomUUID()}`;
}

/** Questions the staff asks a team at this post, checked off right/wrong on
 * the evaluation form instead of typing a raw score — e.g. "Qual é a música
 * favorita do teu colega?" for pairs. Stored in `config.quiz_questions`;
 * `achieved_points` becomes however many were marked correct. */
export default function QuizQuestionConfigFields({ questions, onChange }: Props) {
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
          O staff marca no local quais a equipa acertou; os Pontos Máximos ficam automaticamente
          iguais ao número de perguntas, para que cada uma valha o mesmo.
        </p>
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
