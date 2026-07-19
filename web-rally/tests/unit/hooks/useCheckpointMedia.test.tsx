import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useCheckpointMedia } from "@/hooks/useCheckpointMedia";
import { listCheckpointMedia } from "@/client";

vi.mock("@/client", () => ({
  listCheckpointMedia: vi.fn(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useCheckpointMedia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("groups and orders photos and fun facts", async () => {
    vi.mocked(listCheckpointMedia).mockResolvedValueOnce({
      data: [
        { id: 1, kind: "photo", image_url: "a.jpg", order: 2 },
        { id: 2, kind: "photo", image_url: "b.jpg", order: 1 },
        { id: 3, kind: "fun_fact", caption: "Fact 2", order: 2 },
        { id: 4, kind: "fun_fact", caption: "Fact 1", order: 1 },
      ],
    } as never);

    const { result } = renderHook(() => useCheckpointMedia(1), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.photos.map((p) => p.id)).toEqual([2, 1]);
    expect(result.current.funFacts.map((f) => f.id)).toEqual([4, 3]);
  });

  it("filters out photos without an image_url and fun facts without a caption", async () => {
    vi.mocked(listCheckpointMedia).mockResolvedValueOnce({
      data: [
        { id: 1, kind: "photo", image_url: null, order: 1 },
        { id: 2, kind: "fun_fact", caption: null, order: 1 },
      ],
    } as never);

    const { result } = renderHook(() => useCheckpointMedia(1), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.photos).toHaveLength(0);
    expect(result.current.funFacts).toHaveLength(0);
  });

  it("defaults to empty arrays while loading", () => {
    vi.mocked(listCheckpointMedia).mockReturnValueOnce(new Promise(() => {}) as any);
    const { result } = renderHook(() => useCheckpointMedia(1), { wrapper: createWrapper() });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.photos).toEqual([]);
    expect(result.current.funFacts).toEqual([]);
  });

  it("does not fetch when disabled", () => {
    renderHook(() => useCheckpointMedia(1, false), { wrapper: createWrapper() });
    expect(listCheckpointMedia).not.toHaveBeenCalled();
  });

  it("treats missing order as 0 when sorting", async () => {
    vi.mocked(listCheckpointMedia).mockResolvedValueOnce({
      data: [
        { id: 1, kind: "photo", image_url: "a.jpg" },
        { id: 2, kind: "photo", image_url: "b.jpg", order: -1 },
      ],
    } as never);

    const { result } = renderHook(() => useCheckpointMedia(1), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.photos.map((p) => p.id)).toEqual([2, 1]);
  });

  it("passes the checkpoint id through to the API call", async () => {
    vi.mocked(listCheckpointMedia).mockResolvedValueOnce({ data: [] } as never);
    renderHook(() => useCheckpointMedia(99), { wrapper: createWrapper() });

    await waitFor(() =>
      expect(listCheckpointMedia).toHaveBeenCalledWith({ path: { checkpoint_id: 99 } }),
    );
  });
});
