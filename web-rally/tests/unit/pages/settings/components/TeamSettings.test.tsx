import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { useForm, FormProvider } from "react-hook-form";
import TeamSettings from "@/pages/settings/components/TeamSettings";

function Wrapper({ className }: { readonly className?: string }) {
  const methods = useForm({
    defaultValues: {
      max_teams: 10,
      max_members_per_team: 5,
      enable_versus: false,
    },
  });
  return (
    <FormProvider {...methods}>
      <form>
        <TeamSettings className={className} />
      </form>
    </FormProvider>
  );
}

describe("TeamSettings", () => {
  it("renders section title and description", () => {
    render(<Wrapper />);
    expect(screen.getByText("Gestão de Equipas")).toBeInTheDocument();
    expect(
      screen.getByText("Configurações relacionadas com equipas e membros"),
    ).toBeInTheDocument();
  });

  it("renders max_teams and max_members_per_team inputs with default values", () => {
    render(<Wrapper />);
    expect(screen.getByLabelText("Número máximo de equipas")).toHaveValue(10);
    expect(screen.getByLabelText("Máximo de membros por equipa")).toHaveValue(5);
  });

  it("renders the enable_versus switch unchecked by default", () => {
    render(<Wrapper />);
    const toggle = screen.getByLabelText("Ativar modo versus (competição entre equipas)");
    expect(toggle).not.toBeChecked();
  });

  it("toggles enable_versus switch on click", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    const toggle = screen.getByLabelText("Ativar modo versus (competição entre equipas)");
    await user.click(toggle);
    expect(toggle).toBeChecked();
  });

  it("allows typing new numeric values into inputs", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    const maxTeamsInput = screen.getByLabelText("Número máximo de equipas");
    await user.clear(maxTeamsInput);
    await user.type(maxTeamsInput, "25");
    expect(maxTeamsInput).toHaveValue(25);
  });

  it("applies custom className to root container", () => {
    const { container } = render(<Wrapper className="custom-class" />);
    expect(container.querySelector(".custom-class")).toBeInTheDocument();
  });

  it("respects min/max attributes on numeric inputs", () => {
    render(<Wrapper />);
    const maxTeamsInput = screen.getByLabelText("Número máximo de equipas");
    const maxMembersInput = screen.getByLabelText("Máximo de membros por equipa");
    expect(maxTeamsInput).toHaveAttribute("min", "1");
    expect(maxTeamsInput).toHaveAttribute("max", "100");
    expect(maxMembersInput).toHaveAttribute("min", "1");
    expect(maxMembersInput).toHaveAttribute("max", "50");
  });
});
