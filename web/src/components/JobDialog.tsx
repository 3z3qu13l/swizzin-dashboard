import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { get, type Job } from '@/lib/api'
import { Badge, Dialog } from './ui'

/** Follows a box install or remove while it runs, then shows how it ended. */
export function JobDialog({ id, name, onClose }: { id: string | null; name: string; onClose: () => void }) {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['job', id],
    queryFn: () => get<Job>(`/api/jobs/${id}`),
    enabled: !!id,
    // stops once the job has ended, or when it cannot be read any more
    refetchInterval: (query) => (query.state.status === 'error' ? false : query.state.data?.state === 'running' || !query.state.data ? 1500 : false),
  })
  const job = q.data
  const state = job?.state
  const pre = useRef<HTMLPreElement>(null)
  useEffect(() => {
    const el = pre.current
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight
  }, [job?.log])
  useEffect(() => {
    if (state && state !== 'running') {
      void qc.invalidateQueries({ queryKey: ['apps'] })
      void qc.invalidateQueries({ queryKey: ['jobs'] })
    }
  }, [state, qc])

  const verb = job?.kind === 'remove' ? 'Removing' : 'Installing'
  const done = job?.kind === 'remove' ? 'removed' : 'installed'
  return (
    <Dialog
      open={!!id}
      onOpenChange={(o) => !o && onClose()}
      wide
      title={`${verb} ${name}`}
      description="box runs on the server. You can close this window, the job keeps going."
    >
      <div className="mb-3 flex items-center gap-2 text-sm" role="status">
        {q.error ? (
          <Badge tone="red">
            <XCircle className="size-3.5" /> {q.error.message}
          </Badge>
        ) : !job || job.state === 'running' ? (
          <Badge tone="blue">
            <Loader2 className="size-3.5 animate-spin" /> Running
          </Badge>
        ) : job.state === 'success' ? (
          <Badge tone="green">
            <CheckCircle2 className="size-3.5" /> {name} {done}
          </Badge>
        ) : (
          <Badge tone="red">
            <XCircle className="size-3.5" /> Failed{job.exitCode != null ? `, exit code ${job.exitCode}` : ''}
          </Badge>
        )}
      </div>
      <pre
        ref={pre}
        aria-label="box log"
        className="h-80 overflow-auto rounded-lg border border-line bg-bg p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-muted"
      >
        {job?.log || 'Waiting for box to start…'}
      </pre>
      {job?.state === 'failed' && <p className="mt-3 text-sm text-muted">The full log is in /root/logs/swizzin.log on the server.</p>}
    </Dialog>
  )
}
