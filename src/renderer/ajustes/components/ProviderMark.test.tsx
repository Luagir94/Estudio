// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CLI_PROVIDERS, type CliProvider } from '../../../shared/ipc/cli'
import { ProviderMark } from './ProviderMark'

function markPath(provider: CliProvider): string {
  const { container } = render(<ProviderMark provider={provider} />)
  return container.querySelector('svg > path')?.getAttribute('d') ?? ''
}

describe('ProviderMark', () => {
  it('draws a mark for every supported CLI', () => {
    for (const provider of CLI_PROVIDERS) {
      expect(markPath(provider)).not.toBe('')
    }
  })

  // The whole point of a brand mark is telling the three cards apart at a
  // glance — a shared generic icon (what this replaced) does not do that.
  it('draws a DIFFERENT mark per CLI', () => {
    const paths = CLI_PROVIDERS.map(markPath)

    expect(new Set(paths).size).toBe(CLI_PROVIDERS.length)
  })

  // Decorative: the card's heading already names the CLI in text, so an
  // accessible name here would make a screen reader say it twice.
  it('is hidden from assistive technology', () => {
    const { container } = render(<ProviderMark provider="claude" />)

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('title')).toBeNull()
  })

  // `evenodd` is not cosmetic: the OpenAI knot is one path whose overlapping
  // subpaths must cut holes, not fill solid.
  it('fills with the even-odd rule so overlapping subpaths cut holes', () => {
    const { container } = render(<ProviderMark provider="codex" />)

    expect(container.querySelector('svg')).toHaveAttribute('fill-rule', 'evenodd')
  })

  it('inherits its colour from the surrounding text', () => {
    const { container } = render(<ProviderMark provider="antigravity" className="text-ok" />)

    expect(container.querySelector('svg')).toHaveAttribute('fill', 'currentColor')
    expect(container.querySelector('svg')).toHaveClass('text-ok')
  })
})
