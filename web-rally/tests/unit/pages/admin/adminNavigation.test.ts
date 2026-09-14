import { describe, it, expect } from "vitest";
import {
  ADMIN_NAVIGATION,
  ADMIN_ITEMS,
  ADMIN_ITEM_BY_ID,
  ADMIN_TAB_LABELS,
  groupForTab,
} from "@/pages/admin/adminNavigation";

const EXPECTED_TAB_IDS = [
  "dashboard",
  "teams",
  "checkpoints",
  "activities",
  "members",
  "assignment",
  "guide-assignment",
  "evaluation",
  "versus",
  "judging",
  "badges",
  "scoring",
  "branding",
  "events",
  "notifications",
  "settings",
  "audit",
  "metrics",
];

describe("adminNavigation", () => {
  it("contains every admin tab id exactly once", () => {
    const ids = ADMIN_ITEMS.map((item) => item.id);
    expect(ids.length).toBe(EXPECTED_TAB_IDS.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set(EXPECTED_TAB_IDS));
  });

  it("has non-empty, uniquely identified groups", () => {
    const groupIds = ADMIN_NAVIGATION.map((g) => g.id);
    expect(new Set(groupIds).size).toBe(groupIds.length);
    for (const group of ADMIN_NAVIGATION) {
      expect(group.items.length).toBeGreaterThan(0);
      expect(group.label.length).toBeGreaterThan(0);
    }
  });

  it("keeps the dashboard tab in the overview group, easy to find", () => {
    expect(groupForTab("dashboard")?.id).toBe("overview");
  });

  it("derives ADMIN_ITEM_BY_ID covering every item exactly once", () => {
    expect(ADMIN_ITEM_BY_ID.size).toBe(ADMIN_ITEMS.length);
    for (const item of ADMIN_ITEMS) {
      expect(ADMIN_ITEM_BY_ID.get(item.id)).toBe(item);
    }
  });

  it("derives ADMIN_TAB_LABELS matching ADMIN_ITEMS labels", () => {
    for (const item of ADMIN_ITEMS) {
      expect(ADMIN_TAB_LABELS[item.id]).toBe(item.label);
    }
  });
});
