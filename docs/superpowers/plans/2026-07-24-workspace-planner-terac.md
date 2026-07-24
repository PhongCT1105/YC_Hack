# Workspace Planner and Terac Recruitment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a single-admin workspace dashboard that creates research questions, plans and launches workspace-specific Terac recruitment, monitors experts, and grows an isolated knowledge tree.

**Architecture:** Keep `sprints` as the workspace aggregate and complete the partial workspace code already in the working tree. Put lifecycle, URL, confirmation, and authorization decisions in small pure helpers; routes orchestrate Supabase, Anthropic, and Terac around those helpers. The dashboard becomes a responsive shell that always carries an explicit workspace ID, while the expert page receives that same ID through the Terac task URL.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Supabase, Anthropic SDK tool use, Terac external API, React Three Fiber, React Flow, Vitest.

## Global Constraints

- Preserve the teammate code already merged from `origin/main`, including Linq, `/config`, `/generate`, Supabase jobs support, and the redesigned expert page.
- Keep a single-owner model using `ADMIN_KEY`; do not add login, roles, teams, or user ownership.
- Never expose `TERAC_API_KEY`, `TERAC_API_BASE`, or `TERAC_PROJECT_ID` through client code or `NEXT_PUBLIC_*`.
- Never include the admin key in an expert task URL.
- Every selected dashboard operation must use an explicit workspace ID and must not fall back to the latest sprint.
- A workspace enters `recruiting` only after Terac returns a confirmed successful launch.
- Keep existing local changes and commit only files belonging to the task being completed.
- Write each behavior test first and observe the expected failure before implementation.

---

### Task 1: Test Harness and Workspace Domain Rules

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/lib/workspaceDomain.ts`
- Test: `frontend/lib/workspaceDomain.test.ts`

**Interfaces:**
- Produces: `WorkspaceStage`, `buildExpertTaskUrl()`, `isExplicitLaunchConfirmation()`, `stageAfterParticipantJoin()`, `stageAfterTaskSubmission()`, `adminKeyMatches()`.

- [ ] **Step 1: Install and configure Vitest**

Run:

```bash
cd frontend
npm install --save-dev vitest
```

Add to `package.json`:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test": "vitest run"
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: { environment: 'node' },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
```

- [ ] **Step 2: Write the failing domain tests**

Create `lib/workspaceDomain.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  adminKeyMatches,
  buildExpertTaskUrl,
  isExplicitLaunchConfirmation,
  stageAfterParticipantJoin,
  stageAfterTaskSubmission,
} from './workspaceDomain'

describe('workspace domain', () => {
  it('builds an expert URL containing only the workspace id', () => {
    expect(buildExpertTaskUrl('https://minion.example/', 'sprint 1')).toBe(
      'https://minion.example/sprint?workspaceId=sprint+1'
    )
  })

  it('requires an explicit launch confirmation', () => {
    expect(isExplicitLaunchConfirmation('Yes, launch recruitment for $30.00')).toBe(true)
    expect(isExplicitLaunchConfirmation('How much would four people cost?')).toBe(false)
  })

  it('moves a joined recruiting workspace to active without reopening complete work', () => {
    expect(stageAfterParticipantJoin('recruiting')).toBe('active')
    expect(stageAfterParticipantJoin('complete')).toBe('complete')
  })

  it('completes only when every nonempty task list is submitted', () => {
    expect(stageAfterTaskSubmission(['submitted', 'submitted'])).toBe('complete')
    expect(stageAfterTaskSubmission(['submitted', 'claimed'])).toBeNull()
    expect(stageAfterTaskSubmission([])).toBeNull()
  })

  it('matches only a nonempty configured admin key', () => {
    expect(adminKeyMatches('secret', 'secret')).toBe(true)
    expect(adminKeyMatches('wrong', 'secret')).toBe(false)
    expect(adminKeyMatches(null, undefined)).toBe(false)
  })
})
```

- [ ] **Step 3: Run the test and verify RED**

Run:

```bash
npm test -- lib/workspaceDomain.test.ts
```

Expected: FAIL because `./workspaceDomain` does not exist.

- [ ] **Step 4: Implement the domain helpers**

Create `lib/workspaceDomain.ts`:

