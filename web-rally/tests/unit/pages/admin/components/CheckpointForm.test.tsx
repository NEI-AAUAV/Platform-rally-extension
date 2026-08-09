import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import CheckpointForm from "@/pages/admin/components/checkpoints/CheckpointForm";
import {
  checkpointFormSchema,
  type CheckpointForm as CheckpointFormValues,
} from "@/pages/admin/components/checkpoints/useCheckpointManagement";
import type { RouteStageResponse } from "@/client";

// Radix's checkbox observes its own size on mount; the global setup's mock is
// not constructible, so this suite installs the same class-shaped stand-in the
// other Radix-using suites use.
beforeAll(() => {
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = MockResizeObserver;
});

vi.mock("@/pages/admin/components/checkpoints/CheckpointLocationPicker", () => ({
  default: ({
    latitude,
    longitude,
    onChange,
  }: {
    latitude: number | null;
    longitude: number | null;
    onChange: (lat: number, lng: number) => void;
  }) => (
    <div data-testid="location-picker">
      <span>
        {latitude ?? "null"},{longitude ?? "null"}
      </span>
      <button type="button" onClick={() => onChange(40.5, -8.5)}>
        set-location
      </button>
    </div>
  ),
}));

type Harness = Readonly<{
  isEditing: boolean;
  isSubmitting: boolean;
  onSubmit: (data: CheckpointFormValues) => void;
  onCancel: () => void;
  defaultValues?: Partial<CheckpointFormValues>;
  formRef?: { current: UseFormReturn<CheckpointFormValues> | null };
  stages?: ReadonlyArray<RouteStageResponse>;
}>;

function Harness({
  isEditing,
  isSubmitting,
  onSubmit,
  onCancel,
  defaultValues,
  formRef,
  stages,
}: Harness) {
  const form = useForm<CheckpointFormValues>({
    resolver: zodResolver(checkpointFormSchema),
    defaultValues: {
      name: "",
      description: "",
      latitude: "",
      longitude: "",
      arrival_radius_m: 50,
      order: 1,
      is_draft: false,
      is_placeholder: false,
      ...defaultValues,
    },
  });

  if (formRef) {
    formRef.current = form;
  }

  return (
    <CheckpointForm
      form={form}
      isEditing={isEditing}
      isSubmitting={isSubmitting}
      onSubmit={onSubmit}
      onCancel={onCancel}
      stages={stages}
    />
  );
}

function renderForm(overrides: Partial<Harness> = {}) {
  const formRef: { current: UseFormReturn<CheckpointFormValues> | null } = { current: null };
  const onSubmit = overrides.onSubmit ?? vi.fn();
  const onCancel = overrides.onCancel ?? vi.fn();
  const view = render(
    <Harness
      isEditing={overrides.isEditing ?? false}
      isSubmitting={overrides.isSubmitting ?? false}
      onSubmit={onSubmit}
      onCancel={onCancel}
      defaultValues={overrides.defaultValues}
      formRef={formRef}
      stages={overrides.stages}
    />,
  );
  return { ...view, formRef, onSubmit, onCancel };
}

describe("CheckpointForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the creation heading and submit label when not editing", () => {
    renderForm({ isEditing: false });

    expect(screen.getByText("Criar Novo Checkpoint")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Criar Checkpoint/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cancelar/i })).not.toBeInTheDocument();
  });

  it("renders the editing heading, submit label and cancel button when editing", () => {
    renderForm({ isEditing: true, defaultValues: { name: "Existing" } });

    expect(screen.getByText("Editar Checkpoint")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Atualizar Checkpoint/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancelar/i })).toBeInTheDocument();
  });

  it("calls onCancel when the cancel button is clicked", () => {
    const { onCancel } = renderForm({ isEditing: true });

    fireEvent.click(screen.getByRole("button", { name: /Cancelar/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables the submit button while submitting", () => {
    renderForm({ isSubmitting: true });

    expect(screen.getByRole("button", { name: /Criar Checkpoint/i })).toBeDisabled();
  });

  it("shows a validation error when name is empty and the form is submitted", async () => {
    const { onSubmit } = renderForm();

    fireEvent.click(screen.getByRole("button", { name: /Criar Checkpoint/i }));

    expect(await screen.findByText("Nome do checkpoint é obrigatório")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits valid form data", async () => {
    const { onSubmit } = renderForm({
      defaultValues: { name: "CP One", arrival_radius_m: 25, order: 2 },
    });

    fireEvent.click(screen.getByRole("button", { name: /Criar Checkpoint/i }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "CP One", arrival_radius_m: 25, order: 2 }),
      expect.anything(),
    );
  });

  it("updates latitude and longitude fields when typed", () => {
    const { formRef } = renderForm();

    const latInput = screen.getByPlaceholderText("Ex: 40.6405");
    fireEvent.change(latInput, { target: { value: "40.1" } });
    expect(formRef.current?.getValues("latitude")).toBe("40.1");
  });

  it("updates location via the location picker onChange callback", () => {
    const { formRef } = renderForm();

    fireEvent.click(screen.getByText("set-location"));

    expect(formRef.current?.getValues("latitude")).toBe("40.500000");
    expect(formRef.current?.getValues("longitude")).toBe("-8.500000");
  });

  it("updates arrival_radius_m as a number when input changes", () => {
    const { formRef } = renderForm();

    const radiusInput = screen.getByPlaceholderText("Ex: 50");
    fireEvent.change(radiusInput, { target: { value: "100" } });
    expect(formRef.current?.getValues("arrival_radius_m")).toBe(100);
  });

  it("falls back to 0 for arrival_radius_m on invalid numeric input", () => {
    const { formRef } = renderForm();

    const radiusInput = screen.getByPlaceholderText("Ex: 50");
    fireEvent.change(radiusInput, { target: { value: "abc" } });
    expect(formRef.current?.getValues("arrival_radius_m")).toBe(0);
  });

  it("updates order as a number when input changes", () => {
    const { formRef } = renderForm();

    const orderInput = screen.getByPlaceholderText("Ex: 1");
    fireEvent.change(orderInput, { target: { value: "3" } });
    expect(formRef.current?.getValues("order")).toBe(3);
  });

  it("passes current latitude/longitude to the location picker", () => {
    renderForm({ defaultValues: { latitude: "10.5", longitude: "-20.25" } });

    expect(screen.getByTestId("location-picker")).toHaveTextContent("10.5,-20.25");
  });

  it("explains there are no stages yet instead of hiding the field", () => {
    renderForm({ stages: [] });

    expect(screen.getByText("Etapa")).toBeInTheDocument();
    expect(screen.getByText(/Ainda não criaste nenhuma etapa/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Etapa" })).not.toBeInTheDocument();
  });

  it("shows the stage picker once stages exist", () => {
    const stages: RouteStageResponse[] = [
      {
        id: 1,
        name: "Universidade",
        order: 1,
        order_matters: true,
        required_count: null,
        checkpoint_ids: [],
      },
      {
        id: 2,
        name: "Bares",
        order: 2,
        order_matters: false,
        required_count: 3,
        checkpoint_ids: [],
      },
    ];
    renderForm({ stages });

    expect(screen.queryByText(/Ainda não criaste nenhuma etapa/)).not.toBeInTheDocument();
    expect(screen.getByText("1. Universidade")).toBeInTheDocument();
    expect(screen.getByText("2. Bares")).toBeInTheDocument();
  });
});
