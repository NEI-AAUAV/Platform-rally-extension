/**
 * AuditLogTab was at 8.92% statements / 0% branches. The audit log is the
 * record used to settle disputes about who changed what mid-rally, so the
 * parts worth pinning down are the ones that could quietly show the wrong
 * rows: the ALL-sentinel to undefined mapping in the query, date filters, and
 * pagination bounds.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { mockListAuditLog } = vi.hoisted(() => ({ mockListAuditLog: vi.fn() }));

vi.mock("@/client", () => ({
  listAuditLog: (...args: unknown[]) => mockListAuditLog(...args),
}));

import AuditLogTab from "@/pages/admin/components/audit/AuditLogTab";

const entry = (over: Record<string, unknown> = {}) => ({
  id: 1,
  action: "rally_settings.updated",
  target_type: "rally_settings",
  target_id: 3,
  actor_name: "Ana",
  actor_kind: "staff",
  note: null,
  changes: {},
  created_at: "2026-08-16T10:00:00Z",
  ...over,
});

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuditLogTab />
    </QueryClientProvider>,
  );
}

/** The most recent query object the component sent to the endpoint. */
const lastQuery = () =>
  (mockListAuditLog.mock.calls.at(-1)?.[0] as { query: Record<string, unknown> }).query;

describe("AuditLogTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListAuditLog.mockResolvedValue({ data: [entry()] });
  });

  it("renders an entry with its actor, target and action", async () => {
    renderTab();

    expect(await screen.findByText("rally_settings.updated")).toBeInTheDocument();
    expect(screen.getByText("rally_settings#3")).toBeInTheDocument();
    expect(screen.getByText(/por Ana \(Staff\)/)).toBeInTheDocument();
  });

  it("sends no action or target filter while both are on the 'all' sentinel", async () => {
    renderTab();

    // Radix maps "" to "clear", so the component uses an ALL sentinel — it must
    // be translated back to undefined or the endpoint would filter on "all".
    await waitFor(() => expect(mockListAuditLog).toHaveBeenCalled());
    expect(lastQuery()).toMatchObject({ action: undefined, target_type: undefined });
    expect(lastQuery()).toMatchObject({ limit: 50, offset: 0 });
  });

  it("falls back to 'desconhecido' when the entry has no actor name", async () => {
    mockListAuditLog.mockResolvedValue({
      data: [entry({ actor_name: null, actor_kind: null })],
    });

    renderTab();

    expect(await screen.findByText(/por desconhecido/)).toBeInTheDocument();
  });

  it("renders a before/after diff for each changed field", async () => {
    mockListAuditLog.mockResolvedValue({
      data: [entry({ changes: { max_teams: { before: 10, after: 20 } } })],
    });

    renderTab();

    expect(await screen.findByText("max_teams:")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("renders an em dash for a field that had no previous value", async () => {
    mockListAuditLog.mockResolvedValue({
      data: [entry({ changes: { note: { before: null, after: "hello" } } })],
    });

    renderTab();

    expect(await screen.findByText("—")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("shows an empty-state rather than a blank panel when nothing matches", async () => {
    mockListAuditLog.mockResolvedValue({ data: [] });

    renderTab();

    expect(await screen.findByText("Sem registos para os filtros atuais.")).toBeInTheDocument();
  });

  it("shows an error message when the endpoint fails", async () => {
    mockListAuditLog.mockRejectedValue(new Error("500"));

    renderTab();

    expect(await screen.findByText("Não foi possível carregar a auditoria.")).toBeInTheDocument();
  });

  it("converts the 'since' filter to an ISO timestamp and resets to the first page", async () => {
    renderTab();
    await screen.findByText("rally_settings.updated");

    fireEvent.change(screen.getByLabelText("Desde"), {
      target: { value: "2026-08-01T09:00" },
    });

    await waitFor(() => expect(lastQuery().since).toBe(new Date("2026-08-01T09:00").toISOString()));
    expect(lastQuery().offset).toBe(0);
  });

  it("disables paging back on the first page", async () => {
    renderTab();
    await screen.findByText("rally_settings.updated");

    expect(screen.getByRole("button", { name: /Anterior/ })).toBeDisabled();
  });

  it("disables paging forward on a short (final) page", async () => {
    renderTab();
    await screen.findByText("rally_settings.updated");

    // One row is fewer than PAGE_SIZE, so there is no next page to reach.
    expect(screen.getByRole("button", { name: /Seguinte/ })).toBeDisabled();
  });

  it("advances the offset by a page when a full page is returned", async () => {
    mockListAuditLog.mockResolvedValue({
      data: Array.from({ length: 50 }, (_, i) => entry({ id: i + 1 })),
    });

    renderTab();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Seguinte/ })).not.toBeDisabled(),
    );

    fireEvent.click(screen.getByRole("button", { name: /Seguinte/ }));

    await waitFor(() => expect(lastQuery().offset).toBe(50));
  });
});
