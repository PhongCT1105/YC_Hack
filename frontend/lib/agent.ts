import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

const client = new Anthropic() // reads ANTHROPIC_API_KEY
const MODEL = 'claude-opus-5'
// Worker-facing calls (chatReply, extractFindings) run on every chat turn for
// every participant — high volume, low-stakes-per-call. Haiku is far cheaper
// and fast enough for interview chat + extraction; the heavier planning/
// synthesis calls (decomposeQuestion, synthesize, classifyEdges) stay on
// Opus since they run once per sprint/subtask and need stronger reasoning.
// Haiku doesn't support the same `effort` tuning as Opus, so it's omitted
// entirely on these two calls rather than risk an unsupported param.
const WORKER_MODEL = 'claude-haiku-4-5'

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
  peerFindings?: { codename: string; text: string }[]
}

export async function chatReply(ctx: ChatCtx): Promise<string> {
  const peerLines = (ctx.peerFindings ?? [])
    .map((p) => `- ${p.codename}: ${p.text}`)
    .join('\n')
  const res = await client.messages.create({
    model: WORKER_MODEL,
    max_tokens: 1024,
    system:
      `You are the coordinator agent running a live, chat-first research interview. Sprint question: "${ctx.question}". ` +
      `You are interviewing researcher "${ctx.codename}" on their assigned subtask: "${ctx.subtaskTitle}" — ${ctx.subtaskBrief}. ` +
      `Findings so far from other researchers:\n${ctx.graphSummary}\n` +
      (peerLines
        ? `Peer claims awaiting review from ${ctx.codename}:\n${peerLines}\n` +
          'When it fits naturally, reference ONE of these peer findings by the author\'s codename and ask whether ' +
          'the worker agrees, can build on it, or has research that contradicts it — but do not force this every turn. ' +
          'There is a separate card in the UI for actually reviewing peer claims, so just nudge them toward it in conversation.\n'
        : '') +
      'There is no findings form — everything happens in this chat. Interview them like a sharp editor: ' +
      'ask what they found AND what they personally think about it (their take, their read on it, not just facts). ' +
      'Every time they state a claim or fact, press them for a source URL for that specific claim ("what\'s your source for that? paste the URL"). ' +
      'Ask ONE question at a time — do not stack multiple questions in one reply. ' +
      'When they give you a well-sourced finding or a clear opinion, briefly acknowledge it was captured before asking the next thing. ' +
      'Point them at what other researchers found when relevant. Keep replies to 2-4 sentences, concrete and conversational. ' +
      'They need at least 2 distinct findings, at least 2 with a source URL, and at least 1 that is their own interpretation/opinion.',
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

export type ExtractCtx = {
  question: string
  subtaskTitle: string
  subtaskBrief: string
  transcript: { sender: 'agent' | 'worker'; content: string }[]
}

const ExtractedFindingSchema = z.object({
  text: z.string(),
  source_url: z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  kind: z.enum(['fact', 'interpretation', 'hypothesis']),
})

const ExtractFindingsSchema = z.object({
  findings: z.array(ExtractedFindingSchema),
})

export type ExtractedFinding = z.infer<typeof ExtractedFindingSchema>

export async function extractFindings(ctx: ExtractCtx): Promise<{ findings: ExtractedFinding[] }> {
  const res = await client.messages.parse({
    model: WORKER_MODEL,
    max_tokens: 4096,
    output_config: { format: zodOutputFormat(ExtractFindingsSchema) },
    system:
      `You extract structured findings from a research-interview chat transcript. ` +
      `Sprint question: "${ctx.question}". Subtask: "${ctx.subtaskTitle}" — ${ctx.subtaskBrief}. ` +
      'Extract ONLY claims the WORKER (not the coordinator/agent) actually made in the transcript — do not invent, ' +
      'infer, or pad with anything they did not say. Each finding: ' +
      '"text" = the claim in the worker\'s own words (concise); ' +
      '"source_url" = a URL that literally appears in the transcript supporting that specific claim, or "" if none was given; ' +
      '"kind" = "interpretation" for the worker\'s own opinions/reads/hypotheses about the topic, "hypothesis" for speculative claims, ' +
      '"fact" for factual claims about the world; ' +
      '"confidence" = "high" if sourced with a URL and stated plainly, "medium" if sourced loosely, "low" if unsourced or hedged. ' +
      'If the worker made no extractable claims yet, return an empty findings array.',
    messages: [{
      role: 'user',
      content: `Transcript:\n${ctx.transcript.map((m) => `${m.sender}: ${m.content}`).join('\n')}`,
    }],
  })
  return res.parsed_output ?? { findings: [] }
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
