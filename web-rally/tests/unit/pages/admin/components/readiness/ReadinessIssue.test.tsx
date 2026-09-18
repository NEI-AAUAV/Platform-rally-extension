import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ReadinessIssue from "@/pages/admin/components/readiness/ReadinessIssue";
import type { ConfigurationIssueResponse } from "@/client";

function issue(overrides: Partial<ConfigurationIssueResponse> = {}): ConfigurationIssueResponse {
  return { code: "NO_CHECKPOINTS", severity: "error", message: "Sem postos", ...overrides };
}

describe("ReadinessIssue", () => {
  it("renders the issue message and suggestion", () => {
    render(<ReadinessIssue issue={issue({ suggestion: "Crie um posto." })} />);
    expect(screen.getByText("Sem postos")).toBeInTheDocument();
    expect(screen.getByText("Crie um posto.")).toBeInTheDocument();
  });

  it("shows a Corrigir link and navigates when the code is mapped and onNavigate is provided", () => {
    const onNavigate = vi.fn();
    render(<ReadinessIssue issue={issue({ code: "NO_CHECKPOINTS" })} onNavigate={onNavigate} />);
    const link = screen.getByText("Corrigir →");
    link.click();
    expect(onNavigate).toHaveBeenCalledWith("checkpoints");
  });

  it("does not show a Corrigir link when the code has no mapped destination", () => {
    const onNavigate = vi.fn();
    render(
      <ReadinessIssue issue={issue({ code: "SOME_UNKNOWN_CODE" })} onNavigate={onNavigate} />,
    );
    expect(screen.queryByText("Corrigir →")).not.toBeInTheDocument();
  });

  it("does not show a Corrigir link when onNavigate is not provided, even for a mapped code", () => {
    render(<ReadinessIssue issue={issue({ code: "NO_CHECKPOINTS" })} />);
    expect(screen.queryByText("Corrigir →")).not.toBeInTheDocument();
  });
});
