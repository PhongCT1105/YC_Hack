// Terac adapter — talks to the Terac recruitment API when configured, and
// falls back to an empirically-observed cost estimate when it isn't (e.g.
// local dev without TERAC_API_BASE / TERAC_API_KEY set).

import { buildExpertTaskUrl } from './workspaceDomain'

const ESTIMATED_PER_HEAD_CENTS = 750 // empirically observed Terac price for this config

export function teracConfigured(): boolean {
  return Boolean(process.env.TERAC_API_BASE && process.env.TERAC_API_KEY)
}

export type DraftResult = {
  id: string
  perHeadCents: number
  totalCents: number
  estimated: boolean
}

export type CreateDraftInput = {
  workspaceId: string
  question: string
  numParticipants: number
}

export async function createDraft(input: CreateDraftInput): Promise<DraftResult> {
  const numParticipants = Math.max(
    1,
    Math.min(20, Math.round(input.numParticipants))
  )

  if (!teracConfigured()) {
    return {
      id: `estimate-${Date.now()}`,
      perHeadCents: ESTIMATED_PER_HEAD_CENTS,
      totalCents: ESTIMATED_PER_HEAD_CENTS * numParticipants,
      estimated: true,
    }
  }

  const base = process.env.TERAC_API_BASE!.replace(/\/$/, '')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    throw new Error('NEXT_PUBLIC_APP_URL is required for Terac recruitment')
  }

  const res = await fetch(`${base}/api/external/v2/opportunities`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.TERAC_API_KEY}`,
    },
    body: JSON.stringify({
      title: input.question.slice(0, 100),
      project_id: process.env.TERAC_PROJECT_ID || undefined,
      num_participants: numParticipants,
      business_type: 'b2c',
      description:
        'Join a live, agent-coordinated research sprint. Research one focused subtask, ' +
        'chat with the coordinator, and submit sourced findings.',
      tasks: [
        {
          sequence: 1,
          task_type: 'activity',
          review_type: 'auto_approve',
          task_url: buildExpertTaskUrl(appUrl, input.workspaceId),
          duration_minutes: 15,
          title: 'Coordinated research subtask',
        },
      ],
    }),
  })

  if (!res.ok) {
    throw new Error(`Terac createDraft failed: ${res.status} ${await res.text().catch(() => '')}`)
  }

  const data = await res.json()
  return {
    id: data.id,
    perHeadCents: data.pricing?.cost_per_participant_cents ?? 0,
    totalCents: data.pricing?.total_cost_cents ?? 0,
    estimated: false,
  }
}

export type LaunchResult = { launched: boolean; note: string }

export async function launchDraft(id: string): Promise<LaunchResult> {
  if (!teracConfigured() || id.startsWith('estimate-')) {
    return {
      launched: false,
      note:
        'Terac API not connected — the PM will launch this from their Terac session; the workspace is ready for workers either way.',
    }
  }

  const base = process.env.TERAC_API_BASE!.replace(/\/$/, '')
  const res = await fetch(`${base}/api/external/v2/opportunities/${id}/launch`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.TERAC_API_KEY}` },
  })

  if (!res.ok) {
    throw new Error(`Terac launchDraft failed: ${res.status} ${await res.text().catch(() => '')}`)
  }

  return { launched: true, note: 'recruitment live on Terac' }
}