```ts
export type WorkspaceStage = 'planning' | 'recruiting' | 'active' | 'complete'

export function buildExpertTaskUrl(appUrl: string, workspaceId: string): string {
  const url = new URL('/sprint', appUrl.endsWith('/') ? appUrl : `${appUrl}/`)
  url.searchParams.set('workspaceId', workspaceId)
  return url.toString()
}

export function isExplicitLaunchConfirmation(message: string): boolean {
  const value = message.trim().toLowerCase()
  const approval = /\b(yes|confirm|approve|go ahead|proceed)\b/.test(value)
  const action = /\b(launch|recruit|recruitment|spend)\b/.test(value)
  return approval && action
}

export function stageAfterParticipantJoin(stage: WorkspaceStage): WorkspaceStage {
  return stage === 'complete' ? 'complete' : 'active'
}

export function stageAfterTaskSubmission(statuses: string[]): WorkspaceStage | null {
  return statuses.length > 0 && statuses.every((status) => status === 'submitted')
    ? 'complete'
    : null
}

export function adminKeyMatches(provided: string | null, configured: string | undefined): boolean {
  return Boolean(provided && configured && provided.length === configured.length && provided === configured)
}
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npm test -- lib/workspaceDomain.test.ts
git add package.json package-lock.json vitest.config.ts lib/workspaceDomain.ts lib/workspaceDomain.test.ts
git commit -m "test: add workspace lifecycle rules"
```

Expected: 5 tests pass.

---

### Task 2: Workspace-Specific Terac Adapter

**Files:**
- Modify: `frontend/lib/terac.ts`
- Test: `frontend/lib/terac.test.ts`

**Interfaces:**
- Consumes: `buildExpertTaskUrl(appUrl, workspaceId)`.
- Produces: `createDraft(input: CreateDraftInput): Promise<DraftResult>` and `launchDraft(id: string): Promise<LaunchResult>`.

- [ ] **Step 1: Write failing adapter tests**

Create `lib/terac.test.ts`:

```ts
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
      new Response(JSON.stringify({
        id: 'opp-1',
        pricing: { cost_per_participant_cents: 750, total_cost_cents: 2250 },
      }), { status: 200 })
    )

    await createDraft({ workspaceId: 'ws-1', question: 'Compare tools', numParticipants: 3 })

    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))
    expect(body.tasks[0].task_url).toBe('https://minion.example/sprint?workspaceId=ws-1')
    expect(body.num_participants).toBe(3)
  })

  it('does not report an estimated draft as launched', async () => {
    vi.stubEnv('TERAC_API_BASE', '')
    vi.stubEnv('TERAC_API_KEY', '')
    const result = await launchDraft('estimate-123')
    expect(result.launched).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- lib/terac.test.ts
```

Expected: FAIL because `createDraft` still accepts only a number and produces `/sprint` without `workspaceId`.

- [ ] **Step 3: Implement the workspace-specific request**

In `lib/terac.ts`, introduce:

```ts
import { buildExpertTaskUrl } from './workspaceDomain'

export type CreateDraftInput = {
  workspaceId: string
  question: string
  numParticipants: number
}

export async function createDraft(input: CreateDraftInput): Promise<DraftResult> {
  const numParticipants = Math.max(1, Math.min(20, Math.round(input.numParticipants)))
  if (!teracConfigured()) {
    return {
      id: `estimate-${Date.now()}`,
      perHeadCents: ESTIMATED_PER_HEAD_CENTS,
      totalCents: ESTIMATED_PER_HEAD_CENTS * numParticipants,
      estimated: true,
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL is required for Terac recruitment')

  const payload = {
    title: input.question.slice(0, 100),
    project_id: process.env.TERAC_PROJECT_ID || undefined,
    num_participants: numParticipants,
    business_type: 'b2c',
    description:
      'Join a live, agent-coordinated research sprint. Research one focused subtask, chat with the coordinator, and submit sourced findings.',
    tasks: [{
      sequence: 1,
      task_type: 'activity',
      review_type: 'auto_approve',
      task_url: buildExpertTaskUrl(appUrl, input.workspaceId),
      duration_minutes: 15,
      title: 'Coordinated research subtask',
    }],
  }
```

Keep the existing server-side POST, pricing parsing, sanitized error, and `launchDraft` behavior.

