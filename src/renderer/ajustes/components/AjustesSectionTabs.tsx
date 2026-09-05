// Presentational (approved `.pen`, node `PQXon` "Section Tabs", frame "Grupo —
// Ajustes"): switches the screen between its three sections. Props only; the
// container owns which one is showing.
//
// The SAME segmented control `AppearanceCard` draws for the theme preference —
// the `.pen` resolves the two to identical values down to the token, so they
// are the same control doing the same job at two scales, and the classes below
// are deliberately its twin rather than a second dialect of the same shape.
//
// A button group with `aria-pressed`, not a `tablist`. A real tab widget owes
// the keyboard arrow-key roving focus and a `tabpanel` per tab; announcing the
// role without honouring the contract is worse for a screen reader than the
// plain group this actually is, and the project already toggles views this way
// (`AttachmentViewer`'s Vista/Edición).
import { Palette, Plug, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../shared/lib/cn'
import { interactiveChip } from '../../shared/lib/interactive'
import { AJUSTES_SECTIONS, type AjustesSection } from '../domain/ajustesSections'

const SECTION_ICONS: Record<AjustesSection, typeof Palette> = {
  apariencia: Palette,
  integraciones: Plug,
  permisos: ShieldCheck
}

interface AjustesSectionTabsProps {
  /** The section on screen — always the container's state, never a local copy. */
  value: AjustesSection
  onChange: (section: AjustesSection) => void
}

export function AjustesSectionTabs({ value, onChange }: AjustesSectionTabsProps): React.JSX.Element {
  const { t } = useTranslation('ajustes')

  return (
    <div
      role="group"
      aria-label={t('ajustesContainer.sections.label')}
      className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-muted p-[3px]"
    >
      {AJUSTES_SECTIONS.map((section) => {
        const isActive = value === section
        const Icon = SECTION_ICONS[section]
        return (
          <button
            key={section}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(section)}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-body-sm',
              isActive
                ? 'border-border bg-card font-semibold text-foreground'
                : 'border-transparent font-normal text-secondary-foreground',
              interactiveChip
            )}
          >
            <Icon
              className={cn('h-3.5 w-3.5', isActive ? 'text-foreground' : 'text-muted-foreground')}
              aria-hidden="true"
            />
            {t(`ajustesContainer.sections.${section}`)}
          </button>
        )
      })}
    </div>
  )
}
