import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, pageSummary, paginate, paginationInputSchema } from './pagination'

const rows = (count: number): number[] => Array.from({ length: count }, (_, index) => index)

describe('paginate', () => {
  it('returns the first page at the default size when the caller asks for nothing', () => {
    const page = paginate(rows(100), {})

    expect(page.items).toHaveLength(DEFAULT_PAGE_SIZE)
    expect(page.items[0]).toBe(0)
    expect(page).toMatchObject({ total: 100, count: DEFAULT_PAGE_SIZE, offset: 0, hasMore: true })
    expect(page.nextOffset).toBe(DEFAULT_PAGE_SIZE)
  })

  it('reports the FULL total, not the page size — that is what tells a caller whether to keep going', () => {
    expect(paginate(rows(100), { limit: 10 }).total).toBe(100)
  })

  it('walks to the exact end without an extra empty page', () => {
    const page = paginate(rows(30), { limit: 10, offset: 20 })

    expect(page.items).toEqual([20, 21, 22, 23, 24, 25, 26, 27, 28, 29])
    expect(page.hasMore).toBe(false)
    expect(page.nextOffset).toBeNull()
  })

  it('returns an empty page past the end rather than throwing or wrapping', () => {
    const page = paginate(rows(5), { limit: 10, offset: 50 })

    expect(page).toEqual({ items: [], total: 5, count: 0, offset: 50, hasMore: false, nextOffset: null })
  })

  it('handles an empty collection', () => {
    expect(paginate([], {})).toEqual({ items: [], total: 0, count: 0, offset: 0, hasMore: false, nextOffset: null })
  })

  it('produces a nextOffset that, fed back in, yields the following rows with no gap or repeat', () => {
    const all = rows(23)
    const first = paginate(all, { limit: 10 })
    const second = paginate(all, { limit: 10, offset: first.nextOffset! })
    const third = paginate(all, { limit: 10, offset: second.nextOffset! })

    expect([...first.items, ...second.items, ...third.items]).toEqual(all)
    expect(third.hasMore).toBe(false)
    expect(third.nextOffset).toBeNull()
  })
})

describe('paginationInputSchema', () => {
  it('accepts an empty object: both fields are optional', () => {
    expect(paginationInputSchema.safeParse({}).success).toBe(true)
  })

  it('rejects a limit outside the advertised bounds, so a client gets a real error instead of a silent clamp', () => {
    expect(paginationInputSchema.safeParse({ limit: 0 }).success).toBe(false)
    expect(paginationInputSchema.safeParse({ limit: MAX_PAGE_SIZE + 1 }).success).toBe(false)
    expect(paginationInputSchema.safeParse({ limit: 1 }).success).toBe(true)
    expect(paginationInputSchema.safeParse({ limit: MAX_PAGE_SIZE }).success).toBe(true)
  })

  it('rejects a negative offset and a fractional one', () => {
    expect(paginationInputSchema.safeParse({ offset: -1 }).success).toBe(false)
    expect(paginationInputSchema.safeParse({ offset: 1.5 }).success).toBe(false)
    expect(paginationInputSchema.safeParse({ offset: 0 }).success).toBe(true)
  })
})

describe('pageSummary', () => {
  it('reports counts only — never a row, an identifier list, or a payload', () => {
    expect(pageSummary('materias_list', paginate(rows(132), { limit: 25 }))).toBe('materias_list → 25 of 132 rows')
    expect(pageSummary('fechas_list', null)).toBe('fechas_list → 0 rows')
  })
})
