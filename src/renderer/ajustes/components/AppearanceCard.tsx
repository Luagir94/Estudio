// Presentational (approved `.pen`, frame "Grupo — Ajustes", card
// "Apariencia"): two rows, hairline-separated — the theme preference as a
// three-way segmented control, and the palette as a select. Props only; the
// container owns both queries and both mutations.
//
// Two rows, two controls, two shapes, on purpose. The theme has three options
// that fit side by side and benefit from being visible at a glance; the
// palette has six, which is where a segmented control stops being a control
// and starts being a wall. The design (node `WHzRs`) makes the same call.
//
// The segmented control follows `AttachmentViewer`'s Vista/Edición toggle:
// sunken container, `aria-pressed` buttons, active segment painted with
// surface + border + semibold ink. Both selections shown are ALWAYS the props
// — no local copy that could disagree with the cache after a failed mutation.
import { Monitor, Moon, Palette as PaletteIcon, Sun, SunMoon } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import {
  paletteSchema,
  PALETTES,
  THEME_PREFERENCES,
  type Palette,
  type ThemePreference
} from '../../../shared/ipc/theme'
import { Select } from '../../shared/components/ui/select'
import { cn } from '../../shared/lib/cn'
import { interactiveChip } from '../../shared/lib/interactive'

const OPTION_ICONS: Record<ThemePreference, typeof Monitor> = {
  system: Monitor,
  light: Sun,
  dark: Moon
}

interface AppearanceCardProps {
  /** The preference as persisted — never a guess made while a mutation is in flight. */
  value: ThemePreference
  /** Reports the pressed option; applying and persisting are the container's problem. */
  onChange: (preference: ThemePreference) => void
  /** The palette as persisted, on the same no-local-copy terms as `value`. */
  palette: Palette
  /** Reports the chosen palette; putting it on `<html>` and persisting are the container's problem. */
  onPaletteChange: (palette: Palette) => void
}

export function AppearanceCard({ value, onChange, palette, onPaletteChange }: AppearanceCardProps): React.JSX.Element {
  const { t } = useTranslation('ajustes')
  const paletteLabelId = useId()

  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-border bg-card px-5 py-3.5">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <SunMoon className="h-[18px] w-[18px] shrink-0 text-secondary-foreground" aria-hidden="true" />
          <div className="flex flex-col gap-0.5">
            <h3 className="text-body-lg font-semibold text-foreground">{t('appearanceCard.title')}</h3>
            <p className="text-body text-secondary-foreground">{t('appearanceCard.description')}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-muted p-[3px]">
          {THEME_PREFERENCES.map((preference) => {
            const isActive = value === preference
            const Icon = OPTION_ICONS[preference]
            return (
              <button
                key={preference}
                type="button"
                aria-pressed={isActive}
                onClick={() => onChange(preference)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-body-sm',
                  isActive
                    ? 'border-border bg-card font-semibold text-foreground'
                    : 'border-transparent font-normal text-secondary-foreground',
                  interactiveChip
                )}
              >
                {/* `text-foreground` on the active segment, matching the
                    `.pen` (node `aU8vU`, icon fill `$text-primary`) and the
                    section tabs, which resolve to the same values. The code
                    had drifted to `text-secondary-foreground`, which left the
                    pressed icon a shade dimmer than its own label. */}
                <Icon
                  className={cn('h-3.5 w-3.5', isActive ? 'text-foreground' : 'text-muted-foreground')}
                  aria-hidden="true"
                />
                {t(`appearanceCard.option.${preference}`)}
              </button>
            )
          })}
        </div>
      </div>

      <div className="h-px w-full bg-border" />

      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <PaletteIcon className="h-[18px] w-[18px] shrink-0 text-secondary-foreground" aria-hidden="true" />
          <div className="flex flex-col gap-0.5">
            <h3 id={paletteLabelId} className="text-body-lg font-semibold text-foreground">
              {t('appearanceCard.palette.title')}
            </h3>
            <p className="text-body text-secondary-foreground">{t('appearanceCard.palette.description')}</p>
          </div>
        </div>

        {/* The swatch is a sibling of the select, not a child: a native
            <option> cannot carry one, and a custom listbox would be a lot of
            keyboard and screen-reader behaviour rebuilt by hand for six
            options. The dot is painted with `bg-primary`, which resolves to
            the ACTIVE palette's brand token — so it re-paints itself the
            moment `data-palette` changes, with nothing to keep in sync. */}
        <div className="relative shrink-0">
          <span
            className="pointer-events-none absolute left-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary"
            aria-hidden="true"
          />
          <Select
            aria-labelledby={paletteLabelId}
            value={palette}
            // Parsed, not cast. The options are rendered from `PALETTES`, so a
            // foreign value should be impossible — but `event.target.value` is
            // a bare string, and a cast is the one form of "should be
            // impossible" the compiler cannot check.
            onChange={(event) => {
              const next = paletteSchema.safeParse(event.target.value).data
              if (next) {
                onPaletteChange(next)
              }
            }}
            className="h-9 w-40 py-1.5 pl-7 pr-3 text-body-sm"
          >
            {PALETTES.map((option) => (
              <option key={option} value={option}>
                {t(`appearanceCard.palette.option.${option}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  )
}
