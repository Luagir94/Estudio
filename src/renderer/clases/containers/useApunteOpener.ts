// The one way any screen opens a class apunte: resolve the attachment behind
// it, creating the document first when that class has none, and hand it to
// whoever is going to render the editor.
//
// It lives here rather than in each screen because THREE surfaces reach an
// apunte — a ClassRow in Hoy, a Horario block, and the APUNTES list — and the
// "does it exist yet?" rule must not be written three times. The screens keep
// only what is genuinely theirs: which class was clicked, and where the
// editor gets rendered.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Attachment } from '../../../shared/ipc/adjuntos'
import { adjuntosApi } from '../../adjuntos/adapters/adjuntosApi'
import { clasesApi } from '../adapters/clasesApi'
import { formatClassDateLong } from '../domain/classDate'

/**
 * The text a brand-new apunte is born with.
 *
 * NOT empty, and that is load-bearing: an apunte with no text is no apunte —
 * `saveClassNote` deletes it — so creating one and opening the editor on it
 * would delete the document in the same breath that created it. The heading
 * names the class without inventing anything about what happened in it, and
 * doubles as the preview line the APUNTES list shows until the student writes
 * a real one.
 */
export function seedApunte(date: string): string {
  return `# Clase del ${formatClassDateLong(date)}\n\n`
}

export interface OpenApunteInput {
  subjectId: number
  /** Local calendar date, `YYYY-MM-DD` — the class the apunte belongs to. */
  date: string
}

/**
 * Returns `openApunte`, which resolves (or creates) the class's apunte and
 * calls `onOpen` with the attachment the editor needs.
 *
 * The attachment is FETCHED rather than synthesised: the editor's header
 * renders a real size and a real index status, and inventing those would put
 * false numbers on screen.
 */
export function useApunteOpener(onOpen: (attachment: Attachment) => void): {
  openApunte: (input: OpenApunteInput) => void
  isCreating: boolean
  error: unknown
} {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ subjectId, date }: OpenApunteInput) => {
      // Whether the class already HAS an apunte is answered here, from the
      // attachments themselves — never asked of the caller.
      //
      // That is not convenience, it is a safety property: `saveClassNote`
      // upserts on `(subjectId, classDate)`, so a caller that wrongly said
      // "this class has none" would overwrite a real apunte with the seed and
      // destroy it. No caller can get that wrong if no caller is asked.
      //
      // `fetchQuery` on the SAME key the adjuntos list and the editor share,
      // so opening an apunte from a screen that already had the list costs
      // nothing.
      const listApuntes = (): Promise<Attachment[]> =>
        queryClient.fetchQuery({ queryKey: ['adjuntos', subjectId], queryFn: () => adjuntosApi.list(subjectId) })

      const existing = (await listApuntes()).find((row) => row.classDate === date)
      if (existing) {
        return existing
      }

      const { apunteId } = await clasesApi.saveNote({ subjectId, date, body: seedApunte(date) })

      // The new apunte is a new row in all three of these. The adjuntos list
      // is AWAITED because the fetch below reads it; the other two are the
      // lists that must stop claiming this class has no apunte.
      await queryClient.invalidateQueries({ queryKey: ['adjuntos', subjectId] })
      void queryClient.invalidateQueries({ queryKey: ['materias', 'detail', subjectId] })
      void queryClient.invalidateQueries({ queryKey: ['hoy', 'dashboard'] })

      const created = (await listApuntes()).find((row) => row.id === apunteId)
      if (!created) {
        throw new Error(`Apunte ${apunteId} for subject ${subjectId} was written but could not be read back`)
      }
      return created
    },
    onSuccess: onOpen
  })

  return {
    openApunte: (input) => mutation.mutate(input),
    isCreating: mutation.isPending,
    error: mutation.error
  }
}
