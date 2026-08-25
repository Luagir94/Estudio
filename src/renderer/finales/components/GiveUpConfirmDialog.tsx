// Presentational: mirrors `materias/components/DeleteSubjectConfirmDialog.tsx`
// and its siblings (`carreras/components/DeletePeriodConfirmDialog.tsx`,
// `DeleteProgramConfirmDialog.tsx`, `entregas/components/
// DeleteDeadlineConfirmDialog.tsx`) — one explicit confirmation before a
// `variant="destructive"` button changes stored data, naming the object and
// stating the consequence in the question, with the confirm button labeled
// with the action rather than "OK".
//
// Unlike the dialogs above, this one is NOT reporting something permanent.
// `SubjectDetail.tsx`'s "Cerrar materia" button is rendered unconditionally
// in the header — it is never gated on the subject's current outcome — so
// `CerrarMateriaModal` stays reachable after giving up, still lets the
// student pick any of `aprobada` / `finalPendiente` / `reprobada`, and
// `materiasApi.setOutcome` (`sqliteSubjectRepository.ts`'s `setOutcome`)
// unconditionally overwrites the stored value. So this copy never says "no
// se puede deshacer" — that would be false here — it says what changes and
// names the exact way back.
//
// Under a 'numerico' program the confirm also offers the aplazo, optional:
// giving up used to hardcode grade null, silently dropping the number the
// student may well have — and an aplazo counts in the promedio con aplazos.
// Same optional-nota pattern as AprobarFinalModal: shared validateGrade runs
// here so the user is told before confirming (main runs it again at the
// write boundary), and both failure modes collapse onto the same app-owned
// Spanish copy.
import { Info } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { validateGrade } from '../../../shared/domain/grading'
import type { SubjectProgram } from '../../../shared/ipc/materias'
import { Button } from '../../shared/components/ui/button'
import { DialogBody, DialogContent, DialogFooter, DialogOverlay } from '../../shared/components/ui/dialog'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'

interface GiveUpConfirmDialogProps {
  subjectName: string
  /**
   * The subject's program — `null` when it has none. Decides whether the
   * confirm may carry an aplazo: only a 'numerico' program shows the field;
   * 'binario' and no-program confirm with grade null, exactly as before.
   */
  program: SubjectProgram | null
  /**
   * Why the outcome was not recorded. A dead confirm button explains
   * nothing. Already app-owned Spanish copy (`shared/lib/ipcErrorCopy.ts`) —
   * never the raw IPC message.
   */
  error?: string | null
  /** True while the write is in flight — the confirm button locks so one decision cannot be recorded twice. */
  pending?: boolean
  /** `null` = reprobada sin nota. */
  onConfirm: (grade: number | null) => void
  onCancel: () => void
}

export function GiveUpConfirmDialog({
  subjectName,
  program,
  error,
  pending,
  onConfirm,
  onCancel
}: GiveUpConfirmDialogProps): React.JSX.Element {
  const { t } = useTranslation('finales')
  const isNumeric = program?.gradingScheme === 'numerico'
  const [grade, setGrade] = useState('')

  const parsedGrade = grade.trim() === '' ? null : Number(grade)

  const gradeError =
    isNumeric &&
    program &&
    parsedGrade !== null &&
    (Number.isNaN(parsedGrade) || !validateGrade(program, parsedGrade).ok)
      ? t('giveUpConfirmDialog.gradeNotANumber', { scale: program.gradeScale })
      : null

  const confirm = (): void => {
    if (gradeError !== null) {
      return
    }
    onConfirm(isNumeric ? parsedGrade : null)
  }

  return (
    <DialogOverlay>
      <DialogContent
        role="dialog"
        aria-label={t('giveUpConfirmDialog.dialogLabel', { name: subjectName })}
        className="max-w-[420px]"
        onDismiss={onCancel}
      >
        <DialogBody className="gap-2">
          <p className="text-body-lg text-foreground">
            {t('giveUpConfirmDialog.confirmQuestion', { name: subjectName })}
          </p>
          <p className="text-body-lg text-secondary-foreground">{t('giveUpConfirmDialog.reversibleHint')}</p>

          {isNumeric && program && (
            <>
              <Label className="mt-2 w-[180px]">
                {t('giveUpConfirmDialog.gradeLabel', { scale: program.gradeScale })}
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
                <p className="text-caption leading-relaxed text-secondary-foreground">
                  {t('giveUpConfirmDialog.infoNote')}
                </p>
              </div>
            </>
          )}

          {error && <p className="text-body-lg text-destructive">{error}</p>}
        </DialogBody>
        <DialogFooter>
          {isNumeric && <p className="text-caption text-muted-foreground">{t('giveUpConfirmDialog.footerNote')}</p>}
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={onCancel}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="button" variant="destructive" disabled={pending || gradeError !== null} onClick={confirm}>
              {t('giveUpConfirmDialog.confirm')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </DialogOverlay>
  )
}
