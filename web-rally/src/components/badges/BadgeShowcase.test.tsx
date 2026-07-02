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

  it("renders the DB catalogue with earned + locked badges", () => {
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

    // both catalogue badges render (locked included)
    expect(screen.getByText("Duelo")).toBeInTheDocument();
    expect(screen.getByText("Bloqueado")).toBeInTheDocument();
    // count chip: 1 of 2 earned
    expect(screen.getByText("/2")).toBeInTheDocument();
    // the locked one shows the "not yet earned" label
    expect(screen.getByText("Por conquistar")).toBeInTheDocument();
  });

  it("renders nothing while loading", () => {
    mockUseBadgeShowcase.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    const { container } = render(<BadgeShowcase teamId={7} />);
    expect(container).toBeEmptyDOMElement();
  });
});
