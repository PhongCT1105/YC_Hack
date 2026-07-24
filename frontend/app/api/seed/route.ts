import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const client = new Anthropic()

const SimFindings = z.object({
  question_to_agent: z.string(),
  findings: z.array(z.object({
    text: z.string(), source_url: z.string(),
    confidence: z.enum(['low', 'medium', 'high']),
    kind: z.enum(['fact', 'interpretation', 'hypothesis']),
  })),
})

export async function POST(req: Request) {
  const origin = new URL(req.url).origin
  const submissionId = `sim-${Math.random().toString(36).slice(2, 10)}`

  // 1. Join like a real worker
  const joinRes = await fetch(`${origin}/api/sprint/join`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ submissionId, kind: 'simulated' }),
  }).then((r) => r.json())
  if (!joinRes.subtask) return NextResponse.json({ error: 'no open subtask' }, { status: 409 })

  // 2. AI stand-in performs the research (from model knowledge; sources are best-effort real URLs)
  const res = await client.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 4096,
    output_config: { effort: 'low', format: zodOutputFormat(SimFindings) },
    system:
      'You are an AI stand-in researcher in a demo. Produce 2-3 plausible, specific findings for the subtask ' +
      'with real-looking source URLs (official pricing/docs pages where you know them). Also produce one short ' +
      'clarifying question a researcher might ask the coordinator.',
    messages: [{ role: 'user', content: `Subtask: ${joinRes.subtask.title}\n${joinRes.subtask.brief}` }],
  })
  const sim = res.parsed_output!

  // 3. Ask the coordinator one question (exercises the chat pipeline)
  await fetch(`${origin}/api/sprint/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ submissionId, message: sim.question_to_agent }),
  })

  // 4. Submit findings (sim participants get no Terac redirect)
  await fetch(`${origin}/api/sprint/submit`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ submissionId, findings: sim.findings }),
  })

  return NextResponse.json({ submissionId, codename: joinRes.participant.codename })
}
