import { render, screen } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { useForm, FormProvider } from "react-hook-form";
import {
  SettingSwitch,
  forcedValueForPolicy,
} from "@/pages/settings/components/SettingFields";
import { useEventConfiguration } from "@/pages/settings/components/useEventConfiguration";

vi.mock("@/pages/settings/components/useEventConfiguration", () => ({
  useEventConfiguration: vi.fn(),
}));

describe("forcedValueForPolicy", () => {
  it("computes correct forced boolean for non-inverted policies", () => {
    expect(forcedValueForPolicy("required", false)).toBe(true);
    expect(forcedValueForPolicy("forbidden", false)).toBe(false);
    expect(forcedValueForPolicy("optional", false)).toBeNull();
    expect(forcedValueForPolicy(undefined, false)).toBeNull();
  });

  it("inverts the forced boolean for inverted policies", () => {
    // e.g. checkpoint_redaction required -> reveal_next_checkpoint forced false
    expect(forcedValueForPolicy("required", true)).toBe(false);
    // checkpoint_redaction forbidden -> reveal_next_checkpoint forced true
    expect(forcedValueForPolicy("forbidden", true)).toBe(true);
    expect(forcedValueForPolicy("optional", true)).toBeNull();
    expect(forcedValueForPolicy(undefined, true)).toBeNull();
  });
});

function SwitchWrapper({
  name,
  label,
  defaultValue = false,
  policy,
  inverted,
}: {
  readonly name: string;
  readonly label: string;
  readonly defaultValue?: boolean;
  readonly policy?: "required" | "optional" | "forbidden";
  readonly inverted?: boolean;
}) {
  const methods = useForm({
    defaultValues: {
      [name]: defaultValue,
    },
  });

  return (
    <FormProvider {...methods}>
      <SettingSwitch name={name} label={label} policy={policy} inverted={inverted} />
    </FormProvider>
  );
}

describe("SettingSwitch policy binding", () => {
  beforeEach(() => {
    vi.mocked(useEventConfiguration).mockReturnValue({ data: undefined } as ReturnType<
      typeof useEventConfiguration
    >);
  });
  it("enables the switch and allows user editing when capability is optional", () => {
    render(
      <SwitchWrapper
        name="gps_checkin_enabled"
        label="GPS Check-in"
        defaultValue={false}
        policy="optional"
      />,
    );

    const switchInput = screen.getByRole("switch", { name: "GPS Check-in" });
    expect(switchInput).not.toBeDisabled();
    expect(switchInput).not.toBeChecked();
    expect(screen.queryByText("Obrigatório")).not.toBeInTheDocument();
    expect(screen.queryByText("Indisponível")).not.toBeInTheDocument();
  });

  it("forces value to true, disables the switch, and displays 'Obrigatório' badge when policy is required", () => {
    render(
      <SwitchWrapper
        name="participant_view_enabled"
        label="Visualização de participantes"
        defaultValue={false}
        policy="required"
      />,
    );

    const switchInput = screen.getByRole("switch", { name: "Visualização de participantes" });
    expect(switchInput).toBeDisabled();
    expect(switchInput).toBeChecked();
    expect(screen.getByText("Obrigatório")).toBeInTheDocument();
  });

  it("forces value to false, disables switch, and displays 'Indisponível' badge when policy is forbidden", () => {
    render(
      <SwitchWrapper
        name="gps_checkin_enabled"
        label="GPS Check-in"
        defaultValue={true}
        policy="forbidden"
      />,
    );

    const switchInput = screen.getByRole("switch", { name: "GPS Check-in" });
    expect(switchInput).toBeDisabled();
    expect(switchInput).not.toBeChecked();
    expect(screen.getByText("Indisponível")).toBeInTheDocument();
  });

  it("handles inverted capability binding (checkpoint_redaction required forces reveal_next_checkpoint false)", () => {
    render(
      <SwitchWrapper
        name="reveal_next_checkpoint"
        label="Revelar próximo posto"
        defaultValue={true}
        policy="required"
        inverted={true}
      />,
    );

    const switchInput = screen.getByRole("switch", { name: "Revelar próximo posto" });
    expect(switchInput).toBeDisabled();
    expect(switchInput).not.toBeChecked();
    expect(screen.getByText("Obrigatório")).toBeInTheDocument();
  });

  it("handles inverted capability binding (checkpoint_redaction forbidden forces reveal_next_checkpoint true)", () => {
    render(
      <SwitchWrapper
        name="reveal_next_checkpoint"
        label="Revelar próximo posto"
        defaultValue={false}
        policy="forbidden"
        inverted={true}
      />,
    );

    const switchInput = screen.getByRole("switch", { name: "Revelar próximo posto" });
    expect(switchInput).toBeDisabled();
    expect(switchInput).toBeChecked();
    expect(screen.getByText("Indisponível")).toBeInTheDocument();
  });

  it.each([
    ["enable_staff_scoring", "Pontuação staff", "staff_scoring", "required", true, "Obrigatório"],
    ["skip_enabled", "Desistir", "skip", "forbidden", false, "Indisponível"],
    ["guide_mode_enabled", "Modo guia", "guide_mode", "required", true, "Obrigatório"],
    ["guide_mode_active", "Modo guia ativo", "guide_mode", "required", true, "Obrigatório"],
    ["enable_versus", "Versus", "versus", "forbidden", false, "Indisponível"],
  ])(
    "resolves %s from its backend capability mapping",
    (name, label, capability, policy, expectedChecked, badge) => {
      vi.mocked(useEventConfiguration).mockReturnValue({
        data: { capabilities: { [capability]: { policy } } },
      } as ReturnType<typeof useEventConfiguration>);

      render(<SwitchWrapper name={name} label={label} defaultValue={!expectedChecked} />);

      const control = screen.getByRole("switch", { name: label });
      expect(control).toBeDisabled();
      expect(control).toHaveProperty("checked", expectedChecked);
      expect(screen.getByText(badge)).toBeInTheDocument();
    },
  );
});
