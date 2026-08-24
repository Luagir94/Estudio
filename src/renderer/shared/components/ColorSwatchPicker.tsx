// The colour row shared by the carrera and materia forms (design nodes
// `kKXzs` / `wvfOI` — the same component in both, which is why it is one
// component here).
//
// Carreras used to inline this markup twice and materias did not have it at
// all: its colour field was a bare text input you typed a hex into, so the
// palette the rest of the app is built on was invisible at the one moment you
// choose from it.
//
// The swatch is a 24px button holding a 16px dot rather than a 24px coloured
// circle, because that is what makes the selected ring possible: the ring is
// drawn on the button, and the 4px of padding is the gap between ring and
// colour. Doing it with `ring-offset` instead would need the offset colour
// declared per call site — and this renders on a card AND inside a dialog.
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import { interactive, interactiveSwatch } from '../lib/interactive'

/** The design's `subject-1`..`subject-5`. Fixed order: the nth carrera gets the nth colour. */
export const SUBJECT_COLORS = ['#4C8DFF', '#A78BFA', '#FB923C', '#2DD4A7', '#F472B6'] as const

/**
 * The custom swatch's resting face. It is the app's own six hues in a wheel,
 * not a spectrum: it has to read "any colour you like" while still looking
 * like it belongs to this palette.
 */
const COLOR_WHEEL = 'conic-gradient(from 0deg, #FF6B5B, #F5B14C, #2DD4A7, #4C8DFF, #7F5AF0, #F472B6, #FF6B5B)'

interface ColorSwatchPickerProps {
  value: string
  onChange: (color: string) => void
  /** Defaults to the five catalogued subject colours. */
  options?: readonly string[]
}

export function ColorSwatchPicker({
  value,
  onChange,
  options = SUBJECT_COLORS
}: ColorSwatchPickerProps): React.JSX.Element {
  const { t } = useTranslation('common')
  // Anything the catalogue does not contain is a custom colour, including the
  // empty string a brand-new form starts with — which is why the ring is
  // gated on a non-empty value rather than on `isCustom` alone.
  const isCustom = value !== '' && !options.includes(value)

  return (
    <div className="flex items-center gap-2 px-1 py-3">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-label={t('colorSwatchPicker.colorOption', { color: option })}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-full',
            value === option && 'ring-2 ring-primary',
            interactiveSwatch
          )}
        >
          <span aria-hidden="true" style={{ backgroundColor: option }} className="h-4 w-4 rounded-full" />
        </button>
      ))}

      {/* A label wrapping the input, not a button beside it: the native colour
          dialog only opens from the input itself, so the swatch has to BE the
          input's hit target. The input stays in the accessibility tree with a
          real value — screen readers and tests both read it — while `sr-only`
          keeps the OS swatch it would otherwise paint out of the layout. */}
      <label
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full',
          isCustom && 'ring-2 ring-primary',
          interactive,
          'hover:scale-110 active:scale-95 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring'
        )}
      >
        <span
          aria-hidden="true"
          style={{ background: isCustom ? value : COLOR_WHEEL }}
          className="h-4 w-4 rounded-full"
        />
        <input
          type="color"
          aria-label={t('colorSwatchPicker.customColor')}
          value={isCustom ? value : (options[0] ?? '#000000')}
          onChange={(event) => onChange(event.target.value)}
          className="sr-only"
        />
      </label>
    </div>
  )
}
