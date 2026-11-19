import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const subscribe = vi.fn();
let status = "unsubscribed";
vi.mock("@/hooks/usePushNotifications", () => ({
  usePushNotifications: () => ({ status, loading: false, subscribe, unsubscribe: vi.fn() }),
}));

let iosTab = false;
vi.mock("@/lib/pushSubscription", () => ({
  isIosBrowserTab: () => iosTab,
}));

const toastError = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useAppToast: () => ({ error: toastError, success: vi.fn(), info: vi.fn() }),
}));

import { TeamNotificationPrompt } from "@/components/preferences/TeamNotificationPrompt";

describe("TeamNotificationPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    status = "unsubscribed";
    iosTab = false;
  });

  it("offers to turn notifications on when this device is not subscribed", () => {
    render(<TeamNotificationPrompt />);
    expect(screen.getByRole("button", { name: "Ativar" })).toBeTruthy();
  });

  it.each(["subscribed", "unconfigured", "denied"])("stays hidden when %s", (s) => {
    status = s;
    const { container } = render(<TeamNotificationPrompt />);
    expect(container.innerHTML).toBe("");
  });

  it("subscribes when the team taps Ativar", async () => {
    subscribe.mockResolvedValue(undefined);
    render(<TeamNotificationPrompt />);

    fireEvent.click(screen.getByRole("button", { name: "Ativar" }));

    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
  });

  it("shows an error when subscribing fails", async () => {
    subscribe.mockRejectedValue(new Error("offline"));
    render(<TeamNotificationPrompt />);

    fireEvent.click(screen.getByRole("button", { name: "Ativar" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
  });

  it("remembers 'Agora não' on this device", () => {
    const { unmount } = render(<TeamNotificationPrompt />);
    fireEvent.click(screen.getByRole("button", { name: "Agora não" }));
    expect(screen.queryByRole("button", { name: "Ativar" })).toBeNull();
    unmount();

    const { container } = render(<TeamNotificationPrompt />);
    expect(container.innerHTML).toBe("");
  });

  it("explains the Home Screen install in an iPhone browser tab", () => {
    status = "unsupported";
    iosTab = true;
    render(<TeamNotificationPrompt />);
    expect(screen.getByText(/ecrã principal/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ativar" })).toBeNull();
  });

  it("stays hidden where push is unsupported for other reasons", () => {
    status = "unsupported";
    const { container } = render(<TeamNotificationPrompt />);
    expect(container.innerHTML).toBe("");
  });
});
