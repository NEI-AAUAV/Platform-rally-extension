import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Assignment from "@/pages/assignment/index";

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const { mockUseUser, mockGetCheckpoints, mockGetStaffAssignments, mockUpdateCheckpointAssignment } =
  vi.hoisted(() => ({
    mockUseUser: vi.fn(),
    mockGetCheckpoints: vi.fn(),
    mockGetStaffAssignments: vi.fn(),
    mockUpdateCheckpointAssignment: vi.fn(),
  }));

vi.mock("@/hooks/useUser", () => ({
  default: () => mockUseUser(),
}));

vi.mock("@/hooks/useFallbackNavigation", () => ({
  default: () => "/",
}));

vi.mock("@tanstack/react-router", () => ({
  Navigate: ({ to }: { to: string }) => <div>Navigate to {to}</div>,
}));

vi.mock("@/components/shared", () => ({
  LoadingState: ({ message }: { message: string }) => <div>{message}</div>,
  PageHeader: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("@/client", () => ({
  getCheckpoints: (...args: unknown[]) => mockGetCheckpoints(...args),
  getStaffAssignments: (...args: unknown[]) => mockGetStaffAssignments(...args),
  updateCheckpointAssignment: (...args: unknown[]) => mockUpdateCheckpointAssignment(...args),
}));

vi.mock("@/pages/assignment/components", async () => {
  const actual = await vi.importActual<typeof import("@/pages/assignment/components")>(
    "@/pages/assignment/components",
  );
  return {
    ...actual,
    StaffAssignmentList: ({
      assignments,
      onUpdateAssignment,
    }: {
      assignments: { user_id: number }[];
      onUpdateAssignment: (userId: number, checkpointId: number) => void;
    }) =>
      assignments.length === 0 ? (
        <div>Nenhuma atribuição de staff encontrada.</div>
      ) : (
        <div>
          {assignments.map((a) => (
            <div key={a.user_id}>
              {a.user_id === 5 && "Bob"}
              <button onClick={() => onUpdateAssignment(a.user_id, 0)}>Remover atribuição</button>
            </div>
          ))}
        </div>
      ),
  };
});

describe("Assignment index", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCheckpoints.mockResolvedValue({ data: [] });
    mockGetStaffAssignments.mockResolvedValue({
      data: { items: [], total: 0, page: 1, page_size: 20 },
    });
  });

  it("shows loading state", () => {
    mockUseUser.mockReturnValue({ isLoading: true, isRallyAdmin: false });
    renderWithClient(<Assignment />);
    expect(screen.getByText("Carregando...")).toBeInTheDocument();
  });

  it("redirects non-admin users when not embedded", () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: false });
    renderWithClient(<Assignment />);
    expect(screen.getByText("Navigate to /")).toBeInTheDocument();
  });

  it("renders page header and list for admin", async () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true });
    mockGetStaffAssignments.mockResolvedValue({
      data: {
        items: [
          {
            id: 1,
            user_id: 5,
            user_name: "Bob",
            user_email: null,
            checkpoint_id: null,
            checkpoint_name: null,
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
      },
    });
    renderWithClient(<Assignment />);
    expect(screen.getByText("Atribuição de postos")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });
  });

  it("renders without page header when embedded and allows non-admins", () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: false });
    renderWithClient(<Assignment embedded />);
    expect(screen.queryByText("Atribuição de postos")).not.toBeInTheDocument();
    expect(screen.getByText("Nenhuma atribuição de staff encontrada.")).toBeInTheDocument();
  });

  it("triggers mutation and refetches assignments on successful update", async () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true });
    mockGetStaffAssignments.mockResolvedValue({
      data: {
        items: [
          {
            id: 1,
            user_id: 5,
            user_name: "Bob",
            user_email: null,
            checkpoint_id: null,
            checkpoint_name: null,
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
      },
    });
    mockUpdateCheckpointAssignment.mockResolvedValue({ data: { id: 1 } });

    renderWithClient(<Assignment />);

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    const removeButton = screen.getByText("Remover atribuição");
    const { default: userEvent } = await import("@testing-library/user-event");
    await userEvent.setup().click(removeButton);

    await waitFor(() => {
      expect(mockUpdateCheckpointAssignment).toHaveBeenCalledWith({
        path: { user_id: 5 },
        body: { checkpoint_id: null },
      });
    });

    await waitFor(() => {
      expect(mockGetStaffAssignments).toHaveBeenCalledTimes(2);
    });
  });
});
