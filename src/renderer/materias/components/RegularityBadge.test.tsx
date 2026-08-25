// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RegularityBadge } from './RegularityBadge'

describe('RegularityBadge', () => {
  it.each([
    ['regular', 'Regular'],
    ['promocionada', 'Promocionada'],
    ['libre', 'Libre']
  ] as const)('names the declared condición %s', (regularity, label) => {
    render(<RegularityBadge regularity={regularity} />)

    expect(screen.getByText(label)).toBeInTheDocument()
  })

  // The condición is the faculty's verdict, recorded verbatim — the badge
  // must never look like something the app computed from the parciales.
  it('renders nothing at all when nobody declared a condición', () => {
    const { container } = render(<RegularityBadge regularity={null} />)

    expect(container).toBeEmptyDOMElement()
  })
})
