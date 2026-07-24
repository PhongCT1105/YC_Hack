# Live Research Sprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agent-coordinated research sprint: anonymous Terac-recruited humans land in a Next.js workspace, get assigned subtasks, chat with an AI coordinator, and submit findings that grow a live knowledge graph, with a Minion HQ dashboard and simulated-expert fallback.

**Architecture:** Single Next.js 14 app (existing `frontend/`) on Vercel. Supabase Postgres for all state (RLS disabled on sprint tables; anon key used server-side only). The agent = Claude API calls inside API routes (decompose, chat, classify finding relations, synthesize). Frontend polls every 3s. Terac appends `?submissionId=` to the one task URL; the workspace differentiates per person at arrival.

**Tech Stack:** Next.js 14.2.3 (app router), TypeScript, Tailwind, three.js (existing), `@supabase/supabase-js`, `@anthropic-ai/sdk`, `zod`, `reactflow`.

## Global Constraints

- All new code lives inside `frontend/` (the existing app). Import alias `@/` maps to `frontend/` root.
- Claude model: `claude-opus-5` exactly, everywhere. Chat + edge classification use `output_config: {effort: "low"}`; decomposition + synthesis omit effort (default high).
- Structured JSON: `client.messages.parse()` with `output_config: {format: zodOutputFormat(Schema)}` and read `response.parsed_output`. Never string-parse model text for JSON.
- Every API route: `export const dynamic = 'force-dynamic'` and `export const maxDuration = 60`.
- Env vars (server-side only, never `NEXT_PUBLIC_` except the callback URL): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_TERAC_CALLBACK_URL` (may be empty — see Task 3).
- Participant kinds: `real` | `simulated`. Simulated participants are labeled "AI stand-in" in every UI surface. Never present simulated work as human.
- Verification is `npm run build` + curl against `npm run dev` (no test framework in the repo; 5-hour budget). Commit after each task.

## Task 0 (PM — main session, NOT a subagent): Infrastructure

The PM (main Claude session) does this directly because it needs MCP tools (Supabase) and user-account auth (Vercel).

- [ ] Check `mcp__claude_ai_Supabase__list_projects`; if none usable, create one (confirm cost with user first).
- [ ] Apply migration (below) via `apply_migration`, name `research_sprint_init`.
- [ ] Get `get_project_url` + `get_publishable_keys` → record as `SUPABASE_URL` / `SUPABASE_ANON_KEY`.
- [ ] Ask user for `ANTHROPIC_API_KEY`.
- [ ] Write `frontend/.env.local` with the three vars + empty `NEXT_PUBLIC_TERAC_CALLBACK_URL`.
- [ ] After Task 1 merges: deploy `frontend/` to Vercel (vercel:deploy skill), set the same env vars, get prod URL.
- [ ] Terac launch runbook (after Task 3 gives a working `/sprint`): delete draft `ki1k2jrpct4ch9821bqhwxkn`, recreate identical with `task_url = https://<prod>/sprint`, **get explicit user approval for the spend**, launch via `terac_launch_draft_opportunity`. Poll `terac_get_submissions` every ~2 min.

Migration SQL (apply exactly):

