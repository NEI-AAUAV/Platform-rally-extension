import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useForm, FormProvider } from "react-hook-form";
import ScoringSettings from "@/pages/settings/components/ScoringSettings";
import { useEventConfiguration } from "@/pages/settings/components/useEventConfiguration";

const mockUpdateMutate = vi.fn();

vi.mock("@/pages/settings/components/useEventConfiguration", () => ({
  useEventConfiguration: vi.fn(),
  useUpdateEventCapabilities: () => ({
    mutate: mockUpdateMutate,
    isPending: false,
  }),
}));

function Wrapper({ eventType }: { readonly eventType?: string }) {
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
      <ScoringSettings eventType={eventType} />
    </FormProvider>
  );
}

describe("ScoringSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useEventConfiguration).mockReturnValue({
      data: undefined,
    } as ReturnType<typeof useEventConfiguration>);
  });

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

  it("renders optional drinking switch and gates sub-group when effective is false", async () => {
    vi.mocked(useEventConfiguration).mockReturnValue({
      data: {
        capabilities: {
          drinking_scoring: {
            policy: "optional",
            configured: false,
            effective: false,
            available: true,
          },
        },
      },
    } as unknown as ReturnType<typeof useEventConfiguration>);

    const user = userEvent.setup();
    render(<Wrapper />);

    expect(screen.getByText("Ativar mecânicas de bebida")).toBeInTheDocument();
    expect(screen.getByText("Opcional")).toBeInTheDocument();
    expect(screen.queryByLabelText("Penalização por vómito")).not.toBeInTheDocument();

    const switchEl = screen.getByRole("switch", { name: "Ativar mecânicas de bebida" });
    await user.click(switchEl);
    expect(mockUpdateMutate).toHaveBeenCalledWith({ drinking_scoring: true });
  });

  it("renders sub-group fields when drinking capability is optional and effective is true", () => {
    vi.mocked(useEventConfiguration).mockReturnValue({
      data: {
        capabilities: {
          drinking_scoring: {
            policy: "optional",
            configured: true,
            effective: true,
            available: true,
          },
        },
      },
    } as unknown as ReturnType<typeof useEventConfiguration>);

    render(<Wrapper />);

    expect(screen.getByText("Ativar mecânicas de bebida")).toBeInTheDocument();
    expect(screen.getByLabelText("Penalização por vómito")).toBeInTheDocument();
    expect(screen.getByLabelText("Bónus por shot extra")).toBeInTheDocument();
  });

  it("hides drinking mechanics completely when capability is forbidden", () => {
    vi.mocked(useEventConfiguration).mockReturnValue({
      data: {
        capabilities: {
          drinking_scoring: {
            policy: "forbidden",
            configured: false,
            effective: false,
            available: true,
          },
        },
      },
    } as unknown as ReturnType<typeof useEventConfiguration>);

    render(<Wrapper />);

    expect(screen.queryByText("Ativar mecânicas de bebida")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Penalização por vómito")).not.toBeInTheDocument();
  });
});
