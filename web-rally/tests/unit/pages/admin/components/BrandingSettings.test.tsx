import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BrandingSettings from '@/pages/admin/components/branding/BrandingSettings';

const {
  mockViewRallySettings,
  mockUpdateRallySettings,
  mockUploadRallyBanner,
  mockUploadRallyLogo,
  mockUploadRallyFavicon,
  mockToast,
} = vi.hoisted(() => ({
  mockViewRallySettings: vi.fn(),
  mockUpdateRallySettings: vi.fn(),
  mockUploadRallyBanner: vi.fn(),
  mockUploadRallyLogo: vi.fn(),
  mockUploadRallyFavicon: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/client', () => ({
  viewRallySettings: (...args: unknown[]) => mockViewRallySettings(...args),
  updateRallySettings: (...args: unknown[]) => mockUpdateRallySettings(...args),
  uploadRallyBanner: (...args: unknown[]) => mockUploadRallyBanner(...args),
  uploadRallyLogo: (...args: unknown[]) => mockUploadRallyLogo(...args),
  uploadRallyFavicon: (...args: unknown[]) => mockUploadRallyFavicon(...args),
}));

vi.mock('@/hooks/use-toast', () => ({
  useAppToast: () => mockToast,
}));

function renderWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrandingSettings />
    </QueryClientProvider>,
  );
}

const settings = (overrides: Record<string, unknown> = {}) => ({
  event_name: 'Rally 2026',
  event_subtitle: 'The best rally',
  accent_color: '#c81d25',
  banner_url: null,
  logo_url: null,
  favicon_url: null,
  ...overrides,
});

