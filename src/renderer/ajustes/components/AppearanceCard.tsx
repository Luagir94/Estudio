// Presentational (approved `.pen`, frame "Grupo — Ajustes", card
// "Apariencia"): one row — icon, title/description stack, and a three-way
// segmented control for the theme preference. Props only; the container owns
// the query and the mutation.
//
// The segmented control follows `AttachmentViewer`'s Vista/Edición toggle:
// sunken container, `aria-pressed` buttons, active segment painted with
// surface + border + semibold ink. The selection shown is ALWAYS the prop —
// no local copy that could disagree with the cache after a failed mutation.
import { Monitor, Moon, Sun, SunMoon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { THEME_PREFERENCES, type ThemePreference } from '../../../shared/ipc/theme'
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
}

export function AppearanceCard({ value, onChange }: AppearanceCardProps): React.JSX.Element {
  const { t } = useTranslation('ajustes')

  return (
    <div className="flex w-full items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-3.5">
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
              <Icon
                className={cn('h-3.5 w-3.5', isActive ? 'text-secondary-foreground' : 'text-muted-foreground')}
                aria-hidden="true"
              />
              {t(`appearanceCard.option.${preference}`)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
