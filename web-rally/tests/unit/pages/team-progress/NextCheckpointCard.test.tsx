import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { NextCheckpointCard } from "@/pages/teams/[id]/NextCheckpointCard";
import type { DetailedCheckPoint, RallySettingsResponse } from "@/client";

describe("NextCheckpointCard", () => {
  const revealed = {
    id: 2,
    order: 2,
    name: "Posto 2",
    description: "Second stop",
    latitude: 40.1,
    longitude: -8.5,
  } as DetailedCheckPoint;

  it("renders the next checkpoint name and description", () => {
    render(
      <NextCheckpointCard
        nextCheckpoint={revealed}
        isRouteFinished={false}
        settings={{} as RallySettingsResponse}
      />,
    );
    expect(screen.getByText("Posto 2")).toBeInTheDocument();
    expect(screen.getByText("Second stop")).toBeInTheDocument();
  });

  it("renders a map link when coordinates and show_checkpoint_map are enabled", () => {
    render(
      <NextCheckpointCard
        nextCheckpoint={revealed}
        isRouteFinished={false}
        settings={{ show_checkpoint_map: true } as RallySettingsResponse}
      />,
    );
    expect(screen.getByText("Abrir no mapa")).toBeInTheDocument();
  });

  it("hides the map when show_checkpoint_map is false", () => {
    render(
      <NextCheckpointCard
        nextCheckpoint={revealed}
        isRouteFinished={false}
        settings={{ show_checkpoint_map: false } as RallySettingsResponse}
      />,
    );
    expect(screen.queryByText("Abrir no mapa")).not.toBeInTheDocument();
  });

  it("renders nothing once the server says the route is finished", () => {
    const { container } = render(
      <NextCheckpointCard
        nextCheckpoint={undefined}
        isRouteFinished
        settings={{} as RallySettingsResponse}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("withholds the location of a post the server redacted", () => {
    // This page is another team's public profile. Printing the venue, its
    // coordinates and a map link for a post nobody has reached hands the
    // riddle's answer to whoever opens the page.
    const redacted = {
      id: 3,
      order: 3,
      name: "Posto 3",
      description: null,
      latitude: null,
      longitude: null,
      is_redacted: true,
    } as unknown as DetailedCheckPoint;

    render(
      <NextCheckpointCard
        nextCheckpoint={redacted}
        isRouteFinished={false}
        settings={{ show_checkpoint_map: true } as RallySettingsResponse}
      />,
    );
    expect(screen.getByText("Posto 3")).toBeInTheDocument();
    expect(screen.getByText(/Ainda por descobrir/)).toBeInTheDocument();
    expect(screen.queryByText("Abrir no mapa")).not.toBeInTheDocument();
  });
});