```sql
create table sprints (
  id text primary key default ('sp_' || substr(md5(random()::text), 1, 12)),
  question text not null,
  status text not null default 'active', -- active | synthesizing | complete
  report_md text,
  created_at timestamptz not null default now()
);

create table subtasks (
  id text primary key default ('st_' || substr(md5(random()::text), 1, 12)),
  sprint_id text not null references sprints(id),
  title text not null,
  brief text not null,
  status text not null default 'open', -- open | claimed | submitted
  claimed_by text,
  claimed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table participants (
  submission_id text primary key,
  sprint_id text not null references sprints(id),
  codename text not null,
  kind text not null default 'real', -- real | simulated
  status text not null default 'active', -- active | done | abandoned
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table findings (
  id text primary key default ('f_' || substr(md5(random()::text), 1, 12)),
  subtask_id text not null references subtasks(id),
  submission_id text not null references participants(submission_id),
  text text not null,
  source_url text not null,
  confidence text not null default 'medium', -- low | medium | high
  kind text not null default 'fact', -- fact | interpretation | hypothesis
  created_at timestamptz not null default now()
);

create table edges (
  id text primary key default ('e_' || substr(md5(random()::text), 1, 12)),
  sprint_id text not null references sprints(id),
  from_finding text not null references findings(id),
  to_finding text not null references findings(id),
  relation text not null, -- builds_on | references | supports | contradicts
  rationale text not null default '',
  created_at timestamptz not null default now()
);

create table messages (
  id bigint generated always as identity primary key,
  submission_id text not null references participants(submission_id),
  sender text not null, -- agent | worker
  content text not null,
  ts timestamptz not null default now()
);

create table events (
  id bigint generated always as identity primary key,
  sprint_id text not null references sprints(id),
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  ts timestamptz not null default now()
);

-- Atomic claim: hand the next open subtask to a participant, or return the one
-- they already hold (idempotent on refresh).
create or replace function claim_subtask(p_sprint_id text, p_submission_id text)
returns setof subtasks language plpgsql as $$
declare existing subtasks;
begin
  select * into existing from subtasks
    where sprint_id = p_sprint_id and claimed_by = p_submission_id and status = 'claimed' limit 1;
  if found then return next existing; return; end if;
  return query
    update subtasks set status = 'claimed', claimed_by = p_submission_id,
      claimed_at = now(), updated_at = now()
    where id = (
      select id from subtasks
      where sprint_id = p_sprint_id and status = 'open'
      order by id limit 1
      for update skip locked)
    returning *;
end $$;

-- Release stale claims (idle > 20 min) back to the pool.
create or replace function release_stale_claims(p_sprint_id text)
returns int language plpgsql as $$
declare n int;
begin
  with released as (
    update subtasks set status = 'open', claimed_by = null, claimed_at = null, updated_at = now()
    where sprint_id = p_sprint_id and status = 'claimed' and claimed_at < now() - interval '20 minutes'
    returning claimed_by)
  , marked as (
    update participants set status = 'abandoned'
    where submission_id in (select claimed_by from released) and status = 'active'
    returning 1)
  select count(*) into n from marked;
  return n;
end $$;

alter table sprints disable row level security;
alter table subtasks disable row level security;
alter table participants disable row level security;
alter table findings disable row level security;
alter table edges disable row level security;
alter table messages disable row level security;
alter table events disable row level security;
```

---

### Task 1: Backend foundation — deps, db client, agent lib, sprint init API

**Files:**
- Modify: `frontend/package.json` (add deps)
- Create: `frontend/lib/db.ts`
- Create: `frontend/lib/agent.ts`
- Create: `frontend/lib/codenames.ts`
- Create: `frontend/app/api/sprint/init/route.ts`
- Create: `frontend/app/api/health/route.ts`

**Interfaces:**
- Consumes: env vars from Task 0; tables from the migration.
- Produces: `db` (Supabase client singleton); `decomposeQuestion(question: string): Promise<{title: string; brief: string}[]>`; `chatReply(ctx: ChatCtx): Promise<string>`; `classifyEdges(input: ClassifyInput): Promise<EdgeOut[]>`; `synthesize(input: SynthInput): Promise<string>`; `randomCodename(): string`; `POST /api/sprint/init {question?} -> {sprintId, subtasks}`; `GET /api/health -> {ok, db}`.

- [ ] **Step 1: Install deps**

Run in `frontend/`: `npm install @supabase/supabase-js @anthropic-ai/sdk zod reactflow`

- [ ] **Step 2: Write `frontend/lib/db.ts`**

```typescript
import { createClient } from '@supabase/supabase-js'

// Server-side only. Anon key is fine: RLS is disabled and this module is
// never imported from client components.
export const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
)
```

- [ ] **Step 3: Write `frontend/lib/codenames.ts`**

```typescript
const COLORS = ['Indigo', 'Amber', 'Coral', 'Jade', 'Slate', 'Violet', 'Crimson', 'Teal', 'Ochre', 'Pearl']
const ANIMALS = ['Fox', 'Owl', 'Lynx', 'Heron', 'Otter', 'Falcon', 'Badger', 'Ibis', 'Marten', 'Wren']

export function randomCodename(): string {
  const c = COLORS[Math.floor(Math.random() * COLORS.length)]
  const a = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
  return `${c} ${a}`
}
```

- [ ] **Step 4: Write `frontend/lib/agent.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

const client = new Anthropic() // reads ANTHROPIC_API_KEY
const MODEL = 'claude-opus-5'

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
```

- [ ] **Step 5: Write `frontend/app/api/health/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const { error } = await db.from('sprints').select('id').limit(1)
  return NextResponse.json({ ok: !error, db: error ? error.message : 'connected' })
}
```

- [ ] **Step 6: Write `frontend/app/api/sprint/init/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { decomposeQuestion } from '@/lib/agent'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DEFAULT_QUESTION =
  'Compare 6 leading AI coding assistants (GitHub Copilot, Cursor, Claude Code, Windsurf, Aider, Replit Agent): current pricing, one sourced user complaint, and one differentiator each.'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const question: string = body.question || DEFAULT_QUESTION

  const subtasks = await decomposeQuestion(question)
  const { data: sprint, error } = await db.from('sprints').insert({ question }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = subtasks.map((s) => ({ sprint_id: sprint.id, title: s.title, brief: s.brief }))
  const { data: inserted, error: e2 } = await db.from('subtasks').insert(rows).select()
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  await db.from('events').insert({ sprint_id: sprint.id, type: 'SPRINT_CREATED', payload: { question } })
  return NextResponse.json({ sprintId: sprint.id, subtasks: inserted })
}
```

