import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({ useAuthSync: vi.fn() }))

vi.mock('@/auth/useAuthSync', () => ({ useAuthSync: h.useAuthSync }))

import AuthSyncGate from '@/auth/AuthSyncGate'

describe('AuthSyncGate', () => {
  it('invokes useAuthSync and renders children', () => {
    render(
      <AuthSyncGate>
        <div>child content</div>
      </AuthSyncGate>,
    )

    expect(h.useAuthSync).toHaveBeenCalled()
    expect(screen.getByText('child content')).toBeInTheDocument()
  })
})
