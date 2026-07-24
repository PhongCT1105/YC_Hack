# Live Research Sprint — 5-Hour Hackathon Design (rev 2)

**Date:** 2026-07-24 · **Time budget:** ~4.5 hours build · **Money budget:** ~$63 of $250 (verified draft price)
**Decision:** Approach 1 — launch a real Terac opportunity early; simulated experts are pipeline-identical to real ones.
**Rev 2 changes:** Vercel + Supabase hosting; living knowledge graph as the core visualization; workers see and build on prior findings.

## 1. Concept

One agent coordinates N anonymous humans (recruited once through Terac) working on one research question. Terac = hiring + payout (front door + payroll). Our layer = the office inside: subtask assignment, handoff, chat, progress, and a **living knowledge graph** that grows with every submission.

**Demo pitch:** "Terac gives you one person, one task. We give you a coordinated team — and you watch the knowledge itself grow: each researcher's findings connect to, build on, or contradict the others', mapped live by the agent."

## 2. Verified constraints (tested against live Terac API today)

- **No worker selection** — pull-based recruitment; participants are anonymous `submissionId`s.
- **One opportunity = one fixed task URL for all**, frozen at launch. Terac's only per-person differentiation: appended `?submissionId=…&taskId=…` params. All dynamic content lives on our side.
- **Pricing is an LLM estimate, non-deterministic.** Demo config priced at **$10.50/head × 6 = $63** (draft `ki1k2jrpct4ch9821bqhwxkn`, NOT launched). Draft must be deleted + recreated with the production URL before launch (drafts can only edit title/description).
- **5-day window is a maximum, not a delay** — arrivals possible within hours; launch early.
- **`auto_approve`** — instant payout on completion; no reject gate (fine for demo).
- **On completion we redirect the participant to Terac's callback** with their params + `result=completed`.
- **No Terac webhooks** — poll `terac_get_submissions` for arrival states; real progress comes from our workspace events.

## 3. Architecture

```
 Terac opportunity ──▶ Next.js on Vercel (existing frontend/ app, extended)
 (6 × 15min, $63)      │
                       ├─ /sprint?submissionId=…  worker workspace
                       │    join → assigned subtask → SEE PRIOR FINDINGS (graph)
                       │    → chat with agent → submit findings → Terac callback
                       │
                       ├─ /dashboard/[jobId]   Minion HQ 3D (kept) + Graph view (new)
                       │    polls /api/... every 3s
                       │
                       ├─ API routes (the agent lives here)
                       │    Claude API: decompose · chat · classify-findings · synthesize
                       │
                       └─ Supabase Postgres (real DB, provisioned via MCP)
```

- **Vercel** hosting (deploy via vercel CLI/plugin). Env: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-side only).
- **Supabase** for all state; plain polling for liveness (no realtime subscriptions — 5h budget).
- The **agent is serverless functions**: every worker interaction triggers it; no long-running process needed.

## 4. Data model (Supabase Postgres)

```sql
sprints(id, question, status, report_md, created_at)
subtasks(id, sprint_id, title, brief, status, claimed_by, claimed_at, updated_at)
  -- status: open | claimed | submitted | done
participants(submission_id PK, sprint_id, codename, kind, status, joined_at, last_seen)
  -- kind: real | simulated   status: active | done | abandoned
findings(id, subtask_id, submission_id, text, source_url, confidence, kind, created_at)
  -- kind: fact | interpretation | hypothesis   ← graph NODES
edges(id, sprint_id, from_finding, to_finding, relation, rationale, created_at)
  -- relation: builds_on | references | supports | contradicts   ← graph EDGES
messages(id, submission_id, sender, content, ts)   -- sender: agent | worker
events(id, sprint_id, type, payload_json, ts)      -- append-only audit/demo trail
```

## 5. Core flows

**Arrival & assignment:** open `/sprint?submissionId=X` → upsert participant (codename like "Minion Indigo") → atomically claim next `open` subtask → workspace shows: their brief, **the current knowledge graph** (prior findings as context to build on), chat, findings form. Idle 20 min → subtask released → next arrival inherits it (live handoff).

