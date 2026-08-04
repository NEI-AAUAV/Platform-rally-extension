import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useBackDismiss } from "@/hooks/useBackDismiss";

/**
 * jsdom implements pushState/back, but `back()` is async and does not always
 * emit popstate the way a browser does, so the tests drive popstate explicitly
 * where the assertion is about the dismissal, and inspect history depth where
 * the assertion is about unwinding.
 */
function firePopState(state: unknown) {
  window.dispatchEvent(new PopStateEvent("popstate", { state }));
}

describe("useBackDismiss", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", window.location.href);
  });

  it("pushes a history entry when the overlay opens", () => {
    const before = window.history.length;
    renderHook(() => useBackDismiss(true, vi.fn()));
    expect(window.history.length).toBeGreaterThan(before);
    expect(window.history.state).toMatchObject({ rallyOverlay: expect.any(Number) });
  });

  it("pushes nothing while closed", () => {
    renderHook(() => useBackDismiss(false, vi.fn()));
    expect(window.history.state).toBeNull();
  });

  it("dismisses when its own entry is popped", () => {
    const onDismiss = vi.fn();
    renderHook(() => useBackDismiss(true, onDismiss));

    act(() => firePopState(null));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("ignores a pop that leaves its own entry in place", () => {
    const onDismiss = vi.fn();
    renderHook(() => useBackDismiss(true, onDismiss));
    const ownId = (window.history.state as { rallyOverlay: number }).rallyOverlay;

    // Another overlay above this one closing: our entry is still current.
    act(() => firePopState({ rallyOverlay: ownId }));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("unwinds its entry when closed by other means", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { rerender } = renderHook(({ open }) => useBackDismiss(open, vi.fn()), {
      initialProps: { open: true },
    });

    rerender({ open: false });

    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
    back.mockRestore();
  });

  it("does not unwind when the dismissal came from back itself", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { rerender } = renderHook(({ open }) => useBackDismiss(open, vi.fn()), {
      initialProps: { open: true },
    });

    // Back popped the entry; the overlay then closes in response. Calling
    // back() again here would eat a second, unrelated history entry.
    act(() => firePopState(null));
    rerender({ open: false });

    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it("does not re-push when the callback identity changes", () => {
    const { rerender } = renderHook(({ cb }) => useBackDismiss(true, cb), {
      initialProps: { cb: vi.fn() },
    });
    const depth = window.history.length;

    // A caller passing an inline arrow re-renders with a new function every
    // time; that must not stack a history entry per render.
    rerender({ cb: vi.fn() });
    rerender({ cb: vi.fn() });

    expect(window.history.length).toBe(depth);
  });
});
