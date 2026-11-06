import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PartnerLogosSettings from "@/pages/admin/components/branding/PartnerLogosSettings";
import type { RallySettingsResponse } from "@/client";

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  remove: vi.fn(),
  reorder: vi.fn(),
  aauav: vi.fn(),
  aauavDark: vi.fn(),
  partnerDark: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/client", () => ({
  addRallyPartnerLogo: (...a: unknown[]) => mocks.add(...a),
  removeRallyPartnerLogo: (...a: unknown[]) => mocks.remove(...a),
  reorderRallyPartnerLogos: (...a: unknown[]) => mocks.reorder(...a),
  uploadRallyAauavLogo: (...a: unknown[]) => mocks.aauav(...a),
  uploadRallyAauavLogoDark: (...a: unknown[]) => mocks.aauavDark(...a),
  uploadRallyPartnerDarkLogo: (...a: unknown[]) => mocks.partnerDark(...a),
}));

vi.mock("@/hooks/use-toast", () => ({ useAppToast: () => mocks.toast }));

const logos = [
  { id: "a", name: "NEI", url: "/static/a.png", dark_url: "/static/a-dark.png" },
  { id: "b", name: "NEEET", url: "/static/b.png", dark_url: null },
];

function renderSettings(overrides: Partial<RallySettingsResponse> = {}) {
  const onChanged = vi.fn();
  const onToggle = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const settings = {
    show_partners: true,
    partner_logos: logos,
    aauav_logo_url: "/static/aauav.png",
    aauav_logo_dark_url: null,
    ...overrides,
  } as unknown as RallySettingsResponse;
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <PartnerLogosSettings
        settings={settings}
        onChanged={onChanged}
        onToggle={onToggle}
        isSaving={false}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onChanged, onToggle };
}

const file = () => new File(["x"], "logo.png", { type: "image/png" });

function hiddenInputs(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'));
}

describe("PartnerLogosSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of [
      mocks.add,
      mocks.remove,
      mocks.reorder,
      mocks.aauav,
      mocks.aauavDark,
      mocks.partnerDark,
    ]) {
      fn.mockResolvedValue({ data: {} });
    }
  });

  it("renders logos and hint for missing dark version", () => {
    renderSettings();
    expect(screen.getByText("NEI")).toBeInTheDocument();
    expect(screen.getByText(/Sem versão branca/)).toBeInTheDocument();
  });

  it("toggles visibility", () => {
    const { onToggle } = renderSettings({ show_partners: false });
    fireEvent.click(screen.getByLabelText("Mostrar núcleos na página inicial"));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("disables add until a name is typed, then uploads with trimmed name", async () => {
    const { container, onChanged } = renderSettings();
    const addButton = screen.getByRole("button", { name: /Adicionar logótipo/ });
    expect(addButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nome do núcleo"), { target: { value: "  NEMat " } });
    expect(addButton).toBeEnabled();
    fireEvent.click(addButton);
    const addInput = hiddenInputs(container).at(-1)!;
    fireEvent.change(addInput, { target: { files: [file()] } });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mocks.add).toHaveBeenCalledWith({ body: { image: expect.any(File), name: "NEMat" } });
    expect(mocks.toast.success).toHaveBeenCalledWith("Núcleo adicionado!");
  });

  it("ignores empty file selection", () => {
    const { container } = renderSettings();
    fireEvent.change(hiddenInputs(container).at(-1)!, { target: { files: [] } });
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("removes a logo", async () => {
    const { onChanged } = renderSettings();
    fireEvent.click(screen.getByLabelText("Remover NEI"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mocks.remove).toHaveBeenCalledWith({ path: { logo_id: "a" } });
  });

  it("reorders logos both directions and disables edges", async () => {
    renderSettings();
    expect(screen.getByLabelText("Subir NEI")).toBeDisabled();
    expect(screen.getByLabelText("Descer NEEET")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Descer NEI"));
    await waitFor(() => expect(mocks.reorder).toHaveBeenCalledWith({ body: { ids: ["b", "a"] } }));
    fireEvent.click(screen.getByLabelText("Subir NEEET"));
    await waitFor(() => expect(mocks.reorder).toHaveBeenCalledTimes(2));
  });

  it("uploads a dark version for a partner", async () => {
    const { container, onChanged } = renderSettings();
    fireEvent.click(screen.getByLabelText("Versão branca de NEEET"));
    // inputs: aauav, aauav dark, partner dark, add
    fireEvent.change(hiddenInputs(container)[2]!, { target: { files: [file()] } });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mocks.partnerDark).toHaveBeenCalledWith({
      path: { logo_id: "b" },
      body: { image: expect.any(File) },
    });
  });

  it("uploads the AAUAv symbols", async () => {
    const { container } = renderSettings();
    const [aauav, aauavDark] = hiddenInputs(container);
    fireEvent.change(aauav!, { target: { files: [file()] } });
    fireEvent.change(aauavDark!, { target: { files: [file()] } });
    await waitFor(() => expect(mocks.aauavDark).toHaveBeenCalled());
    expect(mocks.aauav).toHaveBeenCalled();
  });

  it("shows an error toast on failure", async () => {
    mocks.remove.mockRejectedValue(new Error("boom"));
    renderSettings();
    fireEvent.click(screen.getByLabelText("Remover NEI"));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
  });

  it("renders without logos", () => {
    renderSettings({ partner_logos: undefined });
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
