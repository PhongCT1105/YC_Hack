import { db } from '@/lib/db'

export type PeerClaim = {
  id: string
  text: string
  source_url: string | null
  codename: string
  subtaskTitle: string
}

// Findings from OTHER submissions in the same sprint that this worker hasn't
// reviewed yet (and isn't the author of). Used both for the UI card and for
// the peerReview criteria bucket.
export async function getPeerClaims(sprintId: string, submissionId: string, limit = 3): Promise<PeerClaim[]> {
  const { data: subtasks } = await db.from('subtasks').select('id,title').eq('sprint_id', sprintId)
  const subtaskIds = (subtasks ?? []).map((s) => s.id)
  if (!subtaskIds.length) return []
  const titleById = new Map((subtasks ?? []).map((s) => [s.id, s.title]))

  const { data: findings } = await db
    .from('findings')
    .select('id,text,source_url,submission_id,subtask_id')
    .in('subtask_id', subtaskIds)
    .neq('submission_id', submissionId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (!findings?.length) return []

  const { data: reviewed } = await db
    .from('claim_reviews')
    .select('finding_id')
    .eq('reviewer_submission_id', submissionId)
  const reviewedIds = new Set((reviewed ?? []).map((r) => r.finding_id))

  const candidates = findings.filter((f) => !reviewedIds.has(f.id))
  if (!candidates.length) return []

  const authorIds = Array.from(new Set(candidates.map((f) => f.submission_id)))
  const { data: authors } = await db.from('participants').select('submission_id,codename').in('submission_id', authorIds)
  const codenameById = new Map((authors ?? []).map((a) => [a.submission_id, a.codename]))

  return candidates.slice(0, limit).map((f) => ({
    id: f.id,
    text: f.text,
    source_url: f.source_url,
    codename: codenameById.get(f.submission_id) ?? '?',
    subtaskTitle: titleById.get(f.subtask_id) ?? '',
  }))
}

// Count of this worker's reviews with a real verdict (skip doesn't count).
export async function getReviewsDone(submissionId: string): Promise<number> {
  const { count } = await db
    .from('claim_reviews')
    .select('*', { count: 'exact', head: true })
    .eq('reviewer_submission_id', submissionId)
    .in('verdict', ['agree', 'disagree'])
  return count ?? 0
}