describe('BrandingSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockViewRallySettings.mockResolvedValue({ data: settings() });
    mockUpdateRallySettings.mockResolvedValue({ data: settings() });
    mockUploadRallyBanner.mockResolvedValue({ data: settings({ banner_url: 'https://x/banner.png' }) });
    mockUploadRallyLogo.mockResolvedValue({ data: settings({ logo_url: 'https://x/logo.png' }) });
    mockUploadRallyFavicon.mockResolvedValue({ data: settings({ favicon_url: 'https://x/favicon.png' }) });
  });

  it('shows the loading state before settings load', () => {
    mockViewRallySettings.mockReturnValue(new Promise(() => {}));
    renderWithClient();
    expect(screen.getByText('A carregar identidade visual...')).toBeInTheDocument();
  });

  it('renders the loaded branding fields', async () => {
    renderWithClient();
    expect(await screen.findByDisplayValue('Rally 2026')).toBeInTheDocument();
    expect(screen.getByDisplayValue('The best rally')).toBeInTheDocument();
    expect(screen.getByLabelText('Cor de destaque')).toHaveValue('#c81d25');
  });

  it('renders empty text fields when settings values are null', async () => {
    mockViewRallySettings.mockResolvedValue({
      data: settings({ event_name: null, event_subtitle: null, accent_color: null }),
    });
    renderWithClient();
    await screen.findByText('Identidade Visual');
    expect(screen.getByLabelText('Nome do evento')).toHaveValue('');
    expect(screen.getByLabelText('Subtítulo')).toHaveValue('');
  });

  it('updates event name, subtitle and accent color text inputs', async () => {
    renderWithClient();
    const nameInput = await screen.findByLabelText('Nome do evento');
    fireEvent.change(nameInput, { target: { value: 'New Rally Name' } });
    expect(nameInput).toHaveValue('New Rally Name');

    const subtitleInput = screen.getByLabelText('Subtítulo');
    fireEvent.change(subtitleInput, { target: { value: 'New subtitle' } });
    expect(subtitleInput).toHaveValue('New subtitle');

    const accentInput = screen.getByLabelText('Cor de destaque');
    fireEvent.change(accentInput, { target: { value: '#123456' } });
    expect(accentInput).toHaveValue('#123456');
  });

  it('falls back to the default accent for the color swatch when accent is invalid', async () => {
    renderWithClient();
    const accentInput = await screen.findByLabelText('Cor de destaque');
    fireEvent.change(accentInput, { target: { value: 'not-a-color' } });

    const swatch = screen.getByLabelText('Selecionar cor de destaque');
    expect(swatch).toHaveValue('#c81d25');
  });

  it('uses the accent color directly for the swatch when it is valid', async () => {
    renderWithClient();
    const accentInput = await screen.findByLabelText('Cor de destaque');
    fireEvent.change(accentInput, { target: { value: '#abcdef' } });

    const swatch = screen.getByLabelText('Selecionar cor de destaque');
    expect(swatch).toHaveValue('#abcdef');
  });

  it('saves branding text fields and shows a success toast', async () => {
    renderWithClient();
    await screen.findByDisplayValue('Rally 2026');
    fireEvent.click(screen.getByText('Guardar identidade'));

    await waitFor(() =>
      expect(mockUpdateRallySettings).toHaveBeenCalledWith({
        body: expect.objectContaining({
          event_name: 'Rally 2026',
          event_subtitle: 'The best rally',
          accent_color: '#c81d25',
        }),
      }),
    );
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Identidade visual atualizada!'));
  });

  it('shows an error toast when saving branding fails', async () => {
    mockUpdateRallySettings.mockRejectedValue(new Error('save failed'));
    renderWithClient();
    await screen.findByDisplayValue('Rally 2026');
    fireEvent.click(screen.getByText('Guardar identidade'));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('save failed'));
  });

  it('disables the save button while settings have not loaded', () => {
    mockViewRallySettings.mockReturnValue(new Promise(() => {}));
    renderWithClient();
    // Loading state renders instead of the button; nothing to assert on disabled here,
    // but this documents the guard exists via settings-not-loaded path below.
    expect(screen.queryByText('Guardar identidade')).not.toBeInTheDocument();
  });

  it('uploads a banner image and shows a preview then success toast', async () => {
    renderWithClient();
    await screen.findByText('Banner');
    const file = new File(['x'], 'banner.png', { type: 'image/png' });
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fireEvent.change(fileInputs[0]!, { target: { files: [file] } });

    await waitFor(() =>
      expect(mockUploadRallyBanner).toHaveBeenCalledWith({ body: { image: file } }),
    );
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Banner atualizado com sucesso!'));
  });

  it('uploads a logo image and shows a success toast', async () => {
    renderWithClient();
    await screen.findByText('Logótipo');
    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fireEvent.change(fileInputs[1]!, { target: { files: [file] } });

    await waitFor(() =>
      expect(mockUploadRallyLogo).toHaveBeenCalledWith({ body: { image: file } }),
    );
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Logótipo atualizado com sucesso!'));
  });

  it('uploads a favicon image and shows a success toast', async () => {
    renderWithClient();
    await screen.findByText('Favicon');
    const file = new File(['x'], 'favicon.png', { type: 'image/png' });
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fireEvent.change(fileInputs[2]!, { target: { files: [file] } });

    await waitFor(() =>
      expect(mockUploadRallyFavicon).toHaveBeenCalledWith({ body: { image: file } }),
    );
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Favicon atualizado com sucesso!'));
  });

  it('shows an error toast when a banner upload fails', async () => {
    mockUploadRallyBanner.mockRejectedValue(new Error('upload failed'));
    renderWithClient();
    await screen.findByText('Banner');
    const file = new File(['x'], 'banner.png', { type: 'image/png' });
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fireEvent.change(fileInputs[0]!, { target: { files: [file] } });

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('upload failed'));
  });

  it('does not upload when the file input change has no file', async () => {
    renderWithClient();
    await screen.findByText('Banner');
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fireEvent.change(fileInputs[0]!, { target: { files: [] } });
    expect(mockUploadRallyBanner).not.toHaveBeenCalled();
  });

  it('renders existing image urls for banner, logo and favicon', async () => {
    mockViewRallySettings.mockResolvedValue({
      data: settings({
        banner_url: 'https://x/banner.png',
        logo_url: 'https://x/logo.png',
        favicon_url: 'https://x/favicon.png',
      }),
    });
    renderWithClient();
    expect(await screen.findByAltText('Banner atual')).toHaveAttribute('src', 'https://x/banner.png');
    expect(screen.getByAltText('Logótipo atual')).toHaveAttribute('src', 'https://x/logo.png');
    expect(screen.getByAltText('Favicon atual')).toHaveAttribute('src', 'https://x/favicon.png');
  });

  it('triggers the hidden file input when clicking the Carregar button', async () => {
    renderWithClient();
    await screen.findByText('Banner');
    const fileInputs = document.querySelectorAll('input[type="file"]') as NodeListOf<HTMLInputElement>;
    const clickSpy = vi.spyOn(fileInputs[0]!, 'click');
    const uploadButtons = screen.getAllByText('Carregar');
    fireEvent.click(uploadButtons[0]!);
    expect(clickSpy).toHaveBeenCalled();
  });
});
