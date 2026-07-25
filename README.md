# Despicable Me 5

An agentic task delegation platform for product managers. Describe a job in natural language — Minion HQ decomposes it into subtasks, recruits vetted human workers via Terac, and keeps everyone in sync through an AI messaging layer powered by Linq.

## Problem

Monitoring distributed work is broken at both extremes:
- **Fully agentic pipelines**: hallucinations accumulate, QA costs are high, and observability is minimal.
- **Human workers**: require constant status updates and context-sharing that consumes the PM's time.

## Solution

A middle path: AI agents pair with human workers — one agent per subtask — so work stays human-quality while the PM only sees high-level summaries and blockers.

## How It Works

```
PM inputs job description + deadline + worker budget
        |
        v
Orchestrator Agent (Claude)
  - Generates shared context file
  - Decomposes job into subtasks
  - Deploys one Worker Agent per subtask
        |
        v
Terac
  - Matches subtask specs to screened workers
  - Enforces quality gate on deliverables
        |
        v
Worker Agents (Claude)
  - Brief workers via Linq
  - Answer questions using context file
  - Monitor for completion signals
  - Submit deliverables to Terac quality gate
        |
        v
Linq Messaging Layer
  - Agent <-> worker communication
  - PM receives digest summaries and escalations
        |
        v
Frontend Dashboard (Next.js)
  - Worker "minion" cards: status, subtask, last update
  - PM chat panel via Linq
  - Click-through to individual worker threads
        |
        v
Orchestrator synthesizes outputs -> delivers final result to PM
```

## Architecture

| Component | Role |
|---|---|
| **Orchestrator Agent** | Decomposes the job, manages the worker fleet, synthesizes final output |
| **Worker Agents** | One per subtask — pairs AI context with a Terac human worker via Linq |
| **Terac** | Screens and pools human workers; enforces quality gates per deliverable |
| **Linq** | Messaging layer between agents, workers, and the PM |
| **Frontend** | Next.js dashboard with live worker cards and PM control panel |

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS |
| LLM | Anthropic SDK (`claude-sonnet-4-6`) |
| Worker Marketplace | Terac API |
| Messaging | Linq API |
| Backend | FastAPI (Python) |
| Database | SQLite (dev) / Postgres (prod) |

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- API keys for Anthropic, Terac, and Linq

### Environment Variables

Create `frontend/.env.local`:

```
LINQ_API_URL=https://api.linq.com/v1
LINQ_API_KEY=your_linq_key
TERAC_API_URL=https://api.terac.com/v1
TERAC_API_KEY=your_terac_key
ANTHROPIC_API_KEY=your_anthropic_key
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Backend

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

## User Flow

1. **PM inputs** a problem statement, deadline, and worker budget on the home screen
2. **Orchestrator** decomposes the job and recruits matched workers from Terac
3. **Worker Agents** brief each worker via Linq with their subtask and acceptance criteria
4. **Dashboard** shows live status cards per worker — PM can message any worker directly
5. **Quality gate** — workers signal completion via Linq; Terac reviews deliverables
6. **Orchestrator** synthesizes all passing deliverables into a final output for the PM

## Key Design Decisions

- **Token efficiency**: Worker agents embed only relevant context chunks per question, not the full context file. Orchestrator receives summaries, not raw transcripts.
- **Polling over webhooks** (v1): Worker agents poll Linq every 30s — no public endpoint required. Designed to swap in webhooks.
- **Terac as quality gate**: Deliverables are not accepted until they pass Terac review. On failure, the worker receives targeted feedback and revises.
- **Swappable Linq adapter**: The Linq client is a replaceable module — a local mock that writes to DB can stand in during development.

## Project Structure

```
frontend/
  app/
    page.tsx              # PM job input
    config/page.tsx       # Job configuration (deadline, budget)
    generate/page.tsx     # Decomposition preview
    dashboard/[jobId]/    # Live worker dashboard
    api/
      linq/               # Linq thread + messaging routes
      workers/            # Worker status API
      workspaces/         # Workspace management
      sprint/             # Sprint lifecycle (init, chat, submit, finish)
      agent/              # Agent inbound + chat routes
  components/
    WorkerPanel.tsx       # Worker minion cards
  lib/
    jobStore.ts           # Client-side job state
md/
  PRD.md                  # Product requirements
  IMPL_AGENTIC.md         # Agent architecture
  IMPL_LINQ.md            # Linq integration spec
  IMPL_TERAC.md           # Terac integration spec
  IMPL_FRONTEND.md        # Frontend spec
  IMPL_INTEGRATION.md     # End-to-end integration spec
```
