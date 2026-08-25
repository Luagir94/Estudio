// Pure, framework-free domain module (design §4) — same rule as subject.ts:
// no electron, no i18n instance. The UNKNOWN case returns null instead of a
// translated string so the render site owns the generic copy via the
// materias namespace.

// Closed host → label set. Exact hosts only (plus a stripped `www.` prefix):
// matching by suffix would let `discord.gg.evil.example` masquerade as
// Discord, and the fallback label is a perfectly good answer for everything
// else.
const HOST_LABELS: Record<string, string> = {
  'chat.whatsapp.com': 'WhatsApp',
  'wa.me': 'WhatsApp',
  'discord.gg': 'Discord',
  'discord.com': 'Discord',
  't.me': 'Telegram',
  'telegram.me': 'Telegram'
}

/**
 * Derives the display label for a subject's group-chat link from its URL
 * host ("WhatsApp" / "Discord" / "Telegram"). Returns null for any other
 * host AND for a malformed URL — the stored groupUrl is deliberately not
 * URL-validated at the IPC layer (parity with campusUrl), so this must
 * never throw on arbitrary text.
 */
export function groupLinkLabel(url: string): string | null {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
  return HOST_LABELS[host.startsWith('www.') ? host.slice(4) : host] ?? null
}
