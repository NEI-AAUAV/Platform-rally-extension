import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import TeamDetailsCard from "@/pages/team-progress/TeamDetailsCard";
import { departureTime } from "@/pages/team-progress/checkpointHours";
import type { PrivilegedDetailedTeam } from "@/client";

describe("TeamDetailsCard", () => {
  it("lists the access code", () => {
    render(<TeamDetailsCard team={{ name: "A", access_code: "XYZ" } as PrivilegedDetailedTeam} />);
    expect(screen.getByText("Código de acesso")).toBeInTheDocument();
    expect(screen.getByText("XYZ")).toBeInTheDocument();
  });

  it("renders nothing when there is nothing to show", () => {
    const { container } = render(
      <TeamDetailsCard team={{ name: "A" } as PrivilegedDetailedTeam} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the team's own departure for staggered starts", () => {
    render(
      <TeamDetailsCard
        team={{ name: "A", start_offset_minutes: 15 } as PrivilegedDetailedTeam}
        rallyStartTime="2026-01-01T10:00:00"
      />,
    );
    expect(screen.getByText("A vossa partida")).toBeInTheDocument();
    expect(screen.getByText("10:15")).toBeInTheDocument();
  });

  it("has no departure without an offset or a valid start", () => {
    expect(departureTime("2026-01-01T10:00:00", 0)).toBeNull();
    expect(departureTime(null, 10)).toBeNull();
    expect(departureTime("nope", 10)).toBeNull();
  });
});
