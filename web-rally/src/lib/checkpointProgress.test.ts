import { describe, expect, it } from "vitest";
import type { CheckpointProgress } from "@/client";
import {
  checkpointArrivedAt,
  checkpointScoreFor,
  findCheckpointProgress,
} from "./checkpointProgress";

const row = (overrides: Partial<CheckpointProgress>): CheckpointProgress => ({
  checkpoint_id: 0,
  checkpoint_order: 0,
  status: "pending",
  arrived_at: null,
  completed_at: null,
  score: null,
  skip_cost: null,
  ...overrides,
});

describe("checkpoint progress lookup", () => {
  // Team visited post id 20 (order 2) first, then id 10 (order 1). The old
  // `times[order - 1]` read gave post 1 the arrival time of post 2.
  const team = {
    checkpoints: [
      row({ checkpoint_id: 10, checkpoint_order: 1, arrived_at: "2026-05-01T12:00:00Z", score: 4 }),
      row({ checkpoint_id: 20, checkpoint_order: 2, arrived_at: "2026-05-01T10:00:00Z", score: 9 }),
    ],
  };

  it("pairs each post with its own arrival time, not its visit slot", () => {
    expect(checkpointArrivedAt(team, 10)).toBe("2026-05-01T12:00:00Z");
    expect(checkpointArrivedAt(team, 20)).toBe("2026-05-01T10:00:00Z");
  });

  it("pairs each post with its own score", () => {
    expect(checkpointScoreFor(team, 20)).toBe(9);
  });

  it("falls back safely for unknown posts and teams without progress", () => {
    expect(findCheckpointProgress(team, 99)).toBeUndefined();
    expect(checkpointScoreFor({}, 10)).toBe(0);
    expect(checkpointArrivedAt(null, 10)).toBeNull();
  });
});
