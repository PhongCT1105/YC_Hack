import { Suspense } from 'react'
import WorkspaceClient from '@/components/sprint/WorkspaceClient'

export default function SprintPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950 text-gray-400 flex items-center justify-center">Loading…</div>}>
      <WorkspaceClient />
    </Suspense>
  )
}
