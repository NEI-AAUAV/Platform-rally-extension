import { describe, it, expect } from "vitest";
import { missingLabel } from "@/pages/admin/components/checkpoints/routeReadiness";

describe("missingLabel", () => {
  it("translates the keys the API reports today", () => {
    expect(missingLabel("clue")).toBe("sem pista");
    expect(missingLabel("coordinates")).toBe("sem coordenadas");
    expect(missingLabel("activity")).toBe("sem desafio");
    expect(missingLabel("staff")).toBe("sem staff");
    expect(missingLabel("name")).toBe("sem nome definitivo");
  });

  it("falls back to the raw key for a rule this map has not learned yet", () => {
    expect(missingLabel("opening_hours")).toBe("opening_hours");
  });
});