- [ ] **Step 7: Verify**

Run `npm run build` in `frontend/` — expect success. Then `npm run dev` and:
`curl -s localhost:3000/api/health` → `{"ok":true,"db":"connected"}`
`curl -s -X POST localhost:3000/api/sprint/init -H 'content-type: application/json' -d '{}'` → JSON with `sprintId` and 6 subtasks.

- [ ] **Step 8: Commit**

```bash
git add frontend && git commit -m "feat: backend foundation — db client, agent lib, sprint init"
```

---

### Task 2: Worker join/claim + sprint state API

**Files:**
- Create: `frontend/app/api/sprint/join/route.ts`
- Create: `frontend/app/api/sprint/state/route.ts`

**Interfaces:**
- Consumes: `db`, `randomCodename`, `claim_subtask` + `release_stale_claims` RPCs.
- Produces: `POST /api/sprint/join {submissionId} -> {participant, subtask, sprint}`; `GET /api/sprint/state?submissionId=X -> {participant, subtask, sprint, messages, findingsCount}`. Both auto-target the most recent active sprint.

- [ ] **Step 1: Write `frontend/app/api/sprint/join/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { randomCodename } from '@/lib/codenames'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const { submissionId, kind } = await req.json()
  if (!submissionId) return NextResponse.json({ error: 'submissionId required' }, { status: 400 })

  const { data: sprint } = await db.from('sprints').select().eq('status', 'active')
    .order('created_at', { ascending: false }).limit(1).single()
  if (!sprint) return NextResponse.json({ error: 'no active sprint' }, { status: 404 })

  await db.rpc('release_stale_claims', { p_sprint_id: sprint.id })

  // Upsert participant (idempotent on refresh)
  const { data: existing } = await db.from('participants').select().eq('submission_id', submissionId).single()
  let participant = existing
  if (!participant) {
    const { data: created, error } = await db.from('participants').insert({
      submission_id: submissionId, sprint_id: sprint.id,
      codename: randomCodename(), kind: kind === 'simulated' ? 'simulated' : 'real',
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    participant = created
    await db.from('events').insert({ sprint_id: sprint.id, type: 'PARTICIPANT_JOINED', payload: { submissionId, codename: created.codename, kind: created.kind } })
  } else {
    await db.from('participants').update({ last_seen: new Date().toISOString() }).eq('submission_id', submissionId)
  }

  const { data: claimed } = await db.rpc('claim_subtask', { p_sprint_id: sprint.id, p_submission_id: submissionId })
  const subtask = Array.isArray(claimed) ? claimed[0] : claimed
  if (subtask && subtask.status === 'claimed') {
    await db.from('events').insert({ sprint_id: sprint.id, type: 'SUBTASK_CLAIMED', payload: { subtaskId: subtask.id, submissionId } })
    // Greeting message if first time
    const { count } = await db.from('messages').select('*', { count: 'exact', head: true }).eq('submission_id', submissionId)
    if (!count) {
      await db.from('messages').insert({
        submission_id: submissionId, sender: 'agent',
        content: `Hi ${participant.codename}! Your subtask: **${subtask.title}**. ${subtask.brief} Submit at least 2 findings, each with a source URL. Ask me anything.`,
      })
    }
  }

  return NextResponse.json({ participant, subtask: subtask ?? null, sprint })
}
```

- [ ] **Step 2: Write `frontend/app/api/sprint/state/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const submissionId = new URL(req.url).searchParams.get('submissionId')
  if (!submissionId) return NextResponse.json({ error: 'submissionId required' }, { status: 400 })

  const { data: participant } = await db.from('participants').select().eq('submission_id', submissionId).single()
  if (!participant) return NextResponse.json({ error: 'not joined' }, { status: 404 })

  await db.from('participants').update({ last_seen: new Date().toISOString() }).eq('submission_id', submissionId)

  const { data: sprint } = await db.from('sprints').select().eq('id', participant.sprint_id).single()
  const { data: subtask } = await db.from('subtasks').select()
    .eq('claimed_by', submissionId).in('status', ['claimed', 'submitted'])
    .order('claimed_at', { ascending: false }).limit(1).maybeSingle()
  const { data: messages } = await db.from('messages').select().eq('submission_id', submissionId).order('ts')
  const { count: findingsCount } = await db.from('findings').select('*', { count: 'exact', head: true }).eq('submission_id', submissionId)

  return NextResponse.json({ participant, sprint, subtask, messages: messages ?? [], findingsCount: findingsCount ?? 0 })
}
```

