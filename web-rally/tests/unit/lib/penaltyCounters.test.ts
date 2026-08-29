import { describe, it, expect } from "vitest";
import { parsePenaltyCounters } from "@/lib/penaltyCounters";

describe("parsePenaltyCounters", () => {
  it("reads a well-formed penalty_counters array", () => {
    const config = {
      penalty_counters: [{ key: "falha_baliza", label: "Falha na baliza", points: 4 }],
    };
    expect(parsePenaltyCounters(config)).toEqual([
      { key: "falha_baliza", label: "Falha na baliza", points: 4 },
    ]);
  });

  it("returns an empty array when config has no penalty_counters", () => {
    expect(parsePenaltyCounters({ max_points: 100 })).toEqual([]);
  });

  it("tolerates null/undefined/non-object config", () => {
    expect(parsePenaltyCounters(null)).toEqual([]);
    expect(parsePenaltyCounters(undefined)).toEqual([]);
    expect(parsePenaltyCounters("not an object")).toEqual([]);
  });

  it("tolerates penalty_counters that isn't an array", () => {
    expect(parsePenaltyCounters({ penalty_counters: "oops" })).toEqual([]);
  });

  it("filters out malformed entries without dropping the well-formed ones", () => {
    const config = {
      penalty_counters: [
        { key: "good", label: "Good", points: 3 },
        { key: "", label: "Empty key", points: 3 },
        { label: "Missing key", points: 3 },
        { key: "no_points", label: "No points" },
        null,
        "garbage",
      ],
    };
    expect(parsePenaltyCounters(config)).toEqual([{ key: "good", label: "Good", points: 3 }]);
  });
});