- [ ] **Step 4: Run tests and commit**

Run:

```bash
npm test -- lib/terac.test.ts
git add lib/terac.ts lib/terac.test.ts
git commit -m "feat: scope Terac opportunities to workspaces"
```

Expected: adapter tests pass and no secret value appears in snapshots or output.

---

### Task 3: Safe Planning-Agent Tools

**Files:**
- Create: `frontend/lib/admin.ts`
- Modify: `frontend/app/api/workspaces/[id]/pmchat/route.ts`
- Test: `frontend/lib/admin.test.ts`
- Test: `frontend/app/api/workspaces/pmchatPolicy.test.ts`

**Interfaces:**
- Consumes: `adminKeyMatches()`, `isExplicitLaunchConfirmation()`, `createDraft()`, `launchDraft()`.
- Produces: `isAdminRequest(request)` and `canLaunchFromMessage(message, draftId)`.

- [ ] **Step 1: Write failing authorization and launch-policy tests**

Create `lib/admin.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { isAdminRequest } from './admin'

describe('isAdminRequest', () => {
  it('accepts only the configured x-admin-key', () => {
    vi.stubEnv('ADMIN_KEY', 'owner-key')
    expect(isAdminRequest(new Request('http://test', { headers: { 'x-admin-key': 'owner-key' } }))).toBe(true)
    expect(isAdminRequest(new Request('http://test'))).toBe(false)
  })
})
```

Create `app/api/workspaces/pmchatPolicy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { canLaunchFromMessage } from './pmchatPolicy'

describe('planner launch policy', () => {
  it('requires both a real draft and explicit confirmation', () => {
    expect(canLaunchFromMessage('Yes, launch recruitment for $30', 'opp-1')).toBe(true)
    expect(canLaunchFromMessage('What is the price?', 'opp-1')).toBe(false)
    expect(canLaunchFromMessage('Yes, launch recruitment', 'estimate-1')).toBe(false)
    expect(canLaunchFromMessage('Yes, launch recruitment', null)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- lib/admin.test.ts app/api/workspaces/pmchatPolicy.test.ts
```

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement the policies**

Create `lib/admin.ts`:

```ts
import { adminKeyMatches } from './workspaceDomain'

export function isAdminRequest(req: Request): boolean {
  return adminKeyMatches(req.headers.get('x-admin-key'), process.env.ADMIN_KEY)
}
```

Create `app/api/workspaces/pmchatPolicy.ts`:

```ts
import { isExplicitLaunchConfirmation } from '@/lib/workspaceDomain'

export function canLaunchFromMessage(message: string, draftId: string | null): boolean {
  return Boolean(draftId && !draftId.startsWith('estimate-') && isExplicitLaunchConfirmation(message))
}
```

- [ ] **Step 4: Harden the PM chat route**

Update both `GET` and `POST` to return `401` unless `isAdminRequest(req)`.
Use Next 14 route params:

```ts
export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const sprintId = params.id
  // ...
}
```

For quoting, call:

```ts
const draft = await createDraft({
  workspaceId: sprintId,
  question: sprint.question,
  numParticipants: n,
})
```

Before calling `launchDraft`, require:

```ts
if (!canLaunchFromMessage(message, current?.terac_opportunity_id ?? null)) {
  resultContent = 'Launch requires a live Terac quote and explicit confirmation of the spend.'
  isError = true
} else {
  const launch = await launchDraft(current.terac_opportunity_id)
  if (launch.launched) {
    await db.from('sprints').update({ stage: 'recruiting' }).eq('id', sprintId)
  }
  resultContent = JSON.stringify(launch)
  isError = !launch.launched
}
```

Return sanitized messages such as `Terac request failed` to the client while logging only status/context, never authorization headers or secret values.

- [ ] **Step 5: Run tests, build, and commit**

Run:

```bash
npm test -- lib/admin.test.ts app/api/workspaces/pmchatPolicy.test.ts
npm run build
git add lib/admin.ts app/api/workspaces/pmchatPolicy.ts app/api/workspaces/pmchatPolicy.test.ts app/api/workspaces/[id]/pmchat/route.ts
git commit -m "feat: enforce safe planner recruitment tools"
```

Expected: policy tests and build pass.

---

### Task 4: Reliable Workspace API

