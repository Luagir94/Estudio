// Presentational form (approved .pen design): records a mesa as aprobada
// and, under a 'numerico' program, lets the nota ride along.
//
// This modal exists ONLY on that path — 'binario' programs and subjects with
// no program keep the direct chip update, and the other result chips never
// open it (FinalesContainer decides). Re-opened on an already-approved mesa
// it pre-fills the stored nota, which is how the nota gets edited later.
//
// Mirrors CerrarMateriaModal: same optional-nota input, same shared
// validateGrade run before submitting (main runs it again at the write
// boundary), same app-owned Spanish error copy.
import { Info } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { validateGrade } from '../../../shared/domain/grading'
import type { FinalExamRecord, SubjectProgram } from '../../../shared/ipc/materias'
import { Button } from '../../shared/components/ui/button'
import { DialogBody, DialogContent, DialogFooter, DialogHeader, DialogOverlay } from '../../shared/components/ui/dialog'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import { formatTakenOn } from '../domain/finalDate'

interface AprobarFinalModalProps {
  final: FinalExamRecord
  program: SubjectProgram
  /** Why the last submit did not go through — app-owned Spanish copy, never the raw IPC message. */
  error?: string | null
  /** True while the write is in flight — the submit locks so the approval cannot fire twice. */
  pending?: boolean
  /** `null` = aprobada sin nota. */
  onSubmit: (grade: number | null) => void
  onClose: () => void
}

export function AprobarFinalModal({
  final,
  program,
  error,
  pending,
  onSubmit,
  onClose
}: AprobarFinalModalProps): React.JSX.Element {
  const { t } = useTranslation('finales')
  const [grade, setGrade] = useState(final.grade === null ? '' : String(final.grade))

  const parsedGrade = grade.trim() === '' ? null : Number(grade)

  // Both failure modes collapse onto the same copy, same as
  // CerrarMateriaModal: "not a number" and "out of range" are one user-facing
  // rule, and `validateGrade`'s message is an internal English string.
  const gradeError =
    parsedGrade !== null && (Number.isNaN(parsedGrade) || !validateGrade(program, parsedGrade).ok)
      ? t('aprobarFinalModal.gradeNotANumber', { scale: program.gradeScale })
      : null

  const submit = (): void => {
    if (gradeError !== null) {
      return
    }
    onSubmit(parsedGrade)
  }

  return (
    <DialogOverlay>
      <DialogContent role="dialog" aria-label={t('aprobarFinalModal.dialogLabel')} onDismiss={onClose}>
        <DialogHeader onClose={onClose}>
          <h2 className="font-display text-title font-bold text-foreground">{t('aprobarFinalModal.title')}</h2>
          <p className="text-body-sm text-muted-foreground">
            {final.takenOn === null ? final.label : `${final.label} · ${formatTakenOn(final.takenOn)}`}
          </p>
        </DialogHeader>

        <DialogBody>
          <Label className="w-[180px]">
            {t('aprobarFinalModal.gradeLabel', { scale: program.gradeScale })}
            <Input
              type="number"
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
              min={0}
              max={program.gradeScale ?? undefined}
            />
          </Label>
          {gradeError && <p className="text-body-lg text-destructive">{gradeError}</p>}

          <div className="flex items-start gap-3 rounded-lg border border-primary bg-sidebar-accent px-4 py-3">
            <Info className="mt-px h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
            <p className="text-caption leading-relaxed text-secondary-foreground">{t('aprobarFinalModal.infoNote')}</p>
          </div>
        </DialogBody>

        <DialogFooter>
          {/* The failure takes the footer-note slot, same as NuevaInstanciaModal. */}
          {error ? (
            <p className="text-caption text-destructive">{error}</p>
          ) : (
            <p className="text-caption text-muted-foreground">{t('aprobarFinalModal.footerNote')}</p>
          )}
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="button" onClick={submit} disabled={gradeError !== null || pending}>
              {t('aprobarFinalModal.submit')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </DialogOverlay>
  )
}
