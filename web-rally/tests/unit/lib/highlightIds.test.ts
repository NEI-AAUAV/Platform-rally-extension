import { describe, it, expect } from "vitest";
import { formatHighlightIds, parseHighlightIds } from "@/lib/highlightIds";

describe("highlightIds", () => {
  it("parses a comma-separated id list", () => {
    expect(parseHighlightIds("4,7,9")).toEqual([4, 7, 9]);
  });

  it("accepts the router's JSON-decoded lone number and arrays", () => {
    expect(parseHighlightIds(4)).toEqual([4]);
    expect(parseHighlightIds([4, "7"])).toEqual([4, 7]);
  });

  it("drops junk, non-positive and duplicate ids", () => {
    expect(parseHighlightIds("4, x,0,-1,4,2.5,7")).toEqual([4, 7]);
    expect(parseHighlightIds(undefined)).toEqual([]);
    expect(parseHighlightIds({})).toEqual([]);
  });

  it("formats ids back to the URL form, omitting an empty list", () => {
    expect(formatHighlightIds([4, 7])).toBe("4,7");
    expect(formatHighlightIds([])).toBeUndefined();
  });
});
