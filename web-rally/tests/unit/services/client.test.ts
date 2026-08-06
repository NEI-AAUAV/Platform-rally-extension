/**
 * Test suite for client.ts — team-token refresh and the unauthorized handler
 * hook. Application requests go through the generated OpenAPI client; this
 * module only owns the explicit team-token refresh (via fetch) and the staff
 * 401 handler. Staff auth is owned by react-oidc-context.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/stores/useUserStore", () => ({
  useUserStore: {
    getState: () => ({ token: null as string | null }),
  },
}));

vi.mock("@/config", () => ({
  default: {
    BASE_URL: "http://localhost:8000",
  },
}));

const loggerMock = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: loggerMock }));

describe("client.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loggerMock.warn.mockClear();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  describe("refreshTeamToken", () => {
    it("refreshes via the team-auth endpoint when a team token exists", async () => {
      localStorage.setItem("rally_team_token", "team-jwt");

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "new-team-token" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const { refreshTeamToken } = await import("@/services/client");
      const result = await refreshTeamToken();

      expect(result).toBe("new-team-token");
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/rally/v1/team-auth/refresh",
        expect.objectContaining({
          method: "POST",
          headers: { Authorization: "Bearer team-jwt" },
        }),
      );
      expect(localStorage.getItem("rally_team_token")).toBe("new-team-token");
    });

    it("clears team tokens when the refresh fails", async () => {
      localStorage.setItem("rally_team_token", "expired-team-jwt");
      localStorage.setItem("rally_team_data", '{"team_id":1}');

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

      const { refreshTeamToken } = await import("@/services/client");
      const result = await refreshTeamToken();

      expect(result).toBeUndefined();
      expect(localStorage.getItem("rally_team_token")).toBeNull();
      expect(localStorage.getItem("rally_team_data")).toBeNull();
    });

    it("keeps the team session on a 500 (server hiccup, not a dead token)", async () => {
      localStorage.setItem("rally_team_token", "still-good-jwt");
      localStorage.setItem("rally_team_data", '{"team_id":1,"team_name":"T"}');

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

      const { refreshTeamToken } = await import("@/services/client");
      const result = await refreshTeamToken();

      expect(result).toBeUndefined();
      expect(localStorage.getItem("rally_team_token")).toBe("still-good-jwt");
      expect(localStorage.getItem("rally_team_data")).toBe('{"team_id":1,"team_name":"T"}');
    });

    it("keeps the team session on a network error (offline/timeout)", async () => {
      localStorage.setItem("rally_team_token", "still-good-jwt");
      localStorage.setItem("rally_team_data", '{"team_id":1,"team_name":"T"}');

      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
      );

      const { refreshTeamToken } = await import("@/services/client");
      const result = await refreshTeamToken();

      expect(result).toBeUndefined();
      expect(localStorage.getItem("rally_team_token")).toBe("still-good-jwt");
      expect(localStorage.getItem("rally_team_data")).toBe('{"team_id":1,"team_name":"T"}');
    });

    it("returns undefined when there is no team token", async () => {
      const { refreshTeamToken } = await import("@/services/client");
      const result = await refreshTeamToken();
      expect(result).toBeUndefined();
    });

    it("logs a warning with the status when refresh fails", async () => {
      localStorage.setItem("rally_team_token", "expired-team-jwt");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

      const { refreshTeamToken } = await import("@/services/client");
      await refreshTeamToken();

      expect(loggerMock.warn).toHaveBeenCalledWith("Team token refresh failed", { status: 401 });
    });
  });

  describe("setOnUnauthorized / notifyUnauthorized", () => {
    it("invokes the registered handler on notify", async () => {
      const { setOnUnauthorized, notifyUnauthorized } = await import("@/services/client");
      const handler = vi.fn();
      setOnUnauthorized(handler);
      notifyUnauthorized();
      expect(handler).toHaveBeenCalledOnce();
      setOnUnauthorized(null);
      notifyUnauthorized();
      expect(handler).toHaveBeenCalledOnce();
    });
  });
});
