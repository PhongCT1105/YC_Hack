# Phong — Task Delegation

Phong owns the **Terac API integration** and the **Agentic Workflow** (Orchestrator + Worker Agents).

---

## Decision: General vs. Focused Tasks

**Recommendation: Start focused, design for general.**

For v1, optimize for a **coding + technical research** task profile. Reasons:
- Terac worker quality is easier to gate objectively (working code, verifiable research)
- Easier to define targeting criteria (languages, frameworks, domain expertise)
- Reduces ambiguity in the Orchestrator's decomposition logic

The architecture should be built so that task type is a parameter — swapping in finance, design, or content workers later only requires new targeting-criteria templates, not a refactor.

---

## 1. Terac Integration

### Goal
Given a subtask spec, find matching workers, assign them, and enforce quality gates on their deliverables.

### Tasks

#### 1.1 Terac API Research & Setup
- [ ] Obtain Terac API credentials
- [ ] Identify available endpoints:
  - Worker pool query / search
  - Task/job submission
  - Worker assignment
  - Deliverable submission + quality gate
  - Status polling or webhook
- [ ] Document the Terac data model: what defines a "task", what is a "worker profile"

#### 1.2 Targeting Criteria Generator
- [ ] Given a subtask spec (title, description, acceptance criteria, domain), generate a Terac targeting criteria object
- [ ] Fields to populate: required skills, experience level, domain tags, estimated hours
- [ ] Implement as a function: `generateTargetingCriteria(subtask) -> TeracCriteria`
- [ ] For v1 (coding focus): map subtask keywords to skill tags (Python, React, SQL, etc.)

#### 1.3 Worker Pool Query
- [ ] `queryWorkers(criteria: TeracCriteria) -> Worker[]`
- [ ] Return ranked list of matching workers
- [ ] Select top N based on match score (N = workers requested for subtask)

#### 1.4 Task Submission & Assignment
- [ ] `submitTask(subtask, worker) -> TeracTaskId`
- [ ] Store mapping: `subtask_id -> terac_task_id -> worker_id`
- [ ] Handle assignment failure: retry with next-ranked worker

#### 1.5 Quality Gate
- [ ] `submitDeliverable(teracTaskId, deliverable) -> QualityGateResult`
- [ ] On pass: mark subtask complete, notify Orchestrator
- [ ] On fail: log reason, notify Worker Agent, optionally re-assign

#### 1.6 Status Polling
- [ ] Poll or webhook: `getTaskStatus(teracTaskId) -> status`
- [ ] Map Terac statuses to internal statuses: `pending / in-progress / submitted / passed / failed`
- [ ] Push status changes to Orchestrator event queue

---

## 2. Agentic Workflow

### Goal
Build the Orchestrator Agent and Worker Agents using Claude API. The Orchestrator decomposes jobs and synthesizes outputs; Worker Agents manage individual subtask execution and worker communication.

### Tasks

#### 2.1 Orchestrator Agent

**Init flow:**
- [ ] Accept input: `{ problemStatement, deadline, workerBudget }`
- [ ] Generate **context file**: project brief, constraints, shared glossary, success criteria
- [ ] Decompose problem into subtasks using Claude (structured JSON output):
  ```json
  {
    "subtasks": [
      {
        "id": "st-1",
        "title": "...",
        "description": "...",
        "acceptance_criteria": [...],
        "required_skills": [...],
        "worker_count": 1,
        "estimated_hours": 3
      }
    ]
  }
  ```
- [ ] For each subtask: call `generateTargetingCriteria` + `queryWorkers` + `submitTask`
- [ ] Spawn Worker Agent per subtask

**Ongoing:**
- [ ] Receive status events from Worker Agents
- [ ] Generate PM digest every N minutes via Linq
- [ ] Detect blockers and escalate to PM
- [ ] On all subtasks complete: call `synthesizeOutputs(deliverables[]) -> finalOutput`

#### 2.2 Worker Agent

**Init:**
- [ ] Receive: `{ subtask, contextFile, teracWorkerId, linqConversationId }`
- [ ] Send opening message to worker via Linq: task brief + acceptance criteria

**Ongoing loop:**
- [ ] Poll Linq for new worker messages every 30s
- [ ] Use Claude to generate contextual replies (informed by context file)
- [ ] Detect: "worker says done" -> call `submitDeliverable` to Terac
- [ ] Detect: "worker is blocked" -> escalate to Orchestrator
- [ ] Send structured status update to Orchestrator every N minutes:
  ```json
  { "subtaskId": "st-1", "status": "in-progress", "lastMessage": "...", "blockers": [] }
  ```

#### 2.3 Claude Integration (`/agents/`)
- [ ] `orchestrator.py` — Orchestrator Agent class
- [ ] `worker_agent.py` — Worker Agent class
- [ ] `prompts.py` — All system/user prompts as constants
- [ ] Use Claude claude-sonnet-4-6 for all agents (balance capability + cost)
- [ ] Use structured output (JSON mode) for decomposition and status updates

#### 2.4 Agent Infrastructure
- [ ] Job queue to serialize Orchestrator events (Redis or in-memory)
- [ ] Worker Agent runs as async task (asyncio or background thread per agent)
- [ ] All agent actions logged: `{ timestamp, agentId, action, payload }`
- [ ] Expose `/api/jobs` and `/api/jobs/:id/status` for frontend

---

## Suggested File Structure

```
/backend
  /agents/
    orchestrator.py          # Orchestrator Agent
    worker_agent.py          # Worker Agent
    prompts.py               # All Claude prompts
  /terac/
    client.py                # Terac API client
    targeting.py             # generateTargetingCriteria()
    quality_gate.py          # submitDeliverable(), getTaskStatus()
  /models/
    job.py                   # Job, Subtask, Worker data models
  /api/
    routes.py                # FastAPI routes
  /db/
    schema.sql               # SQLite/Postgres schema
  main.py                    # App entry point
```

---

## Integration Points Phong Owns

| Connects To | How |
|---|---|
| Linq (Shao) | Worker Agents call Linq client to send/receive messages |
| Frontend (Shao) | FastAPI exposes job status + agent logs |
| Terac API | Direct HTTP calls from `/terac/` module |
| Claude API | Anthropic SDK in `/agents/` |
