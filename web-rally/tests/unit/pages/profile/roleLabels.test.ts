import { describe, expect, it } from "vitest";
import { roleLabels } from "@/pages/profile/roleLabels";

describe("roleLabels", () => {
  it("maps known rally groups to Portuguese labels", () => {
    expect(roleLabels(["rally-participant", "manager-rally"])).toEqual(["Participante", "Gestor"]);
  });

  it("drops unknown groups instead of showing raw ids", () => {
    expect(roleLabels(["some-other-group"])).toEqual([]);
  });
});
