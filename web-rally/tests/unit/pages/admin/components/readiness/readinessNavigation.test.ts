import { describe, it, expect } from "vitest";
import {
  READINESS_ISSUE_TARGETS,
  targetForIssue,
} from "@/pages/admin/components/readiness/readinessNavigation";
import type { ConfigurationIssueResponse } from "@/client";

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
});