**Files:**
- Modify: `frontend/app/api/workspaces/route.ts`
- Modify: `frontend/components/workspace/WorkspaceSidebar.tsx`
- Modify: `frontend/components/workspace/PmChatPanel.tsx`
- Test: `frontend/lib/workspaceClient.test.ts`
- Create: `frontend/lib/workspaceClient.ts`

**Interfaces:**
- Consumes: `isAdminRequest()`.
- Produces: `adminHeaders(adminKey)` for all dashboard reads and writes.

- [ ] **Step 1: Write the failing client-header test**

Create `lib/workspaceClient.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { adminHeaders } from './workspaceClient'

describe('adminHeaders', () => {
  it('never fabricates an admin key', () => {
    expect(adminHeaders('owner')).toEqual({ 'x-admin-key': 'owner' })
    expect(adminHeaders(null)).toEqual({})
  })
})
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
npm test -- lib/workspaceClient.test.ts
```

Expected: FAIL because `workspaceClient.ts` does not exist.

- [ ] **Step 3: Implement the shared client headers**

Create `lib/workspaceClient.ts`:

```ts
export function adminHeaders(adminKey: string | null): Record<string, string> {
  return adminKey ? { 'x-admin-key': adminKey } : {}
}
```

- [ ] **Step 4: Gate and harden the workspace route**

In `app/api/workspaces/route.ts`:

- Require `isAdminRequest(req)` for `GET` and `POST`.
- Change `GET()` to `GET(req: Request)`.
- Check errors from every aggregation query.
- Include `report_md` in each workspace response so reports survive reloads.
- If subtask insertion fails, delete the newly inserted sprint before returning.
- If PM message insertion fails, return the error and leave the workspace visible
  with its stage at `planning`.

Use:

```ts
const { data: subtasks, error: subtaskError } = await db.from('subtasks').insert(rows).select()
if (subtaskError) {
  await db.from('sprints').delete().eq('id', sprint.id)
  return NextResponse.json({ error: subtaskError.message }, { status: 500 })
}
```

- [ ] **Step 5: Send the key on workspace and PM reads**

In both components, use:

```ts
fetch(url, { cache: 'no-store', headers: adminHeaders(adminKey) })
```

Track consecutive failures in `WorkspaceSidebar`; reset to zero after a successful poll and show `Workspaces unavailable` after the third failure.

Deduplicate optimistic PM messages by replacing local IDs with the next persisted poll response rather than appending a second copy of the same reply.

- [ ] **Step 6: Run tests, build, and commit**

Run:

```bash
npm test -- lib/workspaceClient.test.ts
npm run build
git add lib/workspaceClient.ts lib/workspaceClient.test.ts app/api/workspaces/route.ts components/workspace/WorkspaceSidebar.tsx components/workspace/PmChatPanel.tsx
git commit -m "feat: make workspace creation reliable"
```

Expected: tests and production build pass.

---

### Task 5: Scope Every Owner Operation to a Workspace

**Files:**
- Modify: `frontend/app/api/workers/route.ts`
- Modify: `frontend/app/api/graph/route.ts`
- Modify: `frontend/app/api/seed/route.ts`
- Modify: `frontend/app/api/synthesize/route.ts`
- Modify: `frontend/components/graph/KnowledgeGraph.tsx`
- Test: `frontend/lib/workspaceRequest.test.ts`
- Create: `frontend/lib/workspaceRequest.ts`

**Interfaces:**
- Consumes: `isAdminRequest()`.
- Produces: `requiredWorkspaceId(request)`.

- [ ] **Step 1: Write the failing request-scoping tests**

Create `lib/workspaceRequest.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { requiredWorkspaceId } from './workspaceRequest'

describe('requiredWorkspaceId', () => {
  it('returns the selected workspace id', () => {
    expect(requiredWorkspaceId(new Request('https://app.test/api/workers?sprintId=ws-2'))).toBe('ws-2')
  })

  it('does not invent a latest workspace fallback', () => {
    expect(requiredWorkspaceId(new Request('https://app.test/api/workers'))).toBeNull()
  })
})
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
npm test -- lib/workspaceRequest.test.ts
```

Expected: FAIL because the helper is missing.

- [ ] **Step 3: Implement request scoping**

