# Live Research Sprint — 5-Hour Hackathon Design

**Date:** 2026-07-24 · **Time budget:** ~4.5 hours build · **Money budget:** $63 of $250 (verified draft price)
**Decision:** Approach 1 — launch a real Terac opportunity immediately; build a workspace where simulated experts are pipeline-identical to real ones.

## 1. Concept

One agent coordinates N anonymous humans (recruited once through Terac) working concurrently on one research question, live. Terac = hiring + payout. Our layer = all coordination: subtask assignment, handoff, chat, progress, synthesis.

**Demo pitch:** "We're the coordination layer for human work platforms. Terac gives you one person, one task. We give you a coordinated team — assembled, briefed, managed, and synthesized by an agent — with real progress you can watch."

## 2. Verified constraints (tested against live Terac API today)

- **No worker selection** — recruitment is pull-based; participants are anonymous `submissionId`s. (This is a feature: anonymity for free.)
- **One opportunity = one task URL for all** — role differentiation must happen in our workspace at arrival time.
- **Pricing is an LLM estimate, non-deterministic** ($75 vs $66 vs $117 for near-identical probes). Demo config priced at **$10.50/head × 6 = $63** — draft `ki1k2jrpct4ch9821bqhwxkn` already created (NOT launched).
- **Drafts can only edit title/description** — changing `task_url` requires delete + recreate. We recreate the draft once the tunnel URL exists, then launch.
- **5-day window is a maximum, not a delay** — participants can arrive within hours. Launching in the first 30 min maximizes the chance real humans appear during the 5-hour window.
- **`auto_approve` review type** — participants paid instantly on completion (maximizes pickup speed; we forgo the reject gate — acceptable for demo).
- **Terac appends** `?submissionId=…&teracSubmissionId=…&taskId=…` to our task URL; on completion we redirect the participant to Terac's callback with those params.
- **No webhooks from Terac** — we poll `terac_get_submissions` for screening/arrival states; real progress comes from our own workspace events.

## 3. Architecture

Single Next.js app (the existing `frontend/`), extended with API routes and one new page. No separate backend — 5-hour budget.

```
                    ┌──────────────────────────────────────┐
 Terac opportunity  │  Next.js app (local + public tunnel) │
 (6 × 15min, $63)   │                                      │
        │           │  /sprint?submissionId=…   worker UI  │
        └──────────▶│    join → get subtask → chat → submit│──▶ redirect to Terac callback (paid)
                    │                                      │
 PM (you, judges)──▶│  /dashboard/[jobId]     Minion HQ 3D │
                    │    polls /api/workers every 3s       │
                    │                                      │
                    │  API routes + SQLite (better-sqlite3)│
                    │  Claude API: decompose · chat · synth│
                    └──────────────────────────────────────┘
```

**Hosting:** `next dev` on the laptop + cloudflared/ngrok tunnel as the public `task_url`. SQLite file for state (survives restarts; no deploy or DB provisioning time). Fallback alternative: Vercel + Supabase — only if the tunnel proves flaky.

## 4. Data model (SQLite, 4 tables)

```sql
subtasks(id, title, brief, status, claimed_by, findings_json, updated_at)
  -- status: open | claimed | submitted | done
participants(submission_id PRIMARY KEY, codename, kind, status, joined_at, last_seen)
  -- kind: real | simulated   status: active | done | abandoned
messages(id, submission_id, sender, content, ts)   -- sender: agent | worker
events(id, type, payload_json, ts)                 -- append-only, drives dashboard + demo replay
```

## 5. Core flows

**Arrival & assignment (the handoff primitive):** participant opens `/sprint?submissionId=X` → upsert participant with generated codename ("Minion Indigo") → atomically claim the next `open` subtask → show brief + chat + findings form. **Abandonment:** subtask claimed with no activity for 20 min → released back to `open` → next arrival gets it. That is "hand the task to the next person," demonstrated live.

**Chat (anonymous, agent-mediated):** worker sends message → API route calls Claude with sprint context + subtask brief + history → reply persists and renders. Same thread feeds the dashboard WorkerPanel, so the PM watches agent↔expert conversations live.

