import { useMutation, useQueryClient } from '@tanstack/react-query'
import { post, type AppRow } from '@/lib/api'
import { ConfirmActions, Dialog } from './ui'

/** Asks before box installs or removes an app, then starts the job. */
export function JobConfirm({
  app,
  kind,
  onClose,
  onStarted,
}: {
  app: AppRow | null
  kind: 'install' | 'remove'
  onClose: () => void
  onStarted: (id: string, name: string) => void
}) {
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: () => post<{ id: string }>('/api/jobs', { kind, app: app!.id }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['jobs'] })
      onStarted(r.id, app!.name)
      onClose()
    },
  })
  if (!app) return null
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={kind === 'install' ? `Install ${app.name}?` : `Remove ${app.name}?`}
      description={
        kind === 'install'
          ? `box installs ${app.name} with its default settings for the swizzin users. It can take a few minutes.`
          : `box removes ${app.name} from the server. Depending on the app, its settings may be deleted too.`
      }
    >
      <ConfirmActions
        error={m.error}
        busy={m.isPending}
        label={kind === 'install' ? `Install ${app.name}` : `Remove ${app.name}`}
        variant={kind === 'install' ? 'primary' : 'danger'}
        onCancel={onClose}
        onConfirm={() => m.mutate()}
      />
    </Dialog>
  )
}