- [ ] **Step 3: Verify**

With dev server running (needs a sprint from Task 1's curl):
`curl -s -X POST localhost:3000/api/sprint/join -H 'content-type: application/json' -d '{"submissionId":"test-1"}'` → participant with codename + claimed subtask.
Repeat same curl → same subtask (idempotent). `curl -s -X POST ... -d '{"submissionId":"test-2"}'` → a *different* subtask.
`curl -s 'localhost:3000/api/sprint/state?submissionId=test-1'` → state with 1 agent greeting message.

- [ ] **Step 4: Commit**

```bash
git add frontend && git commit -m "feat: worker join/claim with atomic assignment and state polling"
```

---

### Task 3: Findings submit + edge classification + chat API

**Files:**
- Create: `frontend/app/api/sprint/submit/route.ts`
- Create: `frontend/app/api/sprint/chat/route.ts`
- Create: `frontend/lib/graphSummary.ts`

**Interfaces:**
- Consumes: `db`, `classifyEdges`, `chatReply`.
- Produces: `POST /api/sprint/submit {submissionId, findings: [{text, source_url, confidence, kind}]} -> {ok, redirect}`; `POST /api/sprint/chat {submissionId, message} -> {reply}`; `buildGraphSummary(sprintId): Promise<string>` (compact text of all findings for prompts).

- [ ] **Step 1: Write `frontend/lib/graphSummary.ts`**

```typescript
import { db } from '@/lib/db'

export async function buildGraphSummary(sprintId: string): Promise<string> {
  const { data: subtasks } = await db.from('subtasks').select('id,title').eq('sprint_id', sprintId)
  if (!subtasks?.length) return '(no findings yet)'
  const ids = subtasks.map((s) => s.id)
  const { data: findings } = await db.from('findings').select('subtask_id,text,confidence').in('subtask_id', ids).limit(60)
  if (!findings?.length) return '(no findings yet)'
  const byTask = new Map(subtasks.map((s) => [s.id, s.title]))
  return findings.map((f) => `- [${byTask.get(f.subtask_id)}] (${f.confidence}) ${f.text}`).join('\n')
}
```

- [ ] **Step 2: Write `frontend/app/api/sprint/submit/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { classifyEdges } from '@/lib/agent'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const { submissionId, findings } = await req.json()
  if (!submissionId || !Array.isArray(findings) || findings.length < 2)
    return NextResponse.json({ error: 'submissionId and >=2 findings required' }, { status: 400 })
  for (const f of findings) {
    if (!f.text || !f.source_url) return NextResponse.json({ error: 'each finding needs text and source_url' }, { status: 400 })
  }

  const { data: participant } = await db.from('participants').select().eq('submission_id', submissionId).single()
  const { data: subtask } = await db.from('subtasks').select().eq('claimed_by', submissionId).eq('status', 'claimed').limit(1).maybeSingle()
  if (!participant || !subtask) return NextResponse.json({ error: 'no claimed subtask' }, { status: 400 })

  const rows = findings.map((f: any) => ({
    subtask_id: subtask.id, submission_id: submissionId,
    text: String(f.text), source_url: String(f.source_url),
    confidence: ['low', 'medium', 'high'].includes(f.confidence) ? f.confidence : 'medium',
    kind: ['fact', 'interpretation', 'hypothesis'].includes(f.kind) ? f.kind : 'fact',
  }))
  const { data: inserted, error } = await db.from('findings').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await db.from('subtasks').update({ status: 'submitted', updated_at: new Date().toISOString() }).eq('id', subtask.id)
  await db.from('participants').update({ status: 'done' }).eq('submission_id', submissionId)
  await db.from('events').insert({ sprint_id: subtask.sprint_id, type: 'FINDINGS_SUBMITTED', payload: { subtaskId: subtask.id, submissionId, count: inserted.length } })
  await db.from('messages').insert({ submission_id: submissionId, sender: 'agent', content: `Findings received — thank you, ${participant.codename}! You're all set.` })

  // Classify edges against all other findings in the sprint (best effort — never block payout)
  try {
    const { data: allSubtasks } = await db.from('subtasks').select('id').eq('sprint_id', subtask.sprint_id)
    const { data: existing } = await db.from('findings').select('id,text')
      .in('subtask_id', (allSubtasks ?? []).map((s) => s.id))
      .not('id', 'in', `(${inserted.map((f) => f.id).join(',')})`)
    const edges = await classifyEdges({
      newFindings: inserted.map((f) => ({ id: f.id, text: f.text })),
      existingFindings: (existing ?? []).map((f) => ({ id: f.id, text: f.text })),
    })
    if (edges.length) {
      await db.from('edges').insert(edges.map((e) => ({
        sprint_id: subtask.sprint_id, from_finding: e.from, to_finding: e.to,
        relation: e.relation, rationale: e.rationale,
      })))
      const contradictions = edges.filter((e) => e.relation === 'contradicts')
      if (contradictions.length)
        await db.from('events').insert({ sprint_id: subtask.sprint_id, type: 'CONTRADICTION_DETECTED', payload: { edges: contradictions } })
    }
  } catch (e) {
    console.error('edge classification failed', e)
  }

  // Real workers get redirected back to Terac to trigger payout; sims don't.
  const base = process.env.NEXT_PUBLIC_TERAC_CALLBACK_URL || ''
  const redirect = participant.kind === 'real' && base
    ? `${base}?submissionId=${encodeURIComponent(submissionId)}&teracSubmissionId=${encodeURIComponent(submissionId)}&result=completed`
    : null
  return NextResponse.json({ ok: true, redirect })
}
```

- [ ] **Step 3: Write `frontend/app/api/sprint/chat/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { chatReply } from '@/lib/agent'
import { buildGraphSummary } from '@/lib/graphSummary'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const { submissionId, message } = await req.json()
  if (!submissionId || !message) return NextResponse.json({ error: 'submissionId and message required' }, { status: 400 })

  const { data: participant } = await db.from('participants').select().eq('submission_id', submissionId).single()
  if (!participant) return NextResponse.json({ error: 'not joined' }, { status: 404 })
  const { data: sprint } = await db.from('sprints').select().eq('id', participant.sprint_id).single()
  const { data: subtask } = await db.from('subtasks').select().eq('claimed_by', submissionId)
    .order('claimed_at', { ascending: false }).limit(1).maybeSingle()
  const { data: history } = await db.from('messages').select().eq('submission_id', submissionId).order('ts').limit(30)

  await db.from('messages').insert({ submission_id: submissionId, sender: 'worker', content: message })

  const reply = await chatReply({
    question: sprint.question,
    subtaskTitle: subtask?.title ?? 'general help',
    subtaskBrief: subtask?.brief ?? '',
    codename: participant.codename,
    graphSummary: await buildGraphSummary(participant.sprint_id),
    history: (history ?? []).map((m) => ({ sender: m.sender, content: m.content })),
    userMessage: message,
  })
  await db.from('messages').insert({ submission_id: submissionId, sender: 'agent', content: reply })
  return NextResponse.json({ reply })
}
```

- [ ] **Step 4: Verify**

`curl -s -X POST localhost:3000/api/sprint/chat -H 'content-type: application/json' -d '{"submissionId":"test-1","message":"What exactly should I research?"}'` → `{reply: "..."}` referencing the subtask.
`curl -s -X POST localhost:3000/api/sprint/submit -H 'content-type: application/json' -d '{"submissionId":"test-1","findings":[{"text":"Copilot costs $10/mo for individuals","source_url":"https://github.com/features/copilot"},{"text":"Users complain about slow suggestions in large repos","source_url":"https://example.com/review"}]}'` → `{ok:true, redirect:null}`.
Submit findings for `test-2` mentioning a *conflicting* price → check `edges` table has rows (`select * from edges` via state or Supabase).

- [ ] **Step 5: Commit**

```bash
git add frontend && git commit -m "feat: findings submit with edge classification, worker chat"
```

---

### Task 4: Worker workspace page `/sprint`

**Files:**
- Create: `frontend/app/sprint/page.tsx`
- Create: `frontend/components/sprint/WorkspaceClient.tsx`

**Interfaces:**
- Consumes: `POST /api/sprint/join`, `GET /api/sprint/state`, `POST /api/sprint/chat`, `POST /api/sprint/submit` (shapes from Tasks 2–3).
- Produces: worker-facing UI at `/sprint?submissionId=X`. On submit success with `redirect`, does `window.location.href = redirect`.

- [ ] **Step 1: Write `frontend/app/sprint/page.tsx`**

```tsx
import { Suspense } from 'react'
import WorkspaceClient from '@/components/sprint/WorkspaceClient'

