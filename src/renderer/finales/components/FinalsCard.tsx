// Presentational (design nodes `grfpH` / `g1HRM2` / `vYdru`): the final-exam
// instances, the standby strip and the decision prompt.
//
// The prompt is the point of this component. Failing every mesa leaves the
// subject in standby FOREVER unless the app says so — the state is derived,
// so nothing changes on its own, and without this the subject would sit
// there silently with no signal that a decision is owed.
import { Calendar, CalendarOff, Info, Pause, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { countFinalsByResult, resolveFinalsVerdict, type FinalExamResult } from '../../materias/domain/subjectStatus'
import { Button } from '../../shared/components/ui/button'
import { formatTakenOn } from '../domain/finalDate'
import { cn } from '../../shared/lib/cn'
import { interactiveChip, interactiveGhostDestructive } from '../../shared/lib/interactive'
import type { FinalExamRecord } from '../../../shared/ipc/materias'

interface FinalsCardProps {
  finals: FinalExamRecord[]
  onAdd: () => void
  onSetResult: (final: FinalExamRecord, result: FinalExamResult) => void
  onDelete: (final: FinalExamRecord) => void
  /**
   * Requests recording the subject as reprobada — only the student may do
   * this. This click only asks; the caller confirms
   * (`finales/components/GiveUpConfirmDialog.tsx`) before the outcome
   * actually changes.
   */
  onGiveUp: () => void
}

const RESULT_STYLES: Record<FinalExamResult, string> = {
  pendiente: 'border-border bg-muted text-secondary-foreground',
  aprobado: 'border-ok bg-ok-soft text-ok',
  reprobado: 'border-destructive bg-urgent-soft text-destructive'
}

const RESULTS: FinalExamResult[] = ['pendiente', 'aprobado', 'reprobado']

export function FinalsCard({ finals, onAdd, onSetResult, onDelete, onGiveUp }: FinalsCardProps): React.JSX.Element {
  const { t } = useTranslation('finales')
  const counts = countFinalsByResult(finals)
  const verdict = resolveFinalsVerdict(finals)

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-md border border-primary bg-sidebar-accent px-3 py-2">
            <Pause className="h-3.5 w-3.5 text-primary-ink" aria-hidden="true" />
            <strong className="text-body-sm font-semibold text-primary-ink">
              {verdict === 'aprobado' ? t('finalsCard.approvedByFinal') : t('finalsCard.standbyPending')}
            </strong>
          </span>
          <ul className="flex items-center gap-2">
            {RESULTS.map((result) => (
              <li
                key={result}
                className="flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-caption text-secondary-foreground"
              >
                {t(`finalsCard.resultCounts.${result}`, { count: counts[result] })}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-body-sm leading-relaxed text-secondary-foreground">{t('finalsCard.howItWorks')}</p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-label font-semibold text-muted-foreground">{t('finalsCard.instancesHeading')}</h2>
          <Button type="button" size="sm" onClick={onAdd} className="gap-2">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t('finalsCard.addInstance')}
          </Button>
        </div>

        {finals.length === 0 ? (
          <p className="text-body-lg text-muted-foreground">{t('finalsCard.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {finals.map((final) => (
              <li
                key={final.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background px-4 py-3"
              >
                <strong className="flex-1 text-body font-semibold text-foreground">{final.label}</strong>

                <span className="flex w-[190px] items-center gap-2 text-body-sm">
                  {final.takenOn === null ? (
                    <>
                      <CalendarOff className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      <span className="text-muted-foreground">{t('finalsCard.noDateYet')}</span>
                    </>
                  ) : (
                    <>
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      <span className="text-secondary-foreground">{formatTakenOn(final.takenOn)}</span>
                    </>
                  )}
                </span>

                <span className="flex items-center gap-1">
                  {RESULTS.map((result) => (
                    <button
                      key={result}
                      type="button"
                      aria-pressed={final.result === result}
                      onClick={() => onSetResult(final, result)}
                      className={cn(
                        final.result === result
                          ? `rounded-md border px-2 py-1 text-caption font-semibold ${RESULT_STYLES[result]}`
                          : 'rounded-md border border-transparent px-2 py-1 text-caption font-medium text-muted-foreground',
                        interactiveChip
                      )}
                    >
                      {t(`finalsCard.resultLabels.${result}`)}
                    </button>
                  ))}
                </span>

                <button
                  type="button"
                  aria-label={t('finalsCard.deleteInstance', { label: final.label })}
                  onClick={() => onDelete(final)}
                  className={cn('-m-2 rounded-md p-2 text-muted-foreground', interactiveGhostDestructive)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {verdict === 'todasReprobadas' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn bg-warn-soft px-4 py-3">
          <span className="flex items-start gap-3">
            <Info className="mt-px h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
            <span className="flex flex-col gap-1">
              <strong className="text-body-sm font-semibold text-foreground">
                {t('finalsCard.failedAll', { count: finals.length })}
              </strong>
              <span className="text-caption text-secondary-foreground">{t('finalsCard.failedAllHint')}</span>
            </span>
          </span>
          <span className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onAdd}>
              {t('finalsCard.addAnotherInstance')}
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={onGiveUp}>
              {t('finalsCard.giveUp')}
            </Button>
          </span>
        </div>
      )}
    </section>
  )
}
