import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockUseToastContext } = vi.hoisted(() => ({
  mockUseToastContext: vi.fn(),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => mockUseToastContext(),
}));

import { useAppToast } from '@/hooks/use-toast';

describe('useAppToast', () => {
  const mockShowToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseToastContext.mockReturnValue({ showToast: mockShowToast });
  });

  it('calls showToast with "success" type', () => {
    const toast = useAppToast();
    toast.success('It worked');
    expect(mockShowToast).toHaveBeenCalledWith('It worked', 'success', undefined);
  });

  it('calls showToast with "error" type', () => {
    const toast = useAppToast();
    toast.error('It failed');
    expect(mockShowToast).toHaveBeenCalledWith('It failed', 'error', undefined);
  });

  it('calls showToast with "info" type', () => {
    const toast = useAppToast();
    toast.info('FYI');
    expect(mockShowToast).toHaveBeenCalledWith('FYI', 'info', undefined);
  });

  it('calls showToast with "warning" type', () => {
    const toast = useAppToast();
    toast.warning('Careful');
    expect(mockShowToast).toHaveBeenCalledWith('Careful', 'warning', undefined);
  });

  it('passes a custom duration through to showToast', () => {
    const toast = useAppToast();
    toast.success('Custom duration', 1000);
    expect(mockShowToast).toHaveBeenCalledWith('Custom duration', 'success', 1000);
  });
});