export default function SprintPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950 text-gray-400 flex items-center justify-center">Loading…</div>}>
      <WorkspaceClient />
    </Suspense>
  )
}
```

- [ ] **Step 2: Write `frontend/components/sprint/WorkspaceClient.tsx`**

Client component ('use client'). Requirements (implementer writes the JSX; keep it plain Tailwind, mobile-friendly single column):

- Read `submissionId` via `useSearchParams()` (accept `teracSubmissionId` as fallback). If missing → show "This page is opened from a Terac task link." holding state.
- On mount: `POST /api/sprint/join {submissionId}`. If no subtask returned (pool exhausted) → show "All subtasks are taken — thanks for coming! You can close this tab."
- Then poll `GET /api/sprint/state` every 3s; render:
  - Header: sprint question + participant codename + "AI stand-in" badge when `participant.kind === 'simulated'`.
  - Assignment card: subtask title + brief.
  - Chat panel: message list (agent left/gray, worker right/blue), input + send → `POST /api/sprint/chat`, optimistic append.
  - Findings form: dynamic rows (min 2, add-row button): text (textarea), source_url (url input), confidence (select low/medium/high), kind (select fact/interpretation/hypothesis).
  - Submit button → `POST /api/sprint/submit`; disable while pending; on `{ok, redirect}`: if `redirect` → `window.location.href = redirect`; else show "Submitted — thank you!" done state (also shown when `subtask.status === 'submitted'` on reload).
- All fetch errors render inline as small red text, never crash the page.

- [ ] **Step 3: Verify**

`npm run build` passes. Open `localhost:3000/sprint?submissionId=test-3` in a browser: get codename + assignment, send a chat message, submit 2 findings, see done state. Refresh → still done.

- [ ] **Step 4: Commit**

```bash
git add frontend && git commit -m "feat: worker workspace page with chat and findings form"
```

---

### Task 5: Knowledge graph — API + React Flow view

**Files:**
- Create: `frontend/app/api/graph/route.ts`
- Create: `frontend/components/graph/KnowledgeGraph.tsx`

**Interfaces:**
- Consumes: `db` tables `sprints/subtasks/findings/edges/participants`.
- Produces: `GET /api/graph -> {sprint, nodes, edges}` where nodes = `{id, type: 'question'|'subtask'|'finding', label, meta}` and edges = `{id, source, target, relation, rationale}` (structural edges question→subtask→finding get relation `'structure'`); `<KnowledgeGraph pollMs={3000} compact={false} />` React component (client-only, uses `reactflow` + its CSS import).

- [ ] **Step 1: Write `frontend/app/api/graph/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const { data: sprint } = await db.from('sprints').select().order('created_at', { ascending: false }).limit(1).single()
  if (!sprint) return NextResponse.json({ sprint: null, nodes: [], edges: [] })

  const { data: subtasks } = await db.from('subtasks').select().eq('sprint_id', sprint.id).order('id')
  const ids = (subtasks ?? []).map((s) => s.id)
  const { data: findings } = ids.length
    ? await db.from('findings').select().in('subtask_id', ids).order('created_at')
    : { data: [] }
  const { data: relEdges } = await db.from('edges').select().eq('sprint_id', sprint.id)
  const { data: participants } = await db.from('participants').select('submission_id,codename,kind').eq('sprint_id', sprint.id)
  const who = new Map((participants ?? []).map((p) => [p.submission_id, p]))

  const nodes = [
    { id: sprint.id, type: 'question', label: sprint.question, meta: {} },
    ...(subtasks ?? []).map((s) => ({ id: s.id, type: 'subtask', label: s.title, meta: { status: s.status } })),
    ...(findings ?? []).map((f) => {
      const p = who.get(f.submission_id)
      return { id: f.id, type: 'finding', label: f.text, meta: { confidence: f.confidence, kind: f.kind, source_url: f.source_url, codename: p?.codename ?? '?', simulated: p?.kind === 'simulated' } }
    }),
  ]
  const edges = [
    ...(subtasks ?? []).map((s) => ({ id: `s-${s.id}`, source: sprint.id, target: s.id, relation: 'structure', rationale: '' })),
    ...(findings ?? []).map((f) => ({ id: `s-${f.id}`, source: f.subtask_id, target: f.id, relation: 'structure', rationale: '' })),
    ...(relEdges ?? []).map((e) => ({ id: e.id, source: e.from_finding, target: e.to_finding, relation: e.relation, rationale: e.rationale })),
  ]
  return NextResponse.json({ sprint, nodes, edges })
}
```

- [ ] **Step 2: Write `frontend/components/graph/KnowledgeGraph.tsx`**

Client component using `reactflow` (`import ReactFlow, { Background, Controls } from 'reactflow'; import 'reactflow/dist/style.css'`). Requirements:

- Poll `/api/graph` every `pollMs` (default 3000). Compute layout manually (no dagre): question node centered top (y=0); subtasks in a row beneath (y=180, x spread by index); findings stacked under their subtask (y=340 + 90*indexWithinSubtask).
- Node styling by type: question = large dark card; subtask = medium card colored by status (open gray / claimed amber / submitted green); finding = small card, border color by confidence, "AI stand-in" chip when `meta.simulated`, codename shown, clicking opens `meta.source_url` in a new tab.
- Edge styling by relation: `structure` thin gray; `builds_on` solid blue; `references` solid slate; `supports` solid green; `contradicts` **red dashed, animated, thicker** with label "⚡ contradicts". Non-structure edges get `label` = relation; tooltip (edge `data.rationale`) via default reactflow label on hover is fine — render rationale under label when short.
- Preserve viewport across polls (only call `fitView` on first load or when node count changes).
- `compact` prop: hides Controls/Background, smaller nodes — used later on the worker page if time allows (dashboard is the priority).

- [ ] **Step 3: Wire into dashboard as a view toggle**

Modify `frontend/app/dashboard/[jobId]/page.tsx` minimally: add a top-bar toggle `Office | Graph` (local state). When `Graph` selected, render `<KnowledgeGraph />` in place of the `OfficeScene` div (keep TopBar and sidebar). Import KnowledgeGraph with `dynamic(..., { ssr: false })` like OfficeScene.

- [ ] **Step 4: Verify**

`curl -s localhost:3000/api/graph` → nodes include 1 question + 6 subtasks + the findings from Task 3's curls; edges include structure + any classified relations. In browser: `/dashboard/demo` → toggle Graph → see the tree, contradiction edges red/dashed if present.

- [ ] **Step 5: Commit**

```bash
git add frontend && git commit -m "feat: live knowledge graph API and React Flow view on dashboard"
```

---

### Task 6: Dashboard live data — workers feed + panel chat

**Files:**
- Create: `frontend/app/api/workers/route.ts`
- Modify: `frontend/app/dashboard/[jobId]/page.tsx` (swap MOCK_WORKERS for polling)

**Interfaces:**
- Consumes: `db`; existing `Worker` type from `frontend/types/index.ts` (do NOT change its shape).
- Produces: `GET /api/workers -> Worker[]` exactly matching the existing type.

- [ ] **Step 1: Write `frontend/app/api/workers/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Existing 6-desk grid from lib/mockWorkers.ts
const DESKS: [number, number, number][] = [
  [-4, 0, -2.5], [0, 0, -2.5], [4, 0, -2.5], [-4, 0, 1.5], [0, 0, 1.5], [4, 0, 1.5],
]

