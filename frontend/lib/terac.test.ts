import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDraft, launchDraft } from './terac'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('Terac adapter', () => {
  it('puts the workspace id in the expert task URL', async () => {
    vi.stubEnv('TERAC_API_BASE', 'https://terac.example')
    vi.stubEnv('TERAC_API_KEY', 'server-secret')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://minion.example')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'opp-1',
          pricing: {
            cost_per_participant_cents: 750,
            total_cost_cents: 2250,
          },
        }),
        { status: 200 }
      )
    )

    await createDraft({
      workspaceId: 'ws-1',
      question: 'Compare tools',
      numParticipants: 3,
    })

    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))
    expect(body.tasks[0].task_url).toBe(
      'https://minion.example/sprint?workspaceId=ws-1'
    )
    expect(body.num_participants).toBe(3)
  })

  it('does not report an estimated draft as launched', async () => {
    vi.stubEnv('TERAC_API_BASE', '')
    vi.stubEnv('TERAC_API_KEY', '')
    const result = await launchDraft('estimate-123')
    expect(result.launched).toBe(false)
  })
})
