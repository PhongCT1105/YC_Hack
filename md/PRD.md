# PRD: Agentic Task Delegation Platform for Product Managers

## Problem

Monitoring distributed work is broken at both extremes:
- **Fully agentic pipelines**: hallucinations accumulate, QA costs are high, token usage explodes, and observability is minimal.
- **Human workers**: require continuous surveillance, status updates, and context-sharing overhead that consumes the PM's time.

Neither scales. PMs need a middle path.

## Solution

A **task delegation and QA platform** that lets a PM describe a job in natural language, then automatically decomposes it into subtasks, routes each subtask to vetted human workers via Terac, and keeps everyone (PM + workers) in sync through an agentic messaging layer powered by Linq.

### Core Components

| Component | Role |
|---|---|
| **Orchestrator Agent** | Decomposes the PM's job, delegates subtasks, synthesizes outputs |
| **Worker Agents** | One per subtask — each pairs an AI agent with a Terac human worker |
| **Terac** | Screens + pools human workers; enforces quality gates per task |
| **Linq** | Messaging plugin that keeps agents, workers, and PMs in sync |
| **Frontend** | Next.js dashboard — visual minion cards per worker, PM control panel |

---

## User Personas

**Primary: Product Manager**
- Wants to delegate complex work without micromanaging
- Needs progress visibility without requiring workers to write status updates
- Operates within budget and deadline constraints

**Secondary: Worker (via Terac)**
- Receives well-scoped subtasks with clear acceptance criteria
- Communicates through Linq — no need to adopt new tooling
- Gets AI-agent support for context and clarifications

---

## Core User Flow

```
PM inputs: problem statement + time constraint + budget (# workers)
        |
        v
Orchestrator Agent
  - Generates context file (shared state for all workers)
  - Decomposes job into N subtasks
  - Decides worker count + skill profile per subtask
  - Deploys N Worker Agents
        |
        v
Terac API
  - Generates targeting criteria from task spec
  - Finds matching workers from pool
  - Assigns workers to Worker Agents
  - Enforces quality gate on deliverables
        |
        v
Worker Agents (one per subtask)
  - Briefed with context file + subtask spec
  - Connected to assigned Terac worker via Linq
  - Sends updates to Orchestrator + PM
        |
        v
Linq Messaging Layer
  - Agent-to-worker communication
  - PM receives high-level summaries from Orchestrator
  - Workers get proactive context pushes when relevant
        |
        v
Frontend Dashboard
  - Minion cards per worker: status, subtask, last update
  - PM sees aggregate progress
  - Can message any worker/agent directly
        |
        v
Orchestrator reconciles + synthesizes outputs -> delivers final result to PM
```

---

## Functional Requirements

### Orchestrator Agent
- [ ] Accept NLP problem statement + constraints (time, budget/workers)
- [ ] Generate a shared context file (project brief, glossary, constraints)
- [ ] Decompose problem into subtasks with clear acceptance criteria
- [ ] Decide worker count and skill profile for each subtask
- [ ] Deploy Worker Agents with subtask + context
- [ ] Monitor Worker Agent status updates
- [ ] Reconcile and synthesize final outputs
- [ ] Surface blockers and escalate to PM when needed

### Worker Agents
- [ ] Receive subtask spec + context file on init
- [ ] Connect to assigned Terac worker via Linq
- [ ] Send structured status updates to Orchestrator on a schedule
- [ ] Answer worker questions using context file
- [ ] Flag quality issues before submitting to Terac gate
- [ ] Report completion with structured deliverable

### Terac Integration
- [ ] Generate targeting criteria from subtask spec (skills, experience, domain)
- [ ] Query Terac worker pool and retrieve matched candidates
- [ ] Assign worker to task
- [ ] Submit deliverable for Terac quality gate review
- [ ] Handle rejection + re-assignment flow

### Linq Messaging
- [ ] Agent can send messages to a worker's Linq channel
- [ ] Agent receives and parses worker replies
- [ ] Context file excerpts can be pushed to conversation
- [ ] PM can be looped in or receive digest summaries
- [ ] Message history stored and queryable by Orchestrator

### Frontend (Next.js)
- [ ] PM input form: problem statement, time, budget
- [ ] Live dashboard: grid of worker minion cards
  - Worker name / Terac ID
  - Subtask title
  - Status (pending / in-progress / review / done / blocked)
  - Last update timestamp + message
- [ ] PM control panel: message all, view full context file
- [ ] Click-through to individual worker Linq thread

---

## Non-Functional Requirements

- Token efficiency: Orchestrator should not re-process full context on every tick — use summarization + delta updates
- Latency: Worker agent deployment < 30s after PM submits job
- Observability: Every agent action logged with timestamp and actor
- Fault tolerance: If a Worker Agent fails, Orchestrator can re-deploy

---

## Out of Scope (v1)

- Multi-PM collaboration on same job
- Worker payment / invoicing
- Custom Terac quality rubric editor in UI
- Voice input for PM

---

## Success Metrics

| Metric | Target |
|---|---|
| PM time spent on status checks | Reduced by 70% vs baseline |
| Token cost per delegated task | < $0.50 average |
| Worker task completion rate | > 85% pass Terac quality gate |
| Time from job input to first worker assigned | < 2 minutes |