Create `lib/workspaceRequest.ts`:

```ts
export function requiredWorkspaceId(req: Request): string | null {
  const value = new URL(req.url).searchParams.get('sprintId')?.trim()
  return value || null
}
```

- [ ] **Step 4: Require admin key and explicit IDs in owner routes**

For workers and graph:

```ts
if (!isAdminRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
const sprintId = requiredWorkspaceId(req)
if (!sprintId) return NextResponse.json({ error: 'sprintId required' }, { status: 400 })
const { data: sprint } = await db.from('sprints').select().eq('id', sprintId).maybeSingle()
if (!sprint) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })
```

For seed and synthesis, parse `sprintId` from the JSON body, verify it exists,
and never query the latest sprint. Seed must pass `{ submissionId, kind:
'simulated', workspaceId: sprintId }` to the join route. Synthesis updates
`report_md` and `stage: 'complete'` for only that workspace.

- [ ] **Step 5: Pass workspace and key through the graph component**

Expose:

```ts
export default function KnowledgeGraph({
  pollMs = 3000,
  compact = false,
  sprintId,
  adminKey,
}: {
  pollMs?: number
  compact?: boolean
  sprintId: string
  adminKey: string | null
})
```

Fetch with `adminHeaders(adminKey)` and remove the unscoped graph URL.

- [ ] **Step 6: Run focused tests, build, and commit**

Run:

```bash
npm test -- lib/workspaceRequest.test.ts
npm run build
git add lib/workspaceRequest.ts lib/workspaceRequest.test.ts app/api/workers/route.ts app/api/graph/route.ts app/api/seed/route.ts app/api/synthesize/route.ts components/graph/KnowledgeGraph.tsx
git commit -m "feat: isolate owner actions by workspace"
```

Expected: no owner route contains a latest-sprint fallback.

---

### Task 6: Workspace-Specific Expert Join and Lifecycle

**Files:**
- Modify: `frontend/app/api/sprint/join/route.ts`
- Modify: `frontend/app/api/sprint/submit/route.ts`
- Modify: `frontend/components/sprint/WorkspaceClient.tsx`
- Test: `frontend/lib/expertJoin.test.ts`
- Create: `frontend/lib/expertJoin.ts`

**Interfaces:**
- Consumes: `stageAfterParticipantJoin()` and `stageAfterTaskSubmission()`.
- Produces: `expertJoinBody(submissionId, workspaceId, kind?)`.

- [ ] **Step 1: Write the failing expert-body test**

Create `lib/expertJoin.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { expertJoinBody } from './expertJoin'

describe('expertJoinBody', () => {
  it('preserves the workspace selected by the Terac task URL', () => {
    expect(expertJoinBody('sub-1', 'ws-7')).toEqual({
      submissionId: 'sub-1',
      workspaceId: 'ws-7',
    })
  })
})
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
npm test -- lib/expertJoin.test.ts
```

Expected: FAIL because `expertJoin.ts` is missing.

- [ ] **Step 3: Implement the request body helper**

Create `lib/expertJoin.ts`:

```ts
export function expertJoinBody(
  submissionId: string,
  workspaceId: string | null,
  kind?: 'real' | 'simulated'
) {
  return {
    submissionId,
    ...(workspaceId ? { workspaceId } : {}),
    ...(kind ? { kind } : {}),
  }
}
```

- [ ] **Step 4: Scope join to the requested workspace**

In the join route:

```ts
const { submissionId, kind, workspaceId } = await req.json()
if (!submissionId) return NextResponse.json({ error: 'submissionId required' }, { status: 400 })

const sprintQuery = workspaceId
  ? db.from('sprints').select().eq('id', workspaceId).maybeSingle()
  : db.from('sprints').select().eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle()
const { data: sprint } = await sprintQuery
if (!sprint) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })
```

If an existing participant has a different `sprint_id`, return `409`. After a new
participant is created, update the sprint stage with
`stageAfterParticipantJoin(sprint.stage)`.

- [ ] **Step 5: Carry `workspaceId` from the page**

In `WorkspaceClient`:

```ts
const workspaceId = searchParams.get('workspaceId')
```

Require `submissionId`, include `expertJoinBody(submissionId, workspaceId)` in
the join POST when the ID is present, and show a legacy-link notice when
`workspaceId` is absent while allowing the server's old-link fallback.

