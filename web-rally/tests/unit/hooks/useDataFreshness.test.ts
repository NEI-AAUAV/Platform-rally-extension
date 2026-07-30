import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useDataFreshness from "@/hooks/useDataFreshness";

describe("useDataFreshness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when dataUpdatedAt is 0 (never fetched)", () => {
    const { result } = renderHook(() => useDataFreshness(0));
    expect(result.current).toBeNull();
  });

  it("computes the initial seconds-ago value", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const updatedAt = now - 10_000;

    const { result } = renderHook(() => useDataFreshness(updatedAt));
    expect(result.current).toBe(10);
  });

  it("updates the value on each tick", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const updatedAt = now;

    const { result } = renderHook(() => useDataFreshness(updatedAt));
    expect(result.current).toBe(0);

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(result.current).toBe(5);
  });

  it("resets to null when dataUpdatedAt becomes falsy", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const { result, rerender } = renderHook(({ ts }) => useDataFreshness(ts), {
      initialProps: { ts: now },
    });

    expect(result.current).toBe(0);

    rerender({ ts: 0 });
    expect(result.current).toBeNull();
  });

  it("clears the interval on unmount", () => {
    const clearSpy = vi.spyOn(window, "clearInterval");
    const now = Date.now();
    const { unmount } = renderHook(() => useDataFreshness(now));

    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
