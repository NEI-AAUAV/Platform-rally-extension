import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { useForm, FormProvider } from "react-hook-form";
import PeddyPaperSettings from "@/pages/settings/components/PeddyPaperSettings";

function Wrapper({
  hintsEnabled = true,
  skipEnabled = true,
}: {
  readonly hintsEnabled?: boolean;
  readonly skipEnabled?: boolean;
}) {
  const methods = useForm({
    defaultValues: {
      reveal_next_checkpoint: true,
      gps_checkin_enabled: false,
      guide_manual_arrival_enabled: true,
      reveal_on_arrival: true,
      participant_view_enabled: false,
      hints_enabled: hintsEnabled,
      hint_penalty: -10,
      skip_enabled: skipEnabled,
      skip_penalty: -25,
    },
  });
  return (
    <FormProvider {...methods}>
      <PeddyPaperSettings />
    </FormProvider>
  );
}

describe("PeddyPaperSettings", () => {
  // These two used to sit in the display card, away from the mechanic they
  // belong to; the whole point of the group is that they are here.
  it("carries the switches that define the treasure hunt", () => {
    render(<Wrapper />);
    expect(screen.getByLabelText("Revelar o próximo posto antes da chegada")).toBeChecked();
    expect(screen.getByLabelText("Ativar visualização para participantes")).not.toBeChecked();
    expect(screen.getByLabelText("Check-in por GPS feito pela equipa")).not.toBeChecked();
    expect(screen.getByLabelText("Guias podem marcar chegadas")).toBeChecked();
    expect(screen.getByLabelText("Revelar o posto ao chegar")).toBeChecked();
  });

  it("shows each cost next to the switch that enables it", () => {
    render(<Wrapper />);
    expect(screen.getByLabelText("Custo de uma pista")).toHaveValue(-10);
    expect(screen.getByLabelText("Custo de desistir de um posto")).toHaveValue(-25);
  });

  // "0 points" and "off" are different states: the cost field is meaningless
  // once the mechanic is gone, so it goes away with it.
  it("hides the hint cost when hints are disabled", () => {
    render(<Wrapper hintsEnabled={false} />);
    expect(screen.queryByLabelText("Custo de uma pista")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Custo de desistir de um posto")).toBeInTheDocument();
  });

  it("hides the skip cost when giving up is disabled", () => {
    render(<Wrapper skipEnabled={false} />);
    expect(screen.queryByLabelText("Custo de desistir de um posto")).not.toBeInTheDocument();
  });

  it("brings the cost back when the mechanic is re-enabled", async () => {
    const user = userEvent.setup();
    render(<Wrapper hintsEnabled={false} />);
    await user.click(screen.getByLabelText("Permitir pedir pistas"));
    expect(screen.getByLabelText("Custo de uma pista")).toBeInTheDocument();
  });
});
