import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import TeamLogin from "@/pages/team-login/index";
import { loginErrorMessage } from "@/pages/team-login/loginErrorMessage";

const { mockNavigate, mockSearch, mockUseTeamAuth, mockUseStaffLogin, mockToast, mockLogin } =
  vi.hoisted(() => ({
    mockNavigate: vi.fn(),
    mockSearch: vi.fn(() => ({})),
    mockUseTeamAuth: vi.fn(),
    mockUseStaffLogin: vi.fn(),
    mockToast: { success: vi.fn(), error: vi.fn() },
    mockLogin: vi.fn(),
  }));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
  useSearch: () => mockSearch(),
}));

vi.mock("@/hooks/useTeamAuth", () => ({
  default: () => mockUseTeamAuth(),
}));

vi.mock("@/hooks/useLoginLink", () => ({
  default: () => mockUseStaffLogin(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useAppToast: () => mockToast,
}));

vi.mock("@/components/qr/QRCodeScanner", () => ({
  default: ({ isOpen, onScan }: { isOpen: boolean; onScan: (data: string) => void }) =>
    isOpen ? (
      <div data-testid="qr-scanner">
        <button onClick={() => onScan("https://example.com/team-login?code=AXYZ-1234")}>
          scan-url
        </button>
        <button onClick={() => onScan("AXYZ-1234")}>scan-plain</button>
        <button onClick={() => onScan("not-a-code")}>scan-invalid</button>
      </div>
    ) : null,
}));

describe("TeamLogin page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch.mockReturnValue({});
    mockUseStaffLogin.mockReturnValue(vi.fn());
    mockUseTeamAuth.mockReturnValue({
      login: mockLogin,
      isAuthenticated: false,
      teamData: null,
      isLoggingIn: false,
      loginError: null,
    });
  });

  it("renders the login form", () => {
    render(<TeamLogin />);
    expect(screen.getByText("Login de Equipa")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("XXXX-XXXX")).toBeInTheDocument();
  });

  it('shows the "trocar equipa" heading when already authenticated', () => {
    mockUseTeamAuth.mockReturnValue({
      login: mockLogin,
      isAuthenticated: true,
      teamData: { team_name: "Team A" },
      isLoggingIn: false,
      loginError: null,
    });
    render(<TeamLogin />);
    expect(screen.getByText("Trocar Equipa")).toBeInTheDocument();
    expect(screen.getByText(/Equipa atual: Team A/)).toBeInTheDocument();
  });

  it("shows a toast error when submitting an empty code", async () => {
    const user = userEvent.setup();
    render(<TeamLogin />);
    // Button is disabled with empty code, so directly submit the form
    const form = screen.getByPlaceholderText("XXXX-XXXX").closest("form")!;
    // fireEvent submit bypasses disabled-button restriction
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.submit(form);
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalled();
    });
    void user;
  });

  it("logs in successfully and navigates", async () => {
    mockLogin.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<TeamLogin />);

    await user.type(screen.getByPlaceholderText("XXXX-XXXX"), "ABCD-1234");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("ABCD-1234");
    });
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/team-progress" });
    });
  });

  it("does not toast a failed login (the inline alert already shows it)", async () => {
    mockLogin.mockRejectedValue(new Error("Invalid access code"));
    const user = userEvent.setup();
    render(<TeamLogin />);

    await user.type(screen.getByPlaceholderText("XXXX-XXXX"), "WRONG");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalled());
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("displays a loginError message", () => {
    mockUseTeamAuth.mockReturnValue({
      login: mockLogin,
      isAuthenticated: false,
      teamData: null,
      isLoggingIn: false,
      loginError: new Error("Invalid access code"),
    });
    render(<TeamLogin />);
    expect(screen.getByRole("alert")).toHaveTextContent("Código de acesso inválido");
    expect(screen.queryByText("Invalid access code")).not.toBeInTheDocument();
  });

  it.each([
    ["Invalid access code", "Código de acesso inválido. Confirma o código e tenta outra vez."],
    [
      "Too many requests, try again later",
      "Demasiadas tentativas. Espera um pouco e tenta outra vez.",
    ],
    ["Login failed", "Não foi possível entrar. Verifica a ligação e tenta outra vez."],
  ])("loginErrorMessage maps %s to Portuguese", (raw, expected) => {
    expect(loginErrorMessage(new Error(raw))).toBe(expected);
  });

  it("pre-fills and auto-submits code from URL", async () => {
    mockSearch.mockReturnValue({ code: "AXYZ-1234" });
    mockLogin.mockResolvedValue(undefined);
    render(<TeamLogin />);

    await waitFor(
      () => {
        expect(mockLogin).toHaveBeenCalledWith("AXYZ-1234");
      },
      { timeout: 2000 },
    );
  });

  it("opens the QR scanner when the camera button is clicked", async () => {
    const user = userEvent.setup();
    render(<TeamLogin />);
    await user.click(screen.getByTitle("Ler código QR com câmara"));
    expect(screen.getByTestId("qr-scanner")).toBeInTheDocument();
  });

  it("triggers staff login on NEI account button click", async () => {
    const onStaffLogin = vi.fn();
    mockUseStaffLogin.mockReturnValue(onStaffLogin);
    const user = userEvent.setup();
    render(<TeamLogin />);
    await user.click(screen.getByRole("button", { name: /Entrar \/ Registar com conta NEI/i }));
    expect(onStaffLogin).toHaveBeenCalled();
  });

  it("extracts the code from a scanned QR URL and auto-submits", async () => {
    mockLogin.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<TeamLogin />);
    await user.click(screen.getByTitle("Ler código QR com câmara"));
    await user.click(screen.getByText("scan-url"));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("AXYZ-1234");
    });
  });

  it("accepts a plain XXXX-XXXX code scanned directly", async () => {
    mockLogin.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<TeamLogin />);
    await user.click(screen.getByTitle("Ler código QR com câmara"));
    await user.click(screen.getByText("scan-plain"));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("AXYZ-1234");
    });
  });

  it("shows an error toast for an invalid scanned QR code", async () => {
    const user = userEvent.setup();
    render(<TeamLogin />);
    await user.click(screen.getByTitle("Ler código QR com câmara"));
    await user.click(screen.getByText("scan-invalid"));

    expect(mockToast.error).toHaveBeenCalledWith("Código QR inválido. Tenta outra vez.");
  });

  it("closes the scanner after any scan result so the camera is released", async () => {
    const user = userEvent.setup();
    render(<TeamLogin />);
    await user.click(screen.getByTitle("Ler código QR com câmara"));
    expect(screen.getByTestId("qr-scanner")).toBeInTheDocument();
    await user.click(screen.getByText("scan-invalid"));

    await waitFor(() => {
      expect(screen.queryByTestId("qr-scanner")).not.toBeInTheDocument();
    });
  });
});