**Submission:** findings form (finding + source URL + confidence, ≥2 entries) → validate → mark `submitted` → emit event → redirect to Terac callback with `result=completed` (participant gets paid) → agent thanks them in chat.

**Synthesis:** when all subtasks are `submitted` (or on-demand "Synthesize now" button), Claude merges findings into one sourced report, flagging conflicts between researchers. Shown on dashboard.

**Simulated experts (the safety net):** `POST /api/seed` creates a participant with `kind: simulated` and a fake submissionId, then runs the same join → chat → research → submit flow, with Claude actually performing the research and posting progress messages on a timer. Pipeline-identical to real humans; dashboard labels them "AI stand-in" — honest, and itself a demo of the coordination layer. Skips only the Terac callback redirect.

## 6. Frontend integration (build on what exists)

The dashboard (`Minion HQ`) stays as-is structurally. Changes:
- Replace `MOCK_WORKERS` import with a 3s-poll of `/api/workers` returning the existing `Worker` shape: `id` = submissionId, `name` = codename (+ "AI stand-in" tag when simulated), `teracId` = short submissionId display, `status` mapping: open-claim→`in-progress`, submitted→`review`, done→`done`, abandoned→`blocked`, awaiting→`pending`.
- `position`: assign desks from the existing 6-slot grid in arrival order.
- New: synthesis view (modal or panel) for the final report.
- New page: `/sprint` worker workspace (plain Tailwind, no 3D — workers need speed, not spectacle).

## 7. Terac launch runbook (first 30 minutes)

1. Start tunnel → get public URL.
2. Delete draft `ki1k2jrpct4ch9821bqhwxkn`; recreate identical but with real `task_url = https://<tunnel>/sprint`.
3. Launch (`terac_launch_draft_opportunity`) — **requires explicit user go**, spends $63.
4. Poll `terac_get_submissions` every ~2 min; dashboard shows "recruiting" state until first arrival.

## 8. Research question

Decomposition is Claude-generated at sprint creation: 6 independent, b2c-answerable, ~15-min subtasks. Default question (user can override at kickoff): *"Compare 6 leading AI coding assistants — current pricing, one real user complaint (sourced), and one differentiator each."* Each subtask = one product.

## 9. Build order (~4.5h)

| # | Slice | Est |
|---|-------|-----|
| 1 | Tunnel up; recreate + launch opportunity (user approves spend) | 0:30 |
| 2 | SQLite schema + seed subtasks + `/api/workers` + dashboard polling swap | 1:00 |
| 3 | `/sprint` workspace: join/claim, findings form, submit + callback redirect | 1:15 |
| 4 | Chat (worker UI + Claude replies + dashboard panel live) | 0:45 |
| 5 | Simulated expert runner + seed button | 0:45 |
| 6 | Synthesis + polish + dry run | 0:45 |

Slices 2–3 are the demo-critical path; 4–6 degrade gracefully if time runs out (chat → canned agent lines; sim → manual seeding via script; synthesis → run once by hand).

## 10. Out of scope (5-hour cut)

Linq/iMessage (Shao's track — user↔agent chat happens on the dashboard for this demo), multi-project support, quality gates/manual review, revision loops, conflict adjudication by a human reviewer, event replay UI (events table is kept so replay can be added later), auth on the dashboard.

## 11. Risks

- **No real humans arrive in 5h** → simulated experts carry the demo; any real arrival is upside. Never claim sims are human.
- **Tunnel dies mid-demo** → SQLite persists; restart tunnel, same URL with named cloudflared tunnel (or keep ngrok session alive).
- **Estimator repricing on draft recreate** → price may shift from $63; user re-approves if it exceeds ~$100.
- **Real human hits a half-built workspace** (launched at T+0:30, workspace done ~T+2:45) → `/sprint` ships first as a minimal-but-functional version in slice 3; before that, page shows "sprint starting soon" holding state and their arrival is logged.
