import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BrandHeader from '@/components/branding/BrandHeader'
import { FALLBACK_BANNER_SRC } from '@/lib/branding'
import type { Branding } from '@/lib/branding'

const baseBranding: Branding = {
  eventName: 'Rally Tascas',
  eventSubtitle: 'A noite é para os fortes',
  bannerSrc: '/banner.jpg',
  logoSrc: '/logo.png',
  accentColor: '#ff0000',
  faviconHref: '/favicon.ico',
  customFaviconUrl: '',
  themeColor: '#ff0000',
}

describe('BrandHeader', () => {
  it('renders the event name, subtitle and logo image', () => {
    render(<BrandHeader branding={baseBranding} />)
    expect(screen.getByText('Rally Tascas')).toBeInTheDocument()
    expect(screen.getByText('A noite é para os fortes')).toBeInTheDocument()
    expect(screen.getByAltText('Rally Tascas logo')).toBeInTheDocument()
  })

  it('renders initials fallback when there is no logo', () => {
    render(<BrandHeader branding={{ ...baseBranding, logoSrc: '' }} />)
    expect(screen.getByText('RT')).toBeInTheDocument()
  })

  it('falls back to the bundled banner on image error', () => {
    render(<BrandHeader branding={baseBranding} />)
    const banner = screen.getByAltText('Rally Tascas banner') as HTMLImageElement
    fireEvent.error(banner)
    expect(banner.src).toContain(FALLBACK_BANNER_SRC)
  })

  it('does not render a subtitle element when there is none', () => {
    render(<BrandHeader branding={{ ...baseBranding, eventSubtitle: '' }} />)
    expect(screen.queryByText('A noite é para os fortes')).not.toBeInTheDocument()
  })

  it('applies a custom className', () => {
    const { container } = render(<BrandHeader branding={baseBranding} className="extra-cls" />)
    expect(container.querySelector('.extra-cls')).toBeInTheDocument()
  })
})
