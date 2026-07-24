import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

const client = new Anthropic() // reads ANTHROPIC_API_KEY
const MODEL = 'claude-opus-4-6'

const DecompositionSchema = z.object({
  subtasks: z.array(z.object({
    title: z.string(),
    brief: z.string(),
  })),
})

export async function decomposeQuestion(question: string): Promise<{ title: string; brief: string }[]> {
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system:
      'You decompose a research question into exactly 6 independent subtasks for non-expert web researchers. ' +
      'Each subtask: ~15 minutes of careful web research, no special expertise, no dependency on other subtasks. ' +
      'brief = 3-5 sentences of concrete instructions including what evidence to collect (URLs required).',
    messages: [{ role: 'user', content: `Research question: ${question}` }],
    output_config: { format: zodOutputFormat(DecompositionSchema) },
  })
  return res.parsed_output!.subtasks.slice(0, 6)
}

export type ChatCtx = {
  question: string
  subtaskTitle: string
  subtaskBrief: string
  codename: string
  graphSummary: string
  history: { sender: 'agent' | 'worker'; content: string }[]
  userMessage: string
}

export async function chatReply(ctx: ChatCtx): Promise<string> {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    output_config: { effort: 'low' },
    system:
      `You are the coordinator agent of a live research sprint. Sprint question: "${ctx.question}". ` +
      `You are talking to researcher "${ctx.codename}" assigned: "${ctx.subtaskTitle}" — ${ctx.subtaskBrief}. ` +
      `Findings so far from other researchers:\n${ctx.graphSummary}\n` +
      'Answer their questions concretely and briefly (2-4 sentences). Point them at what other researchers found when relevant. ' +
      'They must submit at least 2 findings, each with a source URL.',
    messages: [
      ...ctx.history.map((m) => ({
        role: (m.sender === 'agent' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: m.content,
      })),
      { role: 'user', content: ctx.userMessage },
    ],
  })
  const block = res.content.find((b) => b.type === 'text')
  return block && block.type === 'text' ? block.text : 'Got it — keep going!'
}

export type ClassifyInput = {
  newFindings: { id: string; text: string }[]
  existingFindings: { id: string; text: string }[]
}
export type EdgeOut = { from: string; to: string; relation: 'builds_on' | 'references' | 'supports' | 'contradicts'; rationale: string }

const EdgeSchema = z.object({
  edges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    relation: z.enum(['builds_on', 'references', 'supports', 'contradicts']),
    rationale: z.string(),
  })),
})

export async function classifyEdges(input: ClassifyInput): Promise<EdgeOut[]> {
  if (input.existingFindings.length === 0) return []
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    output_config: { effort: 'low', format: zodOutputFormat(EdgeSchema) },
    system:
      'You map relations between research findings. For each NEW finding, compare against EXISTING findings. ' +
      'Emit an edge only for a real, specific relation: builds_on (extends the idea), references (cites same source/work), ' +
      'supports (independent agreement), contradicts (conflict). rationale = one sentence. ' +
      'from = new finding id, to = existing finding id. Most pairs have NO edge — be selective.',
    messages: [{
      role: 'user',
      content: `NEW:\n${input.newFindings.map((f) => `${f.id}: ${f.text}`).join('\n')}\n\nEXISTING:\n${input.existingFindings.map((f) => `${f.id}: ${f.text}`).join('\n')}`,
    }],
  })
  const valid = new Set(input.existingFindings.map((f) => f.id))
  const news = new Set(input.newFindings.map((f) => f.id))
  return res.parsed_output!.edges.filter((e) => news.has(e.from) && valid.has(e.to))
}

export type SynthInput = {
  question: string
  findings: { id: string; text: string; source_url: string; confidence: string; kind: string; subtask: string }[]
  edges: { from: string; to: string; relation: string; rationale: string }[]
}

export async function synthesize(input: SynthInput): Promise<string> {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system:
      'Write a decision-ready markdown research report from crowd-sourced findings. Sections: Summary, Key Findings (cite source URLs), ' +
      'Points of Agreement, Contradictions & Open Questions (use the contradicts edges explicitly), Confidence Notes. ' +
      'Never invent facts beyond the findings. Attribute contradictions to the specific findings involved.',
    messages: [{
      role: 'user',
      content: `Question: ${input.question}\n\nFindings:\n${JSON.stringify(input.findings, null, 1)}\n\nRelations:\n${JSON.stringify(input.edges, null, 1)}`,
    }],
  })
  const block = res.content.find((b) => b.type === 'text')
  return block && block.type === 'text' ? block.text : ''
}
