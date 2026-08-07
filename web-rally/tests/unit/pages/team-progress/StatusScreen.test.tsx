import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import StatusScreen from "@/pages/team-progress/StatusScreen";

describe("StatusScreen", () => {
  it("renders loading variant with spinner and title", () => {
    render(<StatusScreen variant="loading" title="A carregar..." />);
    expect(screen.getByText("A carregar...")).toBeInTheDocument();
  });

  it("renders error variant with title and description", () => {
    render(<StatusScreen variant="error" title="Erro" description="Algo correu mal." />);
    expect(screen.getByText("Erro")).toBeInTheDocument();
    expect(screen.getByText("Algo correu mal.")).toBeInTheDocument();
  });

  it("renders error variant without description", () => {
    render(<StatusScreen variant="error" title="Erro" />);
    expect(screen.getByText("Erro")).toBeInTheDocument();
  });
});
