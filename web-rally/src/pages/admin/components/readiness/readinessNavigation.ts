import type { ConfigurationIssueResponse } from "@/client";
import type { AdminTabId } from "@/router/routes";
import { ADMIN_SEARCH_INDEX, type AdminSearchEntry } from "@/lib/adminSearchIndex";

export interface ReadinessTarget {
  tabId: AdminTabId;
  /**
   * Set when the destination tab can highlight the issue's `entity_ids`.
   * Only honoured when the issue's `entity_type` matches, so a stray id list
   * of another kind never highlights the wrong rows.
   */
  highlightEntityType?: "checkpoint";
}

/**
 * Where a "Corrigir →" click should take the admin. Carries the backend's
 * issue metadata through instead of collapsing it into a bare tab:
 * - `highlightIds`: affected entities the destination tab should mark;
 * - `searchEntry`: an existing admin-search anchor for one of the issue's
 *   `fields`, so the destination scrolls to and flashes that exact field.
 */
export interface ReadinessNavigationIntent {
  tabId: AdminTabId;
  highlightIds?: number[];
  searchEntry?: AdminSearchEntry;
}

/**
 * Maps a backend ConfigurationIssue.code to the admin tab that fixes it.
 * Every code raised by api-rally/app/domain/event_configuration/validator.py
 * must be listed — a contract test parses the validator and fails on drift.
 * An unknown code at runtime still renders, just without an action link.
 */
export const READINESS_ISSUE_TARGETS: Readonly<Record<string, ReadinessTarget>> = {
  COMPASS_REQUIRES_PROXIMITY: { tabId: "settings" },
  GUIDE_ACTIVE_REQUIRES_GUIDE_ENABLED: { tabId: "settings" },
  REQUIRED_CAPABILITY_DISABLED: { tabId: "settings" },
  FORBIDDEN_CAPABILITY_ENABLED: { tabId: "settings" },
  ROTATION_SCHEDULE_MISSING: { tabId: "events" },
  ROTATION_SCHEDULE_INVALID: { tabId: "events" },
  ROTATION_SCHEDULE_STALE: { tabId: "events" },
  GPS_CHECKPOINT_MISSING_COORDINATES: { tabId: "checkpoints", highlightEntityType: "checkpoint" },
  NO_ARRIVAL_METHOD: { tabId: "settings" },
  NO_CHECKPOINTS: { tabId: "checkpoints" },
  NO_ACTIVITIES: { tabId: "activities" },
  CHECKPOINTS_WITHOUT_ACTIVITIES: { tabId: "activities" },
  NO_STAFF_ASSIGNMENTS: { tabId: "assignment" },
  NO_GUIDE_ASSIGNMENTS: { tabId: "guide-assignment" },
  NO_RECOVERY_PATH: { tabId: "settings" },
  QR_UNAVAILABLE_ON_PLATFORM: { tabId: "settings" },
  NO_ROUTE_STAGES: { tabId: "checkpoints" },
  LEG_TIME_SCORING_ZERO_POINTS: { tabId: "scoring" },
  UNASSIGNED_GUIDE_TEAMS: { tabId: "guide-assignment" },
  UNSTAFFED_CHECKPOINTS: { tabId: "assignment" },
  INCOMPLETE_PUBLISHED_CHECKPOINTS: { tabId: "checkpoints", highlightEntityType: "checkpoint" },
  NO_TEAMS: { tabId: "teams" },
  EVENT_DATES_INVALID: { tabId: "events" },
  EVENT_START_TIME_MISSING: { tabId: "events" },
};

/** Resolves the admin destination for an issue, or undefined if unmapped. */
export function targetForIssue(issue: ConfigurationIssueResponse): ReadinessTarget | undefined {
  return READINESS_ISSUE_TARGETS[issue.code];
}

const SEARCH_ENTRY_BY_KEY = new Map(
  ADMIN_SEARCH_INDEX.filter((entry) => !entry.tabOnly).map((entry) => [entry.key, entry]),
);

/** Resolves the full navigation intent for an issue, or undefined if unmapped. */
export function navigationIntentForIssue(
  issue: ConfigurationIssueResponse,
): ReadinessNavigationIntent | undefined {
  const target = targetForIssue(issue);
  if (!target) return undefined;

  const intent: ReadinessNavigationIntent = { tabId: target.tabId };

  const ids = (issue.entity_ids ?? []).filter((id) => Number.isInteger(id) && id > 0);
  if (
    target.highlightEntityType &&
    issue.entity_type === target.highlightEntityType &&
    ids.length
  ) {
    intent.highlightIds = ids;
  }

  // Only a field whose anchor lives on the target tab — a settings field
  // must not pull an "events" issue over to the settings tab.
  const searchEntry = (issue.fields ?? [])
    .map((field) => SEARCH_ENTRY_BY_KEY.get(field))
    .find((entry) => entry?.tabId === target.tabId);
  if (searchEntry) intent.searchEntry = searchEntry;

  return intent;
}