- [ ] **Step 6: Complete the workspace after the last submission**

After marking the current subtask submitted:

```ts
const { data: workspaceTasks } = await db
  .from('subtasks')
  .select('status')
  .eq('sprint_id', subtask.sprint_id)
const nextStage = stageAfterTaskSubmission((workspaceTasks ?? []).map((task) => task.status))
if (nextStage) {
  await db.from('sprints').update({ stage: nextStage }).eq('id', subtask.sprint_id)
}
```

Check every database error before returning success.

- [ ] **Step 7: Run tests, build, and commit**

Run:

```bash
npm test -- lib/expertJoin.test.ts lib/workspaceDomain.test.ts
npm run build
git add lib/expertJoin.ts lib/expertJoin.test.ts app/api/sprint/join/route.ts app/api/sprint/submit/route.ts components/sprint/WorkspaceClient.tsx
git commit -m "feat: bind experts to their workspace"
```

Expected: expert tests pass and the build includes `/sprint`.

---

### Task 7: Integrate the Responsive Workspace Dashboard

**Files:**
- Modify: `frontend/app/dashboard/[jobId]/page.tsx`
- Modify: `frontend/components/workspace/WorkspaceSidebar.tsx`
- Modify: `frontend/components/workspace/PmChatPanel.tsx`
- Modify: `frontend/components/WorkerPanel.tsx`
- Modify: `frontend/components/three/OfficeScene.tsx`
- Modify: `frontend/app/page.tsx`
- Test: `frontend/lib/dashboardNavigation.test.ts`
- Create: `frontend/lib/dashboardNavigation.ts`

**Interfaces:**
- Consumes: workspace APIs, `adminHeaders()`, scoped `KnowledgeGraph`.
- Produces: `dashboardWorkspaceHref(workspaceId, adminKey)`.

- [ ] **Step 1: Read the frontend design skill before editing UI**

Read `.agents/skills/design-taste-frontend/SKILL.md` completely and apply its
existing-product guidance while preserving the Minion HQ visual language.

- [ ] **Step 2: Write the failing navigation test**

Create `lib/dashboardNavigation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { dashboardWorkspaceHref } from './dashboardNavigation'

describe('dashboardWorkspaceHref', () => {
  it('preserves the admin key while switching workspaces', () => {
    expect(dashboardWorkspaceHref('ws 2', 'owner key')).toBe(
      '/dashboard/ws%202?key=owner+key'
    )
  })

  it('does not append an empty key', () => {
    expect(dashboardWorkspaceHref('ws-2', null)).toBe('/dashboard/ws-2')
  })
})
```

- [ ] **Step 3: Run test and verify RED**

Run:

```bash
npm test -- lib/dashboardNavigation.test.ts
```

Expected: FAIL because `dashboardNavigation.ts` is missing.

- [ ] **Step 4: Implement navigation helper**

Create `lib/dashboardNavigation.ts`:

```ts
export function dashboardWorkspaceHref(workspaceId: string, adminKey: string | null): string {
  const path = `/dashboard/${encodeURIComponent(workspaceId)}`
  if (!adminKey) return path
  const query = new URLSearchParams({ key: adminKey })
  return `${path}?${query.toString()}`
}
```

- [ ] **Step 5: Replace the dashboard's fixed single-sprint state**

In the dashboard:

- Treat `params.jobId` as the selected workspace ID.
- Load the workspace list and selected workspace.
- If `params.jobId` is `new` or does not exist, select the newest workspace; if
  the list is empty, keep the workspace creation empty state.
- Render `WorkspaceSidebar` on the left.
- Navigate with `router.push(dashboardWorkspaceHref(id, adminKey))`.
- Open `PmChatPanel` automatically from the workspace-created callback.
- Fetch `/api/workers?sprintId=...` with `adminHeaders(adminKey)`.
- POST `{ sprintId: params.jobId }` for seed and synthesis.
- Pass `sprintId` and `adminKey` into `KnowledgeGraph`.
- Display question, stage, cost, workers, findings, and task progress in the
  header.
- Read the selected workspace's persisted `report_md` so a generated report
  remains available after reload or workspace switching.
