import { describe, it, expect } from "vitest";
import { getEventTerms, capitalize } from "@/lib/eventTerms";

describe("getEventTerms", () => {
  it("returns rally_tascas terms by default", () => {
    expect(getEventTerms()).toEqual(getEventTerms("rally_tascas"));
  });

  it("returns peddy_paper terms", () => {
    expect(getEventTerms("peddy_paper").checkpoint).toBe("posto");
  });

  it("carries the checkpoint noun gender so PT copy can agree with it", () => {
    expect(getEventTerms("rally_tascas").checkpointGender).toBe("f");
    expect(getEventTerms("peddy_paper").checkpointGender).toBe("m");
    expect(getEventTerms("olympic").checkpointGender).toBe("f");
  });

  it("falls back to rally_tascas for an unknown event type", () => {
    expect(getEventTerms("not-a-real-type")).toEqual(getEventTerms("rally_tascas"));
  });

  it("falls back to rally_tascas for null", () => {
    expect(getEventTerms(null)).toEqual(getEventTerms("rally_tascas"));
  });
});

describe("capitalize", () => {
  it("capitalizes the first letter of a word", () => {
    expect(capitalize("tasca")).toBe("Tasca");
  });

  it("returns empty string unchanged", () => {
    expect(capitalize("")).toBe("");
  });
});
