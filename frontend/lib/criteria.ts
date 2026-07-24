// Shared criteria engine: decides when a worker's chat thread has produced
// enough sourced findings + opinion to unlock submission.

export type CriteriaFinding = {
  text?: string
  source_url: string | null
  confidence?: string
  kind: string
}

export type CriteriaBucket = { have: number; need: number }

export type Criteria = {
  claims: CriteriaBucket
  sourced: CriteriaBucket
  opinion: CriteriaBucket
  peerReview: CriteriaBucket
  met: boolean
}

const NEED = { claims: 2, sourced: 2, opinion: 1 }

export function computeCriteria(
  findings: CriteriaFinding[],
  peerReviewInput?: { peerClaimsAvailable: number; reviewsDone: number }
): Criteria {
  const claims = findings.length
  const sourced = findings.filter((f) => typeof f.source_url === 'string' && f.source_url.startsWith('http')).length
  const opinion = findings.filter((f) => f.kind === 'interpretation' || f.kind === 'hypothesis').length

  const claimsBucket = { have: claims, need: NEED.claims }
  const sourcedBucket = { have: sourced, need: NEED.sourced }
  const opinionBucket = { have: opinion, need: NEED.opinion }

  const reviewsDone = peerReviewInput?.reviewsDone ?? 0
  const peerReviewNeed = (peerReviewInput?.peerClaimsAvailable ?? 0) > 0 || reviewsDone > 0 ? 1 : 0
  const peerReviewBucket = { have: reviewsDone, need: peerReviewNeed }

  const met =
    claimsBucket.have >= claimsBucket.need &&
    sourcedBucket.have >= sourcedBucket.need &&
    opinionBucket.have >= opinionBucket.need &&
    peerReviewBucket.have >= peerReviewBucket.need

  return { claims: claimsBucket, sourced: sourcedBucket, opinion: opinionBucket, peerReview: peerReviewBucket, met }
}
