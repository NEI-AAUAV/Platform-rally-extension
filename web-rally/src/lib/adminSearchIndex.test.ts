import { describe, it, expect } from "vitest";
import { searchAdmin } from "./adminSearchIndex";

describe("searchAdmin", () => {
  it("matches case-insensitively", () => {
    const results = searchAdmin("penalização por vómito");
    expect(results.map((r) => r.key)).toContain("penalty_per_puke");
  });

  it("matches accented labels with an unaccented query", () => {
    const results = searchAdmin("penalizacao");
    expect(results.some((r) => r.key === "penalty_per_puke")).toBe(true);
  });

  it("matches a substring, not just a full label", () => {
    const results = searchAdmin("pista");
    expect(results.map((r) => r.key)).toEqual(
      expect.arrayContaining(["hints_enabled", "hint_penalty"]),
    );
  });

  it("returns an empty array for an empty query", () => {
    expect(searchAdmin("")).toEqual([]);
    expect(searchAdmin("   ")).toEqual([]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(searchAdmin("xyznonexistentsetting")).toEqual([]);
  });

  it("respects the limit parameter", () => {
    const results = searchAdmin("o", 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });
});
