import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import CheckpointMediaAttachment from "./CheckpointMediaAttachment";
import type { CheckpointMediaResponse } from "@/client";

const base: CheckpointMediaResponse = {
  id: 1,
  checkpoint_id: 1,
  kind: "qr",
  caption: null,
  order: 0,
  title: null,
  content_url: null,
  content_text: null,
  image_url: null,
};

describe("CheckpointMediaAttachment", () => {
  it("renders a QR code for a qr item", () => {
    render(
      <CheckpointMediaAttachment item={{ ...base, kind: "qr", content_text: "riddle-payload" }} />,
    );
    expect(document.querySelector("svg")).toBeInTheDocument();
  });

  it("shows the caption alongside the qr code", () => {
    render(
      <CheckpointMediaAttachment
        item={{ ...base, kind: "qr", content_text: "riddle", caption: "Aponta aqui" }}
      />,
    );
    expect(screen.getByText("Aponta aqui")).toBeInTheDocument();
  });

  it("renders a Spotify iframe for a valid open.spotify.com URL", () => {
    render(
      <CheckpointMediaAttachment
        item={{
          ...base,
          kind: "spotify",
          content_url: "https://open.spotify.com/track/abc123",
          title: "Ouve isto",
        }}
      />,
    );
    const iframe = document.querySelector("iframe");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute("src", "https://open.spotify.com/embed/track/abc123");
    expect(iframe).toHaveAttribute("sandbox");
    expect(screen.getByText("Ouve isto")).toBeInTheDocument();
  });

  it("renders nothing for a spotify item whose URL doesn't parse into an embed", () => {
    const { container } = render(
      <CheckpointMediaAttachment
        item={{ ...base, kind: "spotify", content_url: "https://open.spotify.com/artist/abc" }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders an external link for a link item", () => {
    render(
      <CheckpointMediaAttachment
        item={{ ...base, kind: "link", content_url: "https://example.com", title: "Site oficial" }}
      />,
    );
    const link = screen.getByRole("link", { name: /Site oficial/ });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("falls back to the raw URL as link text when no title is set", () => {
    render(
      <CheckpointMediaAttachment
        item={{ ...base, kind: "link", content_url: "https://example.com" }}
      />,
    );
    expect(screen.getByText("https://example.com")).toBeInTheDocument();
  });

  it("renders nothing for photo/fun_fact — those stay in CheckpointDiscovery", () => {
    const { container } = render(<CheckpointMediaAttachment item={{ ...base, kind: "photo" }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
