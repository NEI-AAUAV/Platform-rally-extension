import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useBadgeDefinitions,
  useBadgeDefinitionMutations,
  useBadgeAwardMutations,
} from "@/hooks/useBadgeAdmin";
import {
  listBadgeDefinitions,
  createBadgeDefinition,
  updateBadgeDefinition,
  deleteBadgeDefinition,
  uploadBadgeIcon,
  manualAwardBadge,
  revokeBadge,
} from "@/client";

vi.mock("@/client", () => ({
  listBadgeDefinitions: vi.fn(),
  createBadgeDefinition: vi.fn(),
  updateBadgeDefinition: vi.fn(),
  deleteBadgeDefinition: vi.fn(),
  uploadBadgeIcon: vi.fn(),
  manualAwardBadge: vi.fn(),
  revokeBadge: vi.fn(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper, queryClient };
}

describe("useBadgeAdmin hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useBadgeDefinitions", () => {
    it("fetches the badge catalogue", async () => {
      vi.mocked(listBadgeDefinitions).mockResolvedValueOnce({
        data: [{ id: 1, name: "Badge" }],
      } as never);
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useBadgeDefinitions(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([{ id: 1, name: "Badge" }]);
    });

    it("surfaces an error when the fetch fails", async () => {
      vi.mocked(listBadgeDefinitions).mockRejectedValueOnce(new Error("boom"));
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useBadgeDefinitions(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useBadgeDefinitionMutations", () => {
    it("creates a definition and invalidates the list", async () => {
      vi.mocked(createBadgeDefinition).mockResolvedValueOnce({ data: { id: 1 } } as never);
      const { Wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      const { result } = renderHook(() => useBadgeDefinitionMutations(), { wrapper: Wrapper });

      await act(async () => {
        await result.current.create.mutateAsync({ name: "New" } as never);
      });

      expect(createBadgeDefinition).toHaveBeenCalledWith({ body: { name: "New" } });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["badge-definitions"] });
    });

    it("updates a definition by id", async () => {
      vi.mocked(updateBadgeDefinition).mockResolvedValueOnce({ data: { id: 1 } } as never);
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useBadgeDefinitionMutations(), { wrapper: Wrapper });

      await act(async () => {
        await result.current.update.mutateAsync({ id: 1, data: { name: "Updated" } } as never);
      });

      expect(updateBadgeDefinition).toHaveBeenCalledWith({
        path: { id: 1 },
        body: { name: "Updated" },
      });
    });

    it("removes a definition by id", async () => {
      vi.mocked(deleteBadgeDefinition).mockResolvedValueOnce({ data: undefined } as never);
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useBadgeDefinitionMutations(), { wrapper: Wrapper });

      await act(async () => {
        await result.current.remove.mutateAsync(1);
      });

      expect(deleteBadgeDefinition).toHaveBeenCalledWith({ path: { id: 1 } });
    });

    it("uploads an icon for a definition", async () => {
      vi.mocked(uploadBadgeIcon).mockResolvedValueOnce({ data: { id: 1 } } as never);
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useBadgeDefinitionMutations(), { wrapper: Wrapper });
      const blob = new Blob(["x"]);

      await act(async () => {
        await result.current.uploadIcon.mutateAsync({ id: 1, image: blob });
      });

      expect(uploadBadgeIcon).toHaveBeenCalledWith({ path: { id: 1 }, body: { image: blob } });
    });

    it("propagates an error when create fails", async () => {
      vi.mocked(createBadgeDefinition).mockRejectedValueOnce(new Error("nope"));
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useBadgeDefinitionMutations(), { wrapper: Wrapper });

      await act(async () => {
        await expect(result.current.create.mutateAsync({} as never)).rejects.toThrow("nope");
      });
    });
  });

  describe("useBadgeAwardMutations", () => {
    it("awards a badge and invalidates the badges cache", async () => {
      vi.mocked(manualAwardBadge).mockResolvedValueOnce({ data: { id: 1 } } as never);
      const { Wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      const { result } = renderHook(() => useBadgeAwardMutations(), { wrapper: Wrapper });

      await act(async () => {
        await result.current.award.mutateAsync({ team_id: 1 } as never);
      });

      expect(manualAwardBadge).toHaveBeenCalledWith({ body: { team_id: 1 } });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["badges"] });
    });

    it("revokes a badge by id", async () => {
      vi.mocked(revokeBadge).mockResolvedValueOnce({ data: undefined } as never);
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useBadgeAwardMutations(), { wrapper: Wrapper });

      await act(async () => {
        await result.current.revoke.mutateAsync(42);
      });

      expect(revokeBadge).toHaveBeenCalledWith({ path: { badge_id: 42 } });
    });
  });
});
