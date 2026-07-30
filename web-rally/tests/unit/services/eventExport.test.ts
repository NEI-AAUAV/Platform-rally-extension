/**
 * Test suite for eventExport.ts — the admin results-export download.
 *
 * Downloads a binary xlsx via raw fetch with the staff token, then streams it
 * into a browser download. Staff auth lives in useUserStore (the OIDC access
 * token), not the team tokenStore.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let mockToken: string | null = 'staff-jwt'

vi.mock('@/stores/useUserStore', () => ({
  useUserStore: {
    getState: () => ({ token: mockToken }),
  },
}))

vi.mock('@/config', () => ({
  default: { BASE_URL: 'http://localhost:8000' },
}))

describe('downloadEventResults', () => {
  beforeEach(() => {
    mockToken = 'staff-jwt'
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('throws when there is no staff session', async () => {
    mockToken = null
    const { downloadEventResults } = await import('@/services/eventExport')
    await expect(downloadEventResults(1, 'Rally')).rejects.toThrow(
      /administrador/i,
    )
  })

  it('fetches the export endpoint with the staff bearer token', async () => {
    const blob = new Blob(['xlsx'], { type: 'application/octet-stream' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => blob,
    })
    vi.stubGlobal('fetch', fetchMock)
    stubDownloadDom()

    const { downloadEventResults } = await import('@/services/eventExport')
    await downloadEventResults(42, 'Rally 2026')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/rally/v1/events/42/export',
      { headers: { Authorization: 'Bearer staff-jwt' } },
    )
  })

  it('triggers a download with a sanitized filename', async () => {
    const blob = new Blob(['xlsx'])
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, blob: async () => blob }),
    )
    const anchor = stubDownloadDom()

    const { downloadEventResults } = await import('@/services/eventExport')
    await downloadEventResults(7, 'Rally / Edição #1')

    expect(anchor.download).toBe('Rally_Edição_1_resultados.xlsx')
    expect(anchor.click).toHaveBeenCalledOnce()
  })

  it('throws when the server responds with an error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))

    const { downloadEventResults } = await import('@/services/eventExport')
    await expect(downloadEventResults(1, 'Rally')).rejects.toThrow(/500/)
  })
})

/** Stub URL object-url APIs and the anchor element used for the download. */
function stubDownloadDom() {
  const anchor = {
    href: '',
    download: '',
    click: vi.fn(),
    remove: vi.fn(),
  } as unknown as HTMLAnchorElement

  vi.spyOn(document, 'createElement').mockReturnValue(anchor)
  vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n)
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn().mockReturnValue('blob:mock'),
    revokeObjectURL: vi.fn(),
  })
  return anchor
}
