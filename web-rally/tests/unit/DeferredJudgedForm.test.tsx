import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import DeferredJudgedForm from '@/components/forms/DeferredJudgedForm';
import type { Team } from '@/types/forms';

const { mockUseRallySettings, mockToast, mockCaptureDeferredResult, mockSetTeamPhotoFromResult } =
  vi.hoisted(() => ({
    mockUseRallySettings: vi.fn(),
    mockToast: { error: vi.fn(), success: vi.fn() },
    mockCaptureDeferredResult: vi.fn(),
    mockSetTeamPhotoFromResult: vi.fn(),
  }));

vi.mock('@/components/themes/bloody', () => ({
  BloodyButton: (props: React.ComponentProps<'button'>) => <button {...props} />,
}));

vi.mock('@/hooks/useRallySettings', () => ({
  default: () => mockUseRallySettings(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useAppToast: () => mockToast,
}));

vi.mock('@/client', () => ({
  captureDeferredResult: mockCaptureDeferredResult,
  setTeamPhotoFromResult: mockSetTeamPhotoFromResult,
}));

describe('DeferredJudgedForm', () => {
  const mockTeam = { id: 1, name: 'Team A' } as unknown as Team;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRallySettings.mockReturnValue({ settings: { allow_photo_as_team_photo: false } });
    mockCaptureDeferredResult.mockResolvedValue({ data: {} });
  });

  it('renders without crashing', () => {
    render(<DeferredJudgedForm activityId={1} team={mockTeam} />);
    expect(screen.getByText('Tirar foto')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar/ })).toBeInTheDocument();
  });

  it('disables submit button when no files added', () => {
    render(<DeferredJudgedForm activityId={1} team={mockTeam} />);
    expect(screen.getByRole('button', { name: /Enviar/ })).toBeDisabled();
    expect(mockCaptureDeferredResult).not.toHaveBeenCalled();
  });

  it('blocks submission when form is submitted programmatically with no files', () => {
    const { container } = render(<DeferredJudgedForm activityId={1} team={mockTeam} />);
    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    expect(mockToast.error).toHaveBeenCalledWith('Adiciona pelo menos uma foto antes de submeter.');
    expect(mockCaptureDeferredResult).not.toHaveBeenCalled();
  });

  it('uploads files and calls onCaptured on success', async () => {
    const onCaptured = vi.fn();
    const { container } = render(
      <DeferredJudgedForm activityId={1} team={mockTeam} onCaptured={onCaptured} />
    );

    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Enviar \(1\) fotos/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Enviar/ }));

    await waitFor(() => {
      expect(mockCaptureDeferredResult).toHaveBeenCalledWith({
        path: { activity_id: 1 },
        query: { team_id: 1 },
        body: { images: [file] },
      });
    });

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Fotos enviadas. Aguarda avaliação do administrador.');
      expect(onCaptured).toHaveBeenCalled();
    });
  });

  it('shows error toast when upload fails', async () => {
    mockCaptureDeferredResult.mockRejectedValue(new Error('fail'));
    const { container } = render(<DeferredJudgedForm activityId={1} team={mockTeam} />);

    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => screen.getByText(/Enviar \(1\) fotos/));
    fireEvent.click(screen.getByRole('button', { name: /Enviar/ }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Falha ao enviar fotos. Tenta novamente.');
    });
  });

  it('removes a staged file via remove button', async () => {
    const { container } = render(<DeferredJudgedForm activityId={1} team={mockTeam} />);
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => screen.getByLabelText('Remover foto'));
    fireEvent.click(screen.getByLabelText('Remover foto'));

    await waitFor(() => {
      expect(screen.queryByLabelText('Remover foto')).not.toBeInTheDocument();
    });
  });

  it('shows existing media urls and judgment status', () => {
    render(
      <DeferredJudgedForm
        activityId={1}
        team={mockTeam}
        existingResult={
          {
            media_urls: ['https://example.com/photo1.jpg'],
            judgment_status: 'judged',
            id: 55,
          } as any
        }
      />
    );
    expect(screen.getByText('Fotos já enviadas')).toBeInTheDocument();
    expect(screen.getByText('Estado: Avaliado')).toBeInTheDocument();
  });

  it('shows pending status when not judged', () => {
    render(
      <DeferredJudgedForm
        activityId={1}
        team={mockTeam}
        existingResult={
          { media_urls: ['https://example.com/photo1.jpg'], judgment_status: 'pending', id: 55 } as any
        }
      />
    );
    expect(screen.getByText('Estado: Pendente de avaliação')).toBeInTheDocument();
  });

  it('allows setting team photo when enabled', async () => {
    mockUseRallySettings.mockReturnValue({ settings: { allow_photo_as_team_photo: true } });
    mockSetTeamPhotoFromResult.mockResolvedValue({ data: {} });

    render(
      <DeferredJudgedForm
        activityId={1}
        team={mockTeam}
        existingResult={
          { media_urls: ['https://example.com/photo1.jpg'], judgment_status: 'judged', id: 55 } as any
        }
      />
    );

    fireEvent.click(screen.getByLabelText('Definir como foto da equipa'));

    await waitFor(() => {
      expect(mockSetTeamPhotoFromResult).toHaveBeenCalledWith({
        path: { result_id: 55 },
        body: { image_url: 'https://example.com/photo1.jpg' },
      });
      expect(mockToast.success).toHaveBeenCalledWith('Foto definida como foto da equipa.');
    });
  });

  it('shows error toast when setting team photo fails', async () => {
    mockUseRallySettings.mockReturnValue({ settings: { allow_photo_as_team_photo: true } });
    mockSetTeamPhotoFromResult.mockRejectedValue(new Error('fail'));

    render(
      <DeferredJudgedForm
        activityId={1}
        team={mockTeam}
        existingResult={
          { media_urls: ['https://example.com/photo1.jpg'], judgment_status: 'judged', id: 55 } as any
        }
      />
    );

    fireEvent.click(screen.getByLabelText('Definir como foto da equipa'));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Falha ao definir foto da equipa. Tenta novamente.');
    });
  });
});
