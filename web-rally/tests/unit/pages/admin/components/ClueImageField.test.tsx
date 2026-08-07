import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ClueImageField from "@/pages/admin/components/checkpoints/ClueImageField";

const { mockUploadClueImage } = vi.hoisted(() => ({ mockUploadClueImage: vi.fn() }));

vi.mock("@/client", () => ({
  uploadClueImage: (...args: unknown[]) => mockUploadClueImage(...args),
}));

const file = () => new File(["fake"], "enigma.png", { type: "image/png" });

describe("ClueImageField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cannot upload before the checkpoint exists", () => {
    render(<ClueImageField checkpointId={null} currentUrl={null} onUploaded={vi.fn()} />);

    // An upload needs something to attach to, so say that instead of
    // offering a button that would fail.
    expect(screen.getByText(/Cria o checkpoint primeiro/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("uploads the picked file and reports the stored URL", async () => {
    mockUploadClueImage.mockResolvedValue({
      data: { clue_media_url: "https://cdn.example/clue.png" },
    });
    const onUploaded = vi.fn();
    render(<ClueImageField checkpointId={7} currentUrl={null} onUploaded={onUploaded} />);

    await userEvent.upload(screen.getByLabelText("Imagem do enigma"), file());

    await waitFor(() =>
      expect(mockUploadClueImage).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: 7 } }),
      ),
    );
    expect(onUploaded).toHaveBeenCalledWith("https://cdn.example/clue.png");
  });

  it("shows an existing image and offers to replace it", () => {
    render(
      <ClueImageField
        checkpointId={7}
        currentUrl="https://cdn.example/old.png"
        onUploaded={vi.fn()}
      />,
    );

    expect(screen.getByAltText("Imagem-enigma atual")).toHaveAttribute(
      "src",
      "https://cdn.example/old.png",
    );
    expect(screen.getByRole("button", { name: /Substituir imagem/ })).toBeVisible();
  });

  it("reports a failed upload inline", async () => {
    mockUploadClueImage.mockRejectedValue(new Error("R2 is down"));
    const onUploaded = vi.fn();
    render(<ClueImageField checkpointId={7} currentUrl={null} onUploaded={onUploaded} />);

    await userEvent.upload(screen.getByLabelText("Imagem do enigma"), file());

    // The form has no toast provider, so a swallowed error would be invisible.
    expect(await screen.findByText(/R2 is down/)).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
  });
});
