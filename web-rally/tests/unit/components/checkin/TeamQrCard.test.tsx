import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TeamQrCard } from '@/components/checkin/TeamQrCard'

describe('TeamQrCard', () => {
  it('renders the access code and a QR svg', () => {
    const { container } = render(<TeamQrCard accessCode="ABCD-1234" />)
    expect(screen.getByText('ABCD-1234')).toBeInTheDocument()
    expect(screen.getByText('O teu QR de equipa')).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
