// Pure, framework-free formatting for the history list's relative date
// (design #268 §3). `updatedAt` is the same local-naive `yyyy-MM-dd'T'HH:mm`
// convention `entregas/domain/deadline.ts` parses (`differenceInCalendarDays`
// over `parseISO`, never elapsed hours), so this mirrors that module's shape
// rather than inventing a second date convention.
import { differenceInCalendarDays, parseISO } from 'date-fns'
import i18n from '../../i18n'

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

export function formatConversationDate(updatedAt: string, now: Date): string {
  const date = parseISO(updatedAt)
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const daysAgo = differenceInCalendarDays(now, date)

  if (daysAgo === 0) {
    return i18n.t('ask:conversationDate.today', { time })
  }
  if (daysAgo === 1) {
    return i18n.t('ask:conversationDate.yesterday', { time })
  }
  // Same consolidated lowercase month table `carreras/domain/period.ts` reads.
  const months = i18n.t('common:monthsShort', { returnObjects: true }) as string[]
  return `${date.getDate()} ${months[date.getMonth()]}`
}
