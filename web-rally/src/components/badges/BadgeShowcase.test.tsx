import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadgeShowcase } from "./BadgeShowcase";

// framer-motion → plain div (avoid animation noise in jsdom).
vi.mock("framer-motion", () => ({
  motion: { div: (props: Record<string, unknown>) => <div {...props} /> },
}));

const mockUseBadgeShowcase = vi.fn();
vi.mock("@/hooks/useBadges", () => ({
  useBadgeShowcase: (teamId: number | undefined) => mockUseBadgeShowcase(teamId),
}));

describe("BadgeShowcase", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders only the badges the team has earned", () => {
    mockUseBadgeShowcase.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        definitions: [
          { code: "won", name: "Duelo", color: "#111111", glyph: "⚔", icon_url: null },
          { code: "locked", name: "Bloqueado", color: "#222222", glyph: "★", icon_url: null },
        ],
        earned: [{ code: "won", awarded_at: "2026-07-02T10:00:00Z", meta: {} }],
      },
    });

    render(<BadgeShowcase teamId={7} />);

    // earned badge shows, locked one is hidden entirely
    expect(screen.getByText("Duelo")).toBeInTheDocument();
    expect(screen.queryByText("Bloqueado")).not.toBeInTheDocument();
    expect(screen.queryByText("Por conquistar")).not.toBeInTheDocument();
    // count chip still reads earned / total catalogue
    expect(screen.getByText("/2")).toBeInTheDocument();
  });

  it("renders nothing when the team has earned no badges", () => {
    mockUseBadgeShowcase.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        definitions: [
          { code: "won", name: "Duelo", color: "#111111", glyph: "\u2694", icon_url: null },
        ],
        earned: [],
      },
    });
    const { container } = render(<BadgeShowcase teamId={7} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while loading", () => {
    mockUseBadgeShowcase.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    const { container } = render(<BadgeShowcase teamId={7} />);
    expect(container).toBeEmptyDOMElement();
  });
});
