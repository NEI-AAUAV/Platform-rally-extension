import { describe, it, expect } from "vitest";
import {
  buildPenaltyRates,
  countsToPoints,
  pointsToCounts,
  parsePenaltyCounters,
} from "@/lib/penaltyCounters";

describe("buildPenaltyRates", () => {
  it("merges built-in rates with custom counters", () => {
    const rates = buildPenaltyRates({ vomit: 5, not_drinking: 2 }, [
      { key: "falha_baliza", label: "Falha na baliza", points: 4 },
    ]);

    expect(rates).toEqual({ vomit: 5, not_drinking: 2, falha_baliza: 4 });
  });

  it("stores custom rates as a positive magnitude even if points is negative", () => {
    const rates = buildPenaltyRates({}, [{ key: "x", label: "X", points: -7 }]);
    expect(rates.x).toBe(7);
  });

  it("a custom counter can override a built-in key of the same name", () => {
    const rates = buildPenaltyRates({ vomit: 5 }, [{ key: "vomit", label: "V", points: 9 }]);
    expect(rates.vomit).toBe(9);
  });
});

describe("countsToPoints", () => {
  const rates = { vomit: 5, falha_baliza: 4 };

  it("multiplies each count by its rate", () => {
    expect(countsToPoints({ vomit: 2, falha_baliza: 3 }, rates)).toEqual({
      vomit: 10,
      falha_baliza: 12,
    });
  });

  it("drops zero/falsy counts instead of emitting a zero entry", () => {
    expect(countsToPoints({ vomit: 0, falha_baliza: 3 }, rates)).toEqual({ falha_baliza: 12 });
  });

  it("passes a key with no known rate through verbatim (deleted counter, G5)", () => {
    // A counter removed from config after a result was scored still round-trips:
    // pointsToCounts keeps the stored value, countsToPoints must not wipe it to
    // 0 by multiplying by a `?? 0` fallback — the penalty would vanish from the
    // team's total on the next edit.
    expect(countsToPoints({ unknown: 20 }, rates)).toEqual({ unknown: 20 });
  });

  it("an empty count map produces an empty point map", () => {
    expect(countsToPoints({}, rates)).toEqual({});
  });
});

describe("pointsToCounts", () => {
  const rates = { vomit: 5, falha_baliza: 4 };

  it("divides each stored total back into a count", () => {
    expect(pointsToCounts({ vomit: 10, falha_baliza: 12 }, rates)).toEqual({
      vomit: 2,
      falha_baliza: 3,
    });
  });

  it("keeps a key with no known rate verbatim rather than dividing by zero", () => {
    // Covers a counter that existed when the result was scored but was since
    // deleted from the activity's config, and legacy rows stored before this
    // fix existed (their value was already a raw, unscaled count).
    expect(pointsToCounts({ mystery: 7 }, rates)).toEqual({ mystery: 7 });
  });

  it("round-trips with countsToPoints for whole-number rates", () => {
    const original = { vomit: 3, falha_baliza: 2 };
    const points = countsToPoints(original, rates);
    expect(pointsToCounts(points, rates)).toEqual(original);
  });
});

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
