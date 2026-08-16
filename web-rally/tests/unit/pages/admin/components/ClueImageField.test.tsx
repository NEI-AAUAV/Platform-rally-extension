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
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn().mockReturnValue("blob:mock"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("stages the picked file instead of uploading before the checkpoint exists", async () => {
    const onFileSelected = vi.fn();
    render(
      <ClueImageField
        checkpointId={null}
        currentUrl={null}
        onUploaded={vi.fn()}
        onFileSelected={onFileSelected}
      />,
    );

    await userEvent.upload(screen.getByLabelText("Imagem do enigma"), file());

    // No checkpoint to attach to yet, so the file is staged for the caller
    // instead of hitting the upload endpoint.
    expect(onFileSelected).toHaveBeenCalledWith(expect.any(File));
    expect(mockUploadClueImage).not.toHaveBeenCalled();
  });

  it("previews a staged file while the checkpoint doesn't exist yet", () => {
    render(
      <ClueImageField
        checkpointId={null}
        currentUrl={null}
        onUploaded={vi.fn()}
        pendingFile={file()}
      />,
    );

    expect(screen.getByAltText("Imagem-enigma atual")).toHaveAttribute("src", "blob:mock");
    expect(screen.getByText(/Enviada assim que o checkpoint for criado/)).toBeInTheDocument();
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
