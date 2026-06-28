import { describe, it, expect } from "vitest";
import { buildReplayFrames, type ReplayEntry } from "@/lib/replayFrames";

const entry = (
  team_id: number,
  team_name: string,
  total: number,
  recorded_at: string,
): ReplayEntry => ({ team_id, team_name, total, recorded_at });

describe("buildReplayFrames", () => {
  it("returns no frames for an empty timeline", () => {
    expect(buildReplayFrames([])).toEqual([]);
  });

  it("emits one frame per entry", () => {
    const frames = buildReplayFrames([
      entry(1, "A", 10, "t1"),
      entry(2, "B", 20, "t2"),
    ]);
    expect(frames).toHaveLength(2);
    expect(frames[0]!.at).toBe("t1");
  });

  it("carries forward each team's latest total and ranks best-first", () => {
    const frames = buildReplayFrames([
      entry(1, "A", 10, "t1"),
      entry(2, "B", 5, "t2"),
      entry(1, "A", 30, "t3"), // A overtakes
    ]);

    const last = frames[2]!.rows;
    expect(last.map((r) => r.teamId)).toEqual([1, 2]);
    expect(last[0]).toMatchObject({ teamId: 1, total: 30, rank: 1 });
    expect(last[1]).toMatchObject({ teamId: 2, total: 5, rank: 2 });
  });

  it("breaks ties by team name for stable ordering", () => {
    const frames = buildReplayFrames([
      entry(2, "Zeta", 10, "t1"),
      entry(1, "Alpha", 10, "t2"),
    ]);
    expect(frames[1]!.rows.map((r) => r.teamName)).toEqual(["Alpha", "Zeta"]);
  });
});
