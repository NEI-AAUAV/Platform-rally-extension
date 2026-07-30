import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import QRCodeDisplay from '@/components/qr/QRCodeDisplay'

describe('QRCodeDisplay', () => {
  it('renders the access code as text', () => {
    render(<QRCodeDisplay accessCode="ABCD-1234" />)
    expect(screen.getByText('ABCD-1234')).toBeInTheDocument()
    expect(screen.getByText('Código de Acesso')).toBeInTheDocument()
  })

  it('renders a QR svg encoding the team login URL', () => {
    const { container } = render(<QRCodeDisplay accessCode="WXYZ-9999" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('applies a custom className', () => {
    const { container } = render(<QRCodeDisplay accessCode="AAAA-1111" className="my-extra" />)
    expect(container.querySelector('.my-extra')).toBeInTheDocument()
  })

  it('respects a custom size', () => {
    const { container } = render(<QRCodeDisplay accessCode="AAAA-1111" size={64} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '64')
    expect(svg).toHaveAttribute('height', '64')
  })
})
