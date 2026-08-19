// Container (design §4): owns data fetching (TanStack Query, key
// ['carreras']) and ephemeral modal-open state; delegates rendering to the
// presentational CarrerasList/NuevaCarreraModal.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { carrerasApi } from '../adapters/carrerasApi'
import { CarrerasList } from '../components/CarrerasList'
import { NuevaCarreraModal } from '../components/NuevaCarreraModal'
import { Button } from '../../shared/components/ui/button'

interface CarrerasContainerProps {
  /** Navigates to the program detail view. Omit for a static list. */
  onSelectProgram?: (id: number) => void
  /**
   * Injected only by tests. Production reads the clock once per render:
   * "which period is active" is a rendering-time question, so it is never
   * baked into the cached payload (same rule as entregas' groupDeadlines).
   */
  now?: Date
}

export function CarrerasContainer({ onSelectProgram, now }: CarrerasContainerProps = {}): React.JSX.Element {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['carreras'],
    queryFn: carrerasApi.list
  })

  const createMutation = useMutation({
    mutationFn: carrerasApi.create,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['carreras'] })
      setIsModalOpen(false)
    }
  })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-display-lg font-bold text-foreground">Carreras</h1>
          <p className="text-body text-secondary-foreground">
            {data ? `${data.length} carrera${data.length === 1 ? '' : 's'}` : 'Cargando'} · cada una con su calendario y
            su método de evaluación
          </p>
        </div>
        <Button type="button" onClick={() => setIsModalOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Agregar carrera
        </Button>
      </div>

      {isLoading && <p className="text-body-lg text-muted-foreground">Cargando carreras…</p>}
      {isError && <p className="text-body-lg text-destructive">No se pudieron cargar las carreras.</p>}
      {data && <CarrerasList programs={data} now={now ?? new Date()} onSelect={onSelectProgram} />}

      {isModalOpen && (
        <NuevaCarreraModal onSubmit={(input) => createMutation.mutate(input)} onClose={() => setIsModalOpen(false)} />
      )}
    </div>
  )
}
