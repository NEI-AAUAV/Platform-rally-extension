import { describe, it, expect } from "vitest";
import {
  parseBonusCounters,
  maxCountForCounter,
  serializeCounters,
  parseMaxBonusPoints,
  parsePenaltyCounters,
} from "@/lib/penaltyCounters";

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

describe("parseBonusCounters", () => {
  it("reads a well-formed bonus_counters array", () => {
    const config = {
      bonus_counters: [{ key: "perf", label: "Performance", points: 2 }],
    };
    expect(parseBonusCounters(config)).toEqual([{ key: "perf", label: "Performance", points: 2 }]);
  });

  it("does not confuse the two counter lists", () => {
    const config = {
      penalty_counters: [{ key: "falha", label: "Falha", points: 4 }],
      bonus_counters: [{ key: "perf", label: "Performance", points: 2 }],
    };
    expect(parseBonusCounters(config).map((c) => c.key)).toEqual(["perf"]);
    expect(parsePenaltyCounters(config).map((c) => c.key)).toEqual(["falha"]);
  });

  it("returns an empty array when config has no bonus_counters", () => {
    expect(parseBonusCounters({})).toEqual([]);
    expect(parseBonusCounters(null)).toEqual([]);
    expect(parseBonusCounters(undefined)).toEqual([]);
  });

  it("tolerates bonus_counters that isn't an array", () => {
    expect(parseBonusCounters({ bonus_counters: "oops" })).toEqual([]);
  });

  it("drops malformed entries and keeps the good ones", () => {
    const config = {
      bonus_counters: [
        { key: "perf", label: "Performance", points: 2 },
        { key: "", label: "No key", points: 1 },
        { label: "Missing key", points: 1 },
        { key: "no_points", label: "No points" },
        null,
      ],
    };
    expect(parseBonusCounters(config)).toEqual([{ key: "perf", label: "Performance", points: 2 }]);
  });
});

describe("parseMaxBonusPoints", () => {
  it("reads a numeric cap", () => {
    expect(parseMaxBonusPoints({ max_bonus_points: 5 })).toBe(5);
  });

  it("keeps a cap of zero, which is a real cap and not 'unset'", () => {
    expect(parseMaxBonusPoints({ max_bonus_points: 0 })).toBe(0);
  });

  it("returns undefined when there is no cap", () => {
    expect(parseMaxBonusPoints({})).toBeUndefined();
    expect(parseMaxBonusPoints(null)).toBeUndefined();
  });

  it("ignores values that aren't usable numbers", () => {
    expect(parseMaxBonusPoints({ max_bonus_points: "5" })).toBeUndefined();
    expect(parseMaxBonusPoints({ max_bonus_points: -1 })).toBeUndefined();
    expect(parseMaxBonusPoints({ max_bonus_points: Number.NaN })).toBeUndefined();
  });
});

describe("per-counter ceilings", () => {
  it("reads a counter's own max_points", () => {
    const config = {
      bonus_counters: [{ key: "perf", label: "Performance", points: 2, max_points: 6 }],
    };
    expect(parseBonusCounters(config)[0]?.maxPoints).toBe(6);
  });

  it("keeps a ceiling of 0 as a real ceiling, not 'unlimited'", () => {
    const config = {
      bonus_counters: [{ key: "perf", label: "Performance", points: 2, max_points: 0 }],
    };
    expect(parseBonusCounters(config)[0]?.maxPoints).toBe(0);
  });

  it("drops a malformed or negative ceiling instead of failing the counter", () => {
    const config = {
      bonus_counters: [
        { key: "a", label: "A", points: 2, max_points: "6" },
        { key: "b", label: "B", points: 2, max_points: -1 },
      ],
    };
    const parsed = parseBonusCounters(config);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.maxPoints).toBeUndefined();
    expect(parsed[1]?.maxPoints).toBeUndefined();
  });

  it("derives the maximum count from the ceiling and the per-occurrence price", () => {
    expect(maxCountForCounter({ key: "a", label: "A", points: 3, maxPoints: 10 })).toBe(3);
    expect(maxCountForCounter({ key: "a", label: "A", points: 3 })).toBeUndefined();
    // A counter worth nothing can never reach a ceiling, so it stays unbounded
    // rather than collapsing to zero.
    expect(maxCountForCounter({ key: "a", label: "A", points: 0, maxPoints: 10 })).toBeUndefined();
  });

  it("writes the ceiling back in snake_case, omitting it when unset", () => {
    expect(
      serializeCounters([
        { key: "a", label: "A", points: 2, maxPoints: 6 },
        { key: "b", label: "B", points: 3 },
      ]),
    ).toEqual([
      { key: "a", label: "A", points: 2, max_points: 6 },
      { key: "b", label: "B", points: 3 },
    ]);
  });

  it("survives a parse/serialize round-trip", () => {
    const stored = [{ key: "perf", label: "Performance", points: 2, max_points: 0 }];
    expect(serializeCounters(parseBonusCounters({ bonus_counters: stored }))).toEqual(stored);
  });
});
