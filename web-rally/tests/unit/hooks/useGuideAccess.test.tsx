/**
 * Test suite for useGuideAccess — the single source of truth for
 * guide-mode visibility (role × feature-flag matrix).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import useGuideAccess from "@/hooks/useGuideAccess";
import { useUserStore } from "@/stores/useUserStore";
import useRallySettings from "@/hooks/useRallySettings";

vi.mock("@/hooks/useRallySettings", () => ({
  default: vi.fn(),
}));

type StoreState = { scopes?: string[]; sessionLoading: boolean };

function setStore(state: StoreState) {
  // The hook only selects scopes/sessionLoading; a partial store suffices.
  vi.mocked(useUserStore).mockImplementation(((selector: (s: StoreState) => unknown) =>
    selector(state)) as unknown as typeof useUserStore);
}

vi.mock("@/stores/useUserStore", () => ({
  useUserStore: vi.fn(),
}));

function setSettings(settings: Record<string, unknown> | undefined, isLoading = false) {
  vi.mocked(useRallySettings).mockReturnValue({
    settings,
    isLoading,
  } as ReturnType<typeof useRallySettings>);
}

const GUIDE_MODE_ON = {
  effective_capabilities: { guide_mode: true },
};

describe("useGuideAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["rally-guide", true],
    ["rally-staff", true],
    ["admin", true],
    ["manager-rally", true],
    ["other-scope", false],
  ])("role gate: scope %s → hasGuideRole=%s", (scope, expected) => {
    setStore({ scopes: [scope], sessionLoading: false });
    setSettings(GUIDE_MODE_ON);

    const { result } = renderHook(() => useGuideAccess());
    expect(result.current.hasGuideRole).toBe(expected);
    expect(result.current.isAllowed).toBe(expected);
  });

  it("denies when user has no scopes loaded", () => {
    setStore({ scopes: undefined, sessionLoading: false });
    setSettings(GUIDE_MODE_ON);

    const { result } = renderHook(() => useGuideAccess());
    expect(result.current.hasGuideRole).toBe(false);
    expect(result.current.isAllowed).toBe(false);
  });

  it("hides feature when guide mode capability is false", () => {
    setStore({ scopes: ["rally-guide"], sessionLoading: false });
    setSettings({ effective_capabilities: { guide_mode: false } });

    const { result } = renderHook(() => useGuideAccess());
    expect(result.current.showGuideFeature).toBe(false);
    expect(result.current.isAllowed).toBe(false);
  });

  it("shows feature when guide mode capability is true", () => {
    setStore({ scopes: ["rally-guide"], sessionLoading: false });
    setSettings(GUIDE_MODE_ON);

    const { result } = renderHook(() => useGuideAccess());
    expect(result.current.showGuideFeature).toBe(true);
    expect(result.current.isAllowed).toBe(true);
  });

  it("feature without role is not enough", () => {
    setStore({ scopes: [], sessionLoading: false });
    setSettings(GUIDE_MODE_ON);

    const { result } = renderHook(() => useGuideAccess());
    expect(result.current.showGuideFeature).toBe(true);
    expect(result.current.isAllowed).toBe(false);
  });

  it("reports loading while session or settings load", () => {
    setStore({ scopes: undefined, sessionLoading: true });
    setSettings(undefined, false);
    expect(renderHook(() => useGuideAccess()).result.current.isLoading).toBe(true);

    setStore({ scopes: [], sessionLoading: false });
    setSettings(undefined, true);
    expect(renderHook(() => useGuideAccess()).result.current.isLoading).toBe(true);
  });

  it("denies safely while settings are missing", () => {
    setStore({ scopes: ["rally-guide"], sessionLoading: false });
    setSettings(undefined, false);

    const { result } = renderHook(() => useGuideAccess());
    expect(result.current.isAllowed).toBe(false);
  });
});
