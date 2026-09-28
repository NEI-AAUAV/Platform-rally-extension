import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  READINESS_ISSUE_TARGETS,
  navigationIntentForIssue,
  targetForIssue,
} from "@/pages/admin/components/readiness/readinessNavigation";
import type { ConfigurationIssueResponse } from "@/client";

const VALIDATOR_PATH = resolve(
  __dirname,
  "../../../../../../../api-rally/app/domain/event_configuration/validator.py",
);

/** Every issue code the backend validator can raise: the first positional
 * argument of each `ConfigurationIssue(` call. */
function backendIssueCodes(): Set<string> {
  const source = readFileSync(VALIDATOR_PATH, "utf8");
  const codes = [...source.matchAll(/ConfigurationIssue\(\s*"([A-Z][A-Z0-9_]+)"/g)].map(
    (m) => m[1]!,
  );
  return new Set(codes);
}

function issue(code: string): ConfigurationIssueResponse {
  return { code, severity: "error", message: "x" };
}

describe("readinessNavigation", () => {
  it("maps checkpoint-related codes to the checkpoints tab", () => {
    expect(READINESS_ISSUE_TARGETS.NO_CHECKPOINTS?.tabId).toBe("checkpoints");
    expect(READINESS_ISSUE_TARGETS.GPS_CHECKPOINT_MISSING_COORDINATES?.tabId).toBe("checkpoints");
    expect(READINESS_ISSUE_TARGETS.INCOMPLETE_PUBLISHED_CHECKPOINTS?.tabId).toBe("checkpoints");
  });

  it("maps staff coverage issues to assignment, guide issues to guide-assignment", () => {
    expect(READINESS_ISSUE_TARGETS.NO_STAFF_ASSIGNMENTS?.tabId).toBe("assignment");
    expect(READINESS_ISSUE_TARGETS.UNSTAFFED_CHECKPOINTS?.tabId).toBe("assignment");
    expect(READINESS_ISSUE_TARGETS.NO_GUIDE_ASSIGNMENTS?.tabId).toBe("guide-assignment");
    expect(READINESS_ISSUE_TARGETS.UNASSIGNED_GUIDE_TEAMS?.tabId).toBe("guide-assignment");
  });

  it("maps activity coverage issues to activities", () => {
    expect(READINESS_ISSUE_TARGETS.NO_ACTIVITIES?.tabId).toBe("activities");
    expect(READINESS_ISSUE_TARGETS.CHECKPOINTS_WITHOUT_ACTIVITIES?.tabId).toBe("activities");
  });

  it("maps NO_TEAMS to teams", () => {
    expect(READINESS_ISSUE_TARGETS.NO_TEAMS?.tabId).toBe("teams");
  });

  it("resolves a target for a known issue code", () => {
    expect(targetForIssue(issue("NO_CHECKPOINTS"))?.tabId).toBe("checkpoints");
  });

  it("returns undefined for an unmapped issue code instead of throwing", () => {
    expect(targetForIssue(issue("SOME_UNKNOWN_FUTURE_CODE"))).toBeUndefined();
  });

  describe("contract with the backend validator", () => {
    it("parses a plausible number of codes (guards against a broken regex)", () => {
      expect(backendIssueCodes().size).toBeGreaterThanOrEqual(20);
    });

    it("maps every code the backend can raise", () => {
      const unmapped = [...backendIssueCodes()].filter((code) => !READINESS_ISSUE_TARGETS[code]);
      expect(unmapped).toEqual([]);
    });

    it("has no stale mapping for a code the backend no longer raises", () => {
      const backend = backendIssueCodes();
      const stale = Object.keys(READINESS_ISSUE_TARGETS).filter((code) => !backend.has(code));
      expect(stale).toEqual([]);
    });
  });

  describe("navigationIntentForIssue", () => {
    it("carries checkpoint ids for GPS_CHECKPOINT_MISSING_COORDINATES", () => {
      expect(
        navigationIntentForIssue({
          ...issue("GPS_CHECKPOINT_MISSING_COORDINATES"),
          entity_type: "checkpoint",
          entity_ids: [4, 7, 9],
        }),
      ).toEqual({ tabId: "checkpoints", highlightIds: [4, 7, 9] });
    });

    it("carries checkpoint ids for INCOMPLETE_PUBLISHED_CHECKPOINTS", () => {
      expect(
        navigationIntentForIssue({
          ...issue("INCOMPLETE_PUBLISHED_CHECKPOINTS"),
          entity_type: "checkpoint",
          entity_ids: [2],
        }),
      ).toEqual({ tabId: "checkpoints", highlightIds: [2] });
    });

    it("does not highlight ids of a different entity type", () => {
      expect(
        navigationIntentForIssue({
          ...issue("INCOMPLETE_PUBLISHED_CHECKPOINTS"),
          entity_type: "team",
          entity_ids: [2],
        }),
      ).toEqual({ tabId: "checkpoints" });
    });

    it("jumps to the exact settings field when one has an admin-search anchor", () => {
      const intent = navigationIntentForIssue({
        ...issue("COMPASS_REQUIRES_PROXIMITY"),
        fields: ["compass_enabled", "proximity_enabled"],
      });
      expect(intent?.tabId).toBe("settings");
      expect(intent?.searchEntry?.key).toBe("compass_enabled");
      expect(intent?.searchEntry?.settingsSectionId).toBe("rota");
    });

    it("ignores fields with no anchor and falls back to the tab", () => {
      expect(
        navigationIntentForIssue({ ...issue("NO_ARRIVAL_METHOD"), fields: ["not_a_field"] }),
      ).toEqual({ tabId: "settings" });
    });

    it("returns undefined for an unmapped code", () => {
      expect(navigationIntentForIssue(issue("SOME_UNKNOWN_FUTURE_CODE"))).toBeUndefined();
    });
  });
});