- Keep Office, Knowledge Tree, and Report as the three primary views.
- Keep worker selection and existing Linq/sprint messaging behavior intact.

The new workspace callback contract is:

```ts
onCreated?: (workspace: Workspace) => void
```

It selects the workspace, navigates to it, and sets the planner panel open.

- [ ] **Step 6: Make the shell responsive**

Use Tailwind breakpoints with these exact behaviors:

```text
< 768px: workspace sidebar is a fixed overlay drawer; top bar hides legends;
worker and planner panels use inset-0/w-full; canvas has no fixed left/right padding.
>= 768px: workspace rail is 16rem or collapsed to 3rem; worker panel remains 20rem.
```

On desktop, the planning agent is a docked right panel rather than a centered
modal. On mobile it becomes a full-width sheet. The worker list becomes a
horizontal selector or drawer instead of reserving a fixed 13rem column.

In `OfficeScene`, cap device pixel ratio:

```tsx
<Canvas dpr={[1, 1.5]} /* existing props */>
```

Replace pointer-only copy with `Select a minion to inspect`.

- [ ] **Step 7: Preserve the teammate landing flow and expose the workspace app**

Keep the current question-to-`/config` path. Add a visible `Research workspaces`
action that routes to `/dashboard/new` while preserving the URL `key` parameter
when present. The dashboard `new` state lists existing workspaces or shows the
first-workspace creation form.

- [ ] **Step 8: Run tests, build, and commit**

Run:

```bash
npm test -- lib/dashboardNavigation.test.ts
npm run build
git add lib/dashboardNavigation.ts lib/dashboardNavigation.test.ts app/dashboard/[jobId]/page.tsx components/workspace/WorkspaceSidebar.tsx components/workspace/PmChatPanel.tsx components/WorkerPanel.tsx components/three/OfficeScene.tsx app/page.tsx
git commit -m "feat: integrate responsive workspace dashboard"
```

Expected: navigation tests and production build pass.

---

### Task 8: Full Regression and Manual Flow Verification

**Files:**
- Modify only files required by failures found during this task.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a verified owner and expert workflow without cross-workspace data.

- [ ] **Step 1: Run the full automated suite**

Run:

```bash
cd frontend
npm test
```

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run static and production checks**

Run:

```bash
npm run build
git diff --check
```

Expected: both commands exit 0.

- [ ] **Step 3: Start the production server without replacing an existing process**

Run:

```bash
npm run start -- --hostname 0.0.0.0 --port 3001
```

Expected: Next.js reports ready on port 3001.

- [ ] **Step 4: Verify owner flow**

Using the configured admin key without printing it:

1. Open `/dashboard/new?key=[configured key]`.
2. Create a question and confirm the resulting URL contains its workspace ID.
3. Confirm the planner opens and asks for headcount.
4. Ask for a quote and confirm cost/headcount appear in the workspace rail.
5. Confirm that asking about price alone does not launch.
6. Explicitly approve launch and verify `recruiting` appears only after the Terac
   success response.

- [ ] **Step 5: Verify expert and isolation flow**

1. Open the generated `/sprint?workspaceId=[id]&submissionId=[test id]` URL.
2. Confirm the expert receives a task from that workspace.
3. Submit two sourced findings.
4. Confirm the selected workspace's worker, graph, and progress update.
5. Switch to a second workspace and verify none of the first workspace's workers,
   findings, messages, or report appear.

- [ ] **Step 6: Verify responsive layouts**

Check at 390×844 and 1440×900:

- Workspace navigation is usable.
- Header controls do not overlap.
- Planner and worker panels fit the viewport.
- The 3D canvas remains interactive.
- The expert finding form and coordinator chat remain usable.

- [ ] **Step 7: Review secrets and repository state**

Run:

```bash
git status --short
git diff --check
git grep -n "TERAC_API_KEY\\|tk_" -- ':!frontend/.env.local'
```

Expected: no Terac secret value is tracked; only intentional source references to
the environment variable name may appear.

- [ ] **Step 8: Commit any verification fixes**

If verification required changes, rerun the failing test first, make the minimal
fix, rerun the full suite and build, then commit:

Stage the exact files changed by the failing check with `git add path/to/file`,
then commit with:

```bash
git commit -m "fix: complete workspace flow verification"
```