function mapStatus(p: any, subtaskStatus: string | null): string {
  if (p.status === 'abandoned') return 'blocked'
  if (p.status === 'done') return 'done'
  if (subtaskStatus === 'submitted') return 'review'
  if (subtaskStatus === 'claimed') return 'in-progress'
  return 'pending'
}

function ago(ts: string): string {
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000)
  return m < 1 ? 'just now' : `${m} min ago`
}

export async function GET() {
  const { data: sprint } = await db.from('sprints').select('id').order('created_at', { ascending: false }).limit(1).single()
  if (!sprint) return NextResponse.json([])

  const { data: participants } = await db.from('participants').select().eq('sprint_id', sprint.id).order('joined_at')
  const { data: subtasks } = await db.from('subtasks').select().eq('sprint_id', sprint.id)
  const { data: allMessages } = await db.from('messages').select()
    .in('submission_id', (participants ?? []).map((p) => p.submission_id)).order('ts')

  const workers = (participants ?? []).map((p, i) => {
    const st = (subtasks ?? []).find((s) => s.claimed_by === p.submission_id)
    const msgs = (allMessages ?? []).filter((m) => m.submission_id === p.submission_id)
    const last = msgs[msgs.length - 1]
    return {
      id: p.submission_id,
      name: p.kind === 'simulated' ? `${p.codename} (AI stand-in)` : p.codename,
      teracId: p.submission_id.slice(0, 8).toUpperCase(),
      subtaskTitle: st?.title ?? 'Awaiting assignment',
      status: mapStatus(p, st?.status ?? null),
      lastMessage: last?.content?.slice(0, 120) ?? '',
      lastUpdated: ago(p.last_seen),
      position: DESKS[i % DESKS.length],
      messages: msgs.map((m) => ({
        id: String(m.id), sender: m.sender, content: m.content,
        timestamp: new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      })),
    }
  })
  return NextResponse.json(workers)
}
```

- [ ] **Step 2: Swap mock data in the dashboard**

In `frontend/app/dashboard/[jobId]/page.tsx`: replace `const workers = MOCK_WORKERS` with a `useEffect` + `useState` polling `/api/workers` every 3s (keep `MOCK_WORKERS` import removed). While `workers.length === 0`, render a "Recruiting… no researchers have arrived yet" overlay instead of the office/graph. Keep the selected-worker panel in sync: after each poll, if a worker is selected, replace it with the fresh object matching its `id`.

- [ ] **Step 3: Verify**

`curl -s localhost:3000/api/workers` → array with test-1/test-2/test-3 workers, statuses `done`/`review`, messages present. Browser `/dashboard/demo`: minions at desks, click one → chat history in panel; graph toggle still works.

- [ ] **Step 4: Commit**

```bash
git add frontend && git commit -m "feat: dashboard wired to live workers feed"
```

---

### Task 7: Simulated experts + synthesis

**Files:**
- Create: `frontend/app/api/seed/route.ts`
- Create: `frontend/app/api/synthesize/route.ts`
- Modify: `frontend/app/dashboard/[jobId]/page.tsx` (two buttons + report modal)

**Interfaces:**
- Consumes: join/chat/submit routes (internal fetch is NOT used — call the same logic via direct db + agent lib OR self-fetch with absolute URL from `req.url` origin; use self-fetch, it reuses all validation).
- Produces: `POST /api/seed -> {submissionId, codename}` (runs one full simulated expert end-to-end); `POST /api/synthesize -> {report}` and stores `sprints.report_md`.

- [ ] **Step 1: Write `frontend/app/api/seed/route.ts`**

```typescript
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
```

- [ ] **Step 2: Write `frontend/app/api/synthesize/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { synthesize } from '@/lib/agent'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
  const { data: sprint } = await db.from('sprints').select().order('created_at', { ascending: false }).limit(1).single()
  if (!sprint) return NextResponse.json({ error: 'no sprint' }, { status: 404 })

  const { data: subtasks } = await db.from('subtasks').select().eq('sprint_id', sprint.id)
  const byId = new Map((subtasks ?? []).map((s) => [s.id, s.title]))
  const { data: findings } = await db.from('findings').select().in('subtask_id', (subtasks ?? []).map((s) => s.id))
  const { data: edges } = await db.from('edges').select().eq('sprint_id', sprint.id)
  if (!findings?.length) return NextResponse.json({ error: 'no findings yet' }, { status: 400 })

  const report = await synthesize({
    question: sprint.question,
    findings: findings.map((f) => ({ id: f.id, text: f.text, source_url: f.source_url, confidence: f.confidence, kind: f.kind, subtask: byId.get(f.subtask_id) ?? '' })),
    edges: (edges ?? []).map((e) => ({ from: e.from_finding, to: e.to_finding, relation: e.relation, rationale: e.rationale })),
  })
  await db.from('sprints').update({ report_md: report, status: 'complete' }).eq('id', sprint.id)
  await db.from('events').insert({ sprint_id: sprint.id, type: 'REPORT_GENERATED', payload: {} })
  return NextResponse.json({ report })
}
```

- [ ] **Step 3: Dashboard controls**

In the dashboard TopBar area add two small buttons: **"+ AI stand-in"** → `POST /api/seed` (disable while pending; new minion appears via normal polling) and **"Synthesize"** → `POST /api/synthesize`, then show `report` markdown in a scrollable modal (render with `whitespace-pre-wrap` text — no markdown lib needed at this budget).

- [ ] **Step 4: Verify**

`curl -s -X POST localhost:3000/api/seed` → `{submissionId: "sim-...", codename}`; dashboard shows the new minion labeled "(AI stand-in)"; graph gains findings + possibly contradiction edges. `curl -s -X POST localhost:3000/api/synthesize` → markdown report mentioning contradictions. Browser: both buttons work end-to-end.

- [ ] **Step 5: Commit**

```bash
git add frontend && git commit -m "feat: simulated expert runner and synthesis report"
```

---

## Execution order & parallelism

```
Task 0 (PM, infra) ──▶ Task 1 ──▶ Task 2 ──▶ Task 3 ──▶ Task 4 (workspace)
                                                  │
       PM: Vercel deploy after Task 1;            ├──▶ Task 5 (graph)
       Terac launch after Task 4 deploys          └──▶ Task 6 (dashboard)
                                                            └──▶ Task 7
```

Tasks 4, 5, 6 are independent after Task 3 — dispatch in parallel. Task 7 last. PM launches Terac the moment Task 4 is live on prod (recruitment clock > code polish).

## Degradation plan (if the clock wins)

- No Task 7: seed sims manually via curl; synthesize via curl.
- No Task 5: demo carries on Minion HQ + WorkerPanel chats; graph shown from `/api/graph` JSON if pressed.
- No Task 6 polling swap: dashboard stays on mocks; worker workspace + graph are still real.
