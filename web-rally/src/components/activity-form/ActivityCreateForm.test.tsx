import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import ActivityForm from "./ActivityCreateForm";
import { ActivityType } from "@/types/activityTypes";

// Regression test for a bug where editing an activity whose config already
// carried array-shaped extras (penalty_counters / quiz_questions, written by
// the penalty-counter and quiz features) silently blocked the "Atualizar"
// button: zodResolver validated the whole seeded form on submit, and the
// old `config` schema only allowed string/number/boolean values.
describe("ActivityCreateForm", () => {
  it("submits an edit when initialData.config already has array extras", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <ActivityForm
        checkpoints={[]}
        lockCheckpointId={1}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        initialData={{
          name: "Quiz do posto 3",
          activity_type: ActivityType.SCORE_BASED,
          checkpoint_id: 1,
          config: {
            max_points: 10,
            penalty_counters: [{ key: "vomit", label: "Vómitos", pointsPer: 5 }],
            quiz_questions: [{ key: "q_1", text: "Qual a cor do posto?" }],
          },
          is_active: true,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Atualizar" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
