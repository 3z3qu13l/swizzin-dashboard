import { useState } from 'react'
import { serverTime } from '@/lib/api'
import { useRunningJob } from '@/lib/queries'
import { ago } from '@/lib/format'
import { JobDialog } from './JobDialog'

/** The install or removal box is running, with its progress one click away: Install and Remove wait for it. */
export function RunningJob() {
  const [open, setOpen] = useState(false)
  const running = useRunningJob()
  if (!running) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-lg border border-info/30 bg-info/10 px-4 py-2.5 text-left text-sm"
      >
        <span className="size-2 animate-pulse rounded-full bg-info" />
        box is {running.kind === 'install' ? 'installing' : 'removing'} {running.app}, started {ago(serverTime(running.startedAt))}. Install and Remove wait for
        it. Show progress
      </button>
      <JobDialog id={open ? running.id : null} name={running.app} onClose={() => setOpen(false)} />
    </>
  )
}
