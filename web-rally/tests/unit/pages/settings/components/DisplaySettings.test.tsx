import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeAll } from "vitest";
import { useForm, FormProvider } from "react-hook-form";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DisplaySettings from "@/pages/settings/components/DisplaySettings";

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = MockResizeObserver;
});

function Wrapper() {
  const methods = useForm({
    defaultValues: {
      rally_theme: "bloody",
      show_live_leaderboard: true,
      show_team_details: true,
      show_checkpoint_map: true,
      participant_view_enabled: false,
      show_route_mode: "focused",
      show_score_mode: "hidden",
      public_access_enabled: false,
      allow_photo_as_team_photo: false,
      guide_mode_enabled: false,
      guide_mode_active: false,
      badges_enabled: true,
    },
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <FormProvider {...methods}>
        <DisplaySettings />
      </FormProvider>
    </QueryClientProvider>
  );
}

describe("DisplaySettings", () => {
  it("renders section title and switches", () => {
    render(<Wrapper />);
    expect(screen.getByText("Pontuações")).toBeInTheDocument();
    expect(screen.getByText("Mapa e trajeto")).toBeInTheDocument();
    expect(screen.getByLabelText("Mostrar leaderboard em tempo real")).toBeInTheDocument();
    expect(screen.getByLabelText("Mostrar detalhes das equipas")).toBeInTheDocument();
    expect(screen.getByLabelText("Mostrar mapa dos checkpoints")).toBeInTheDocument();
    expect(screen.getByLabelText("Permitir acesso público (sem login)")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Permitir staff definir foto de atividade como foto da equipa"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Ativar funcionalidade de modo guia")).toBeInTheDocument();
    expect(screen.getByLabelText("Modo guia ativo neste evento")).toBeInTheDocument();
    expect(screen.getByLabelText("Ativar crachás / conquistas")).toBeInTheDocument();
  });

  it("does not carry the treasure-hunt switches, which live in the Enigmas card", () => {
    render(<Wrapper />);
    expect(
      screen.queryByLabelText("Ativar visualização para participantes"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Revelar o próximo posto antes da chegada"),
    ).not.toBeInTheDocument();
  });

  it("toggles a switch value", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    const toggle = screen.getByLabelText("Mostrar leaderboard em tempo real");
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
  });
});
