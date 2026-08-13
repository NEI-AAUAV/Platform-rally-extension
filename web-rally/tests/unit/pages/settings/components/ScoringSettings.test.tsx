import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { useForm, FormProvider } from "react-hook-form";
import ScoringSettings from "@/pages/settings/components/ScoringSettings";

function Wrapper({
  disabled,
  eventType,
}: {
  readonly disabled?: boolean;
  readonly eventType?: string;
}) {
  const methods = useForm({
    defaultValues: {
      penalty_per_puke: -10,
      penalty_per_not_drinking: -5,
      bonus_per_extra_shot: 5,
      max_extra_shots_per_member: 3,
      enable_staff_scoring: true,
    },
  });
  return (
    <FormProvider {...methods}>
      <ScoringSettings disabled={disabled} eventType={eventType} />
    </FormProvider>
  );
}

describe("ScoringSettings", () => {
  it("renders numeric inputs with initial values", () => {
    render(<Wrapper />);
    expect(screen.getByLabelText("Penalização por vómito")).toHaveValue(-10);
    expect(screen.getByLabelText("Penalização por não beber")).toHaveValue(-5);
    expect(screen.getByLabelText("Bónus por shot extra")).toHaveValue(5);
    expect(screen.getByLabelText("Máximo shots extra por membro")).toHaveValue(3);
  });

  it("allows editing numeric fields", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    const input = screen.getByLabelText("Bónus por shot extra");
    await user.clear(input);
    await user.type(input, "15");
    expect(input).toHaveValue(15);
  });

  it("renders switches for boolean settings", () => {
    render(<Wrapper />);
    expect(screen.getByLabelText("Permitir pontuação manual pelos staff")).toBeChecked();
  });

  it("disables inputs when disabled prop is set", () => {
    render(<Wrapper disabled />);
    expect(screen.getByLabelText("Penalização por vómito")).toBeDisabled();
    expect(screen.getByLabelText("Permitir pontuação manual pelos staff")).toBeDisabled();
  });

  // A peddy paper is a city route game: offering "penalização por vómito" there
  // is noise from a format this event does not run.
  it("hides drinking mechanics for a peddy paper", () => {
    render(<Wrapper eventType="peddy_paper" />);
    expect(screen.queryByLabelText("Penalização por vómito")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Bónus por shot extra")).not.toBeInTheDocument();
    // Manual scoring is format-neutral and must survive the gate.
    expect(screen.getByLabelText("Permitir pontuação manual pelos staff")).toBeInTheDocument();
  });

  it("shows drinking mechanics for a rally", () => {
    render(<Wrapper eventType="rally_tascas" />);
    expect(screen.getByLabelText("Penalização por vómito")).toBeInTheDocument();
  });
});
