import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useForm, FormProvider } from "react-hook-form";
import SearchAidsSettings from "@/pages/settings/components/SearchAidsSettings";

function Wrapper({
  disabled,
  proximityEnabled = true,
}: {
  readonly disabled?: boolean;
  readonly proximityEnabled?: boolean;
}) {
  const methods = useForm({
    defaultValues: {
      proximity_enabled: proximityEnabled,
      compass_enabled: false,
      search_radius_m: 500,
    },
  });
  return (
    <FormProvider {...methods}>
      <SearchAidsSettings disabled={disabled} />
    </FormProvider>
  );
}

describe("SearchAidsSettings", () => {
  it("renders the three aids", () => {
    render(<Wrapper />);
    expect(screen.getByLabelText("Botão: estou perto?")).toBeChecked();
    expect(screen.getByLabelText("Bússola (só muito perto)")).not.toBeChecked();
    expect(screen.getByLabelText("Raio da zona de busca (metros)")).toHaveValue(500);
  });

  // The compass only fires inside the nearest proximity band, so with
  // proximity off it silently does nothing — say so rather than let an admin
  // turn it on and wonder why nothing changed.
  it("explains that the compass depends on proximity when proximity is off", () => {
    render(<Wrapper proximityEnabled={false} />);
    expect(screen.getByText(/depende do botão de proximidade acima/i)).toBeInTheDocument();
  });

  it("describes the compass normally when proximity is on", () => {
    render(<Wrapper />);
    expect(screen.queryByText(/depende do botão de proximidade acima/i)).not.toBeInTheDocument();
    expect(screen.getByText(/direção em 8 setores/i)).toBeInTheDocument();
  });

  it("disables inputs when disabled prop is set", () => {
    render(<Wrapper disabled />);
    expect(screen.getByLabelText("Botão: estou perto?")).toBeDisabled();
    expect(screen.getByLabelText("Raio da zona de busca (metros)")).toBeDisabled();
  });
});
