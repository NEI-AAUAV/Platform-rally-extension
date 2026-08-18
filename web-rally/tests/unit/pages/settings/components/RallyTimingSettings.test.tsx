import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useForm, FormProvider } from "react-hook-form";
import RallyTimingSettings from "@/pages/settings/components/RallyTimingSettings";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

function Wrapper({
  startTime,
  endTime,
}: {
  readonly startTime?: string | null;
  readonly endTime?: string | null;
}) {
  const methods = useForm({
    defaultValues: { rally_start_time: startTime, rally_end_time: endTime },
  });
  return (
    <FormProvider {...methods}>
      <RallyTimingSettings />
    </FormProvider>
  );
}

describe("RallyTimingSettings", () => {
  it('renders "Não definido" when times are missing', () => {
    render(<Wrapper />);
    const notDefined = screen.getAllByText("Não definido");
    expect(notDefined).toHaveLength(2);
  });

  it("renders formatted dates when times are set", () => {
    render(<Wrapper startTime="2024-05-01T10:00:00Z" endTime="2024-05-02T18:00:00Z" />);
    expect(screen.getByText("Início")).toBeInTheDocument();
    expect(screen.getByText("Fim")).toBeInTheDocument();
    expect(screen.queryByText("Não definido")).not.toBeInTheDocument();
  });

  it("renders a link to the admin event management page", () => {
    render(<Wrapper />);
    const link = screen.getByText("Editar horários na gestão de eventos");
    expect(link.closest("a")).toHaveAttribute("href", "/admin");
  });
});
