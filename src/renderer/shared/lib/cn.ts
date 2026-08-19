// Shared className helper (shadcn/ui convention): merges conditional
// classes via clsx, then resolves conflicting Tailwind utility classes via
// tailwind-merge (e.g. a caller-supplied `px-2` overriding a base `px-4`).
// Lives under shared/, never under any domain/ folder — it is a rendering
// concern, not domain logic.
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
