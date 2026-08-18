import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { useForm, FormProvider } from "react-hook-form";
import RouteRulesSettings from "@/pages/settings/components/RouteRulesSettings";

function Wrapper({ legTimeEnabled = false }: { readonly legTimeEnabled?: boolean }) {
  const methods = useForm({
    defaultValues: {
      checkpoint_order_matters: true,
      route_stages_enabled: false,
      checkpoint_hours_enabled: true,
      leg_time_scoring_enabled: legTimeEnabled,
      leg_time_target_minutes: 10,
      leg_time_points_per_minute: 0,
      leg_time_max_adjustment: 20,
    },
  });
  return (
    <FormProvider {...methods}>
      <RouteRulesSettings />
    </FormProvider>
  );
}

describe("RouteRulesSettings", () => {
  it("renders the route shape switches", () => {
    render(<Wrapper />);
    expect(screen.getByLabelText("A ordem dos postos importa")).toBeChecked();
    expect(screen.getByLabelText("Etapas da rota")).not.toBeChecked();
    expect(screen.getByLabelText("Respeitar horários dos postos")).toBeChecked();
  });

  // The three leg-time numbers mean nothing while the mechanic is off, and
  // showing them there is what made the old scoring card unreadable.
  it("keeps the leg-time numbers hidden until the mechanic is on", () => {
    render(<Wrapper />);
    expect(screen.getByLabelText("Pontuar tempo de percurso entre postos")).not.toBeChecked();
    expect(screen.queryByLabelText("Tempo esperado entre postos (min)")).not.toBeInTheDocument();
  });

  it("renders leg-time fields with initial values once enabled", () => {
    render(<Wrapper legTimeEnabled />);
    expect(screen.getByLabelText("Tempo esperado entre postos (min)")).toHaveValue(10);
    expect(screen.getByLabelText("Pontos por minuto de desvio")).toHaveValue(0);
    expect(screen.getByLabelText("Limite do ajuste por percurso")).toHaveValue(20);
  });

  it("reveals the leg-time numbers when the switch is turned on", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    const toggle = screen.getByLabelText("Pontuar tempo de percurso entre postos");
    await user.click(toggle);
    expect(toggle).toBeChecked();
    expect(screen.getByLabelText("Tempo esperado entre postos (min)")).toBeInTheDocument();
  });
});
