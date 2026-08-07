import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { NextCheckpointCard } from "@/pages/teams/[id]/NextCheckpointCard";
import type { DetailedTeam, DetailedCheckPoint, RallySettingsResponse } from "@/client";

describe("NextCheckpointCard", () => {
  const team = { last_checkpoint_number: 1, times: [] } as unknown as DetailedTeam;
  const checkpoints = [
    { id: 1, order: 1, name: "Posto 1" },
    {
      id: 2,
      order: 2,
      name: "Posto 2",
      description: "Second stop",
      latitude: 40.1,
      longitude: -8.5,
    },
  ] as DetailedCheckPoint[];

  it("renders the next checkpoint name and description", () => {
    render(
      <NextCheckpointCard
        team={team}
        checkpoints={checkpoints}
        totalCount={3}
        settings={{} as RallySettingsResponse}
      />,
    );
    expect(screen.getByText("Posto 2")).toBeInTheDocument();
    expect(screen.getByText("Second stop")).toBeInTheDocument();
  });

  it("renders a map link when coordinates and show_checkpoint_map are enabled", () => {
    render(
      <NextCheckpointCard
        team={team}
        checkpoints={checkpoints}
        totalCount={3}
        settings={{ show_checkpoint_map: true } as RallySettingsResponse}
      />,
    );
    expect(screen.getByText("Abrir no mapa")).toBeInTheDocument();
  });

  it("hides the map when show_checkpoint_map is false", () => {
    render(
      <NextCheckpointCard
        team={team}
        checkpoints={checkpoints}
        totalCount={3}
        settings={{ show_checkpoint_map: false } as RallySettingsResponse}
      />,
    );
    expect(screen.queryByText("Abrir no mapa")).not.toBeInTheDocument();
  });

  it("renders nothing when there are no more checkpoints and route mode is not complete", () => {
    const doneTeam = { last_checkpoint_number: 3, times: [] } as unknown as DetailedTeam;
    const { container } = render(
      <NextCheckpointCard
        team={doneTeam}
        checkpoints={checkpoints}
        totalCount={2}
        settings={{} as RallySettingsResponse}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders heading when route mode is complete even with no more checkpoints", () => {
    const doneTeam = { last_checkpoint_number: 3, times: [] } as unknown as DetailedTeam;
    render(
      <NextCheckpointCard
        team={doneTeam}
        checkpoints={checkpoints}
        totalCount={2}
        settings={{ show_route_mode: "complete" } as RallySettingsResponse}
      />,
    );
    expect(screen.getByText("Próximo Posto")).toBeInTheDocument();
  });
});