**The knowledge graph (centerpiece):** on every finding submission, the agent (Claude call) compares the new finding against all existing findings and writes edges: *builds_on* (extends an idea), *references* (cites another's work), *supports* (independent agreement), *contradicts* (conflict — rendered as a diverging branch, prominently). Each edge stores a one-line rationale shown on hover. Root node = research question; subtask nodes hang off it; finding nodes hang off subtasks; cross-subtask edges are where the demo magic is.

**Chat:** worker message → Claude with sprint context + subtask brief + graph summary + history → reply persisted. Dashboard WorkerPanel shows threads live.

**Submission:** ≥2 findings (text + source URL + confidence + kind) → validate → agent classifies edges → mark `submitted` → emit events → redirect to Terac callback (paid) → agent thanks them.

**Synthesis:** when all subtasks `submitted` (or "Synthesize now" button) → Claude walks the graph (findings + edges, contradictions called out) → one sourced report on the dashboard.

**Simulated experts:** `POST /api/seed` creates `kind: simulated` participant → same join/chat/research/submit pipeline with Claude doing the research on a timer. Labeled "AI stand-in" everywhere. Skips only the Terac redirect. Guarantees the graph grows during the demo even with zero real arrivals.

## 6. Frontend

- **Keep Minion HQ 3D** (`/dashboard/[jobId]`) — swap `MOCK_WORKERS` for a 3s poll of `/api/workers` (same `Worker` shape; codenames; "AI stand-in" tag; status mapping: claimed→in-progress, submitted→review, done→done, abandoned→blocked, screening→pending; desk positions by arrival order).
- **New Graph view** — toggle/tab on the dashboard: **React Flow** rendering question→subtasks→findings, edge colors by relation (contradicts = red dashed branch), hover shows rationale + source. Auto-layout (dagre or simple layered), poll 3s.
- **New `/sprint` workspace** — plain Tailwind: brief, compact read-only graph (same component), chat panel, findings form, submit. Mobile-friendly (panelists may arrive on phones).
- Synthesis report panel on dashboard.

## 7. Launch runbook (as soon as prod URL exists)

1. Deploy to Vercel → get stable production URL.
2. Delete draft `ki1k2jrpct4ch9821bqhwxkn` → recreate with `task_url = https://<prod>/sprint` → **user approves spend** → launch.
3. Poll `terac_get_submissions` (cron route or dashboard-triggered) for arrivals.

## 8. Research question

Claude decomposes at sprint creation into 6 independent b2c-answerable ~15-min subtasks. Default (user-overridable): *"Compare 6 leading AI coding assistants — current pricing, one sourced user complaint, one differentiator each."* Cross-product comparisons naturally generate supports/contradicts edges.

## 9. Build order (~4.5h, PM + subagents)

| # | Slice | Est |
|---|-------|-----|
| 1 | Supabase schema + Vercel deploy skeleton (env, health route) → launch Terac opportunity | 0:45 |
| 2 | `/sprint` workspace: join/claim/findings/submit + callback redirect | 1:00 |
| 3 | Graph engine: edge classification on submit + React Flow view (dashboard + sprint) | 1:00 |
| 4 | Dashboard wiring: live `/api/workers`, chat both sides | 0:45 |
| 5 | Simulated expert runner + seed button | 0:30 |
| 6 | Synthesis + polish + dry run | 0:30 |

Critical path: 1→2→3. Slices 4–6 degrade gracefully (canned chat, manual seeding, hand-run synthesis).

## 10. Out of scope

Linq/iMessage (Shao's track), auth, multi-sprint UI, manual review/reject, human adjudicator, replay UI (events kept for later), Supabase realtime, RLS hardening (service-role key server-side only; anon key unused).

## 11. Risks

- **No real arrivals in 5h** → simulated experts carry the graph; real ones are upside.
- **Estimator reprices recreated draft** → re-approve if > ~$100.
- **Early real arrival hits half-built workspace** → slice 2 ships a functional minimal form first; before that, holding page + arrival logged.
- **Edge classification noise** → cap graph context sent to Claude (per-finding classification against summaries); show rationale so wrong edges are at least inspectable.
- **Vercel env/deploy friction** → health route in slice 1 proves the full stack before anything depends on it.
