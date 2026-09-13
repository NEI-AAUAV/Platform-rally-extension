import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useForm, FormProvider } from "react-hook-form";
import {
  SettingSwitch,
  forcedValueForPolicy,
} from "@/pages/settings/components/SettingFields";

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
  readonly name: "participant_view_enabled" | "reveal_next_checkpoint" | "gps_checkin_enabled";
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
    // Because forced is false, the badge displays 'Indisponível' (forced false)
    expect(screen.getByText("Indisponível")).toBeInTheDocument();
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
    // Because forced is true, the badge displays 'Obrigatório' (forced true)
    expect(screen.getByText("Obrigatório")).toBeInTheDocument();
  });
});
