import type { ConfigurationIssueResponse } from "@/client";
import type { AdminTabId } from "@/router/routes";

export interface ReadinessTarget {
  tabId: AdminTabId;
}

/**
 * Maps a backend ConfigurationIssue.code to the admin tab that fixes it.
 * Keep in sync with the literal `code=`/positional codes raised by
 * api-rally/app/domain/event_configuration/validator.py — codes not listed
 * here simply render without an action link, never crash.
 */
export const READINESS_ISSUE_TARGETS: Readonly<Record<string, ReadinessTarget>> = {
  COMPASS_REQUIRES_PROXIMITY: { tabId: "settings" },
  GUIDE_ACTIVE_REQUIRES_GUIDE_ENABLED: { tabId: "settings" },
  REQUIRED_CAPABILITY_DISABLED: { tabId: "settings" },
  FORBIDDEN_CAPABILITY_ENABLED: { tabId: "settings" },
  ROTATION_SCHEDULE_MISSING: { tabId: "events" },
  ROTATION_SCHEDULE_INVALID: { tabId: "events" },
  ROTATION_SCHEDULE_STALE: { tabId: "events" },
  GPS_CHECKPOINT_MISSING_COORDINATES: { tabId: "checkpoints" },
  NO_ARRIVAL_METHOD: { tabId: "settings" },
  NO_CHECKPOINTS: { tabId: "checkpoints" },
  NO_ACTIVITIES: { tabId: "activities" },
  NO_STAFF_ASSIGNMENTS: { tabId: "assignment" },
  NO_GUIDE_ASSIGNMENTS: { tabId: "guide-assignment" },
  NO_RECOVERY_PATH: { tabId: "settings" },
  QR_UNAVAILABLE_ON_PLATFORM: { tabId: "settings" },
  NO_ROUTE_STAGES: { tabId: "checkpoints" },
  LEG_TIME_SCORING_ZERO_POINTS: { tabId: "scoring" },
  // Phase C additions
  UNASSIGNED_GUIDE_TEAMS: { tabId: "guide-assignment" },
  UNSTAFFED_CHECKPOINTS: { tabId: "assignment" },
  INCOMPLETE_PUBLISHED_CHECKPOINTS: { tabId: "checkpoints" },
  NO_TEAMS: { tabId: "teams" },
  EVENT_DATES_INVALID: { tabId: "events" },
  EVENT_START_TIME_MISSING: { tabId: "events" },
};

/** Resolves the admin destination for an issue, or undefined if unmapped. */
export function targetForIssue(issue: ConfigurationIssueResponse): ReadinessTarget | undefined {
  return READINESS_ISSUE_TARGETS[issue.code];
}
