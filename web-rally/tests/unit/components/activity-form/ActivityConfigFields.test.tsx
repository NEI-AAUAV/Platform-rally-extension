import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ActivityConfigFields } from "@/components/activity-form/ActivityConfigFields";
import { ActivityType } from "@/types/activityTypes";

describe("ActivityConfigFields", () => {
  it("renders TIME_BASED fields with max and min points", () => {
    render(
      <ActivityConfigFields
        activityType={ActivityType.TIME_BASED}
        configData={{}}
        updateConfig={vi.fn()}
      />,
    );
    expect(screen.getByText("Configurações de Atividade Baseada em Tempo")).toBeInTheDocument();
    expect(screen.getByLabelText("Pontos Máximos (1º lugar)")).toBeInTheDocument();
    expect(screen.getByLabelText("Pontos Mínimos (último lugar)")).toBeInTheDocument();
  });

  it("renders SCORE_BASED fields with max and base score", () => {
    render(
      <ActivityConfigFields
        activityType={ActivityType.SCORE_BASED}
        configData={{}}
        updateConfig={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Configurações de Atividade Baseada em Pontuação"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Pontuação Máxima")).toBeInTheDocument();
    expect(screen.getByLabelText("Pontuação Base")).toBeInTheDocument();
  });

  it("renders BOOLEAN fields with success and failure points", () => {
    render(
      <ActivityConfigFields
        activityType={ActivityType.BOOLEAN}
        configData={{}}
        updateConfig={vi.fn()}
      />,
    );
    expect(screen.getByText("Configurações de Atividade Sim/Não")).toBeInTheDocument();
    expect(screen.getByLabelText("Pontos por Sucesso")).toBeInTheDocument();
    expect(screen.getByLabelText("Pontos por Falha")).toBeInTheDocument();
  });

  it("renders GENERAL fields with min, max and default points", () => {
    render(
      <ActivityConfigFields
        activityType={ActivityType.GENERAL}
        configData={{}}
        updateConfig={vi.fn()}
      />,
    );
    expect(screen.getByText("Configurações de Atividade Geral")).toBeInTheDocument();
    expect(screen.getByLabelText("Pontos Mínimos")).toBeInTheDocument();
    expect(screen.getByLabelText("Pontos Máximos")).toBeInTheDocument();
    expect(screen.getByLabelText("Pontos Padrão")).toBeInTheDocument();
  });

  it("renders TEAM_VS fields including tiered scoring and result points", () => {
    render(
      <ActivityConfigFields
        activityType={ActivityType.TEAM_VS}
        configData={{}}
        updateConfig={vi.fn()}
      />,
    );
    expect(screen.getByText("Configurações de Atividade Equipa vs Equipa")).toBeInTheDocument();
    expect(screen.getByTestId("input-base-points")).toBeInTheDocument();
    expect(screen.getByTestId("input-completion-points")).toBeInTheDocument();
    expect(screen.getByTestId("input-win-points")).toBeInTheDocument();
    expect(screen.getByLabelText("Pontos por Empate")).toBeInTheDocument();
    expect(screen.getByLabelText("Pontos por Derrota")).toBeInTheDocument();
    expect(screen.getByText("Pontos dados apenas por participar")).toBeInTheDocument();
    expect(screen.getByText("Bônus por completar o desafio")).toBeInTheDocument();
  });

  it("renders DEFERRED_JUDGED fields with min and max points", () => {
    render(
      <ActivityConfigFields
        activityType={ActivityType.DEFERRED_JUDGED}
        configData={{}}
        updateConfig={vi.fn()}
      />,
    );
    expect(screen.getByText("Configurações de Avaliação Posterior")).toBeInTheDocument();
    expect(screen.getByLabelText("Pontos Mínimos")).toBeInTheDocument();
    expect(screen.getByLabelText("Pontos Máximos")).toBeInTheDocument();
  });

  it("renders nothing for an unknown activity type", () => {
    const { container } = render(
      <ActivityConfigFields
        activityType={"UNKNOWN" as ActivityType}
        configData={{}}
        updateConfig={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("calls updateConfig with the parsed numeric value when a field changes", () => {
    const updateConfig = vi.fn();
    render(
      <ActivityConfigFields
        activityType={ActivityType.TIME_BASED}
        configData={{}}
        updateConfig={updateConfig}
      />,
    );
    const input = screen.getByLabelText("Pontos Máximos (1º lugar)") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "75" } });
    expect(updateConfig).toHaveBeenCalledWith("max_points", 75);
  });

  it("resolves an existing configData value onto the field", () => {
    render(
      <ActivityConfigFields
        activityType={ActivityType.SCORE_BASED}
        configData={{ max_points: 250 }}
        updateConfig={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("Pontuação Máxima") as HTMLInputElement;
    expect(input.value).toBe("250");
  });
});
