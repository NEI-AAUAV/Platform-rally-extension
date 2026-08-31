/**
 * The previous loading rings were border-based and were repainted a single flat
 * colour by `.rally-border-accent`, so they rotated invisibly and read as a
 * static circle. These tests lock in the parts that make the new spinner
 * actually look like it is moving: the rotating group and the dashed arc.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import Spinner from "@/components/shared/state/Spinner";

describe("Spinner", () => {
  it("renders a rotating ring and an animated arc", () => {
    const { container } = render(<Spinner />);

    expect(container.querySelector(".rally-spinner-rotate")).not.toBeNull();
    expect(container.querySelector(".rally-spinner-dash")).not.toBeNull();
  });

  it("exposes a status role with the given label", () => {
    render(<Spinner label="A carregar equipas" />);

    expect(screen.getByRole("status", { name: "A carregar equipas" })).toBeInTheDocument();
  });

  it("is decorative when the label is empty so the surrounding block announces once", () => {
    render(<Spinner label="" />);

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("paints the arc with the branding accent instead of a border utility", () => {
    const { container } = render(<Spinner />);
    const arc = container.querySelector(".rally-spinner-dash") as SVGCircleElement;

    expect(arc.getAttribute("style")).toContain("--rally-accent");
  });
});
