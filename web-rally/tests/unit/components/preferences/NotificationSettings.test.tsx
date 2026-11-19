import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const subscribe = vi.fn();
const unsubscribe = vi.fn();
let status = "unsubscribed";
vi.mock("@/hooks/usePushNotifications", () => ({
  usePushNotifications: () => ({ status, loading: false, subscribe, unsubscribe }),
}));

const toastError = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useAppToast: () => ({ error: toastError, success: vi.fn(), info: vi.fn() }),
}));

import { NotificationSettings } from "@/components/preferences/NotificationSettings";

describe("NotificationSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    status = "unsubscribed";
  });

  it("tells the user when turning notifications on fails", async () => {
    subscribe.mockRejectedValue(new Error("offline"));
    render(<NotificationSettings />);

    fireEvent.click(screen.getByRole("switch", { name: "Ativar notificações" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
  });

  it("tells the user when turning notifications off fails", async () => {
    status = "subscribed";
    unsubscribe.mockRejectedValue(new Error("offline"));
    render(<NotificationSettings />);

    fireEvent.click(screen.getByRole("switch", { name: "Ativar notificações" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
  });
});
