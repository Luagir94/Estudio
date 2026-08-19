import { MessageCircle } from 'lucide-react'
import { ASK_PANEL_TITLE } from '../domain/askDisplay'

interface AskTriggerProps {
  open: boolean
  onClick: () => void
}

/**
 * The global entry point (design `Grupo — Preguntar` → `AskTrigger`): 56px,
 * violet fill, fixed to the bottom-right of the window so it rides above
 * whatever screen is mounted. The panel is available everywhere because the
 * corpus is global — it is not a Materias affordance.
 *
 * It stays mounted while the panel is OPEN, exactly as the approved design
 * shows it (node `p5nQEV` sits alongside the panel in `Screen — Preguntar ·
 * Conversación`), so the same button that opens the panel also closes it.
 * State is carried by `aria-expanded` rather than by swapping the label,
 * which is the standard disclosure pattern and keeps one stable accessible
 * name for the control.
 */
export function AskTrigger({ open, onClick }: AskTriggerProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ASK_PANEL_TITLE}
      aria-expanded={open}
      className="fixed right-6 bottom-6 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_20px_#00000066] transition-opacity hover:opacity-90"
    >
      <MessageCircle className="size-6" aria-hidden="true" />
    </button>
  )
}
