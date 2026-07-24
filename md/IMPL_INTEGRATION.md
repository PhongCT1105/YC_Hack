# Implementation: System Integration

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         PM (Browser)                             │
│                    Next.js Frontend                              │
│   Input Form  →  Dashboard (Minion Cards)  →  Output Page        │
└─────────────────────────┬────────────────────────────────────────┘
                          │ REST (Next.js API Routes)
                          │
┌─────────────────────────▼────────────────────────────────────────┐
│                     FastAPI Backend                               │
│                                                                  │
│  POST /jobs ──► Orchestrator Agent                               │
│                    │                                             │
│                    ├──► Context File Generator (Claude)          │
│                    ├──► Subtask Decomposer (Claude)              │
│                    └──► Worker Agent Spawner                     │
│                              │                                   │
│                    Worker Agents (one per subtask)               │
│                    │              │                              │
│                    ▼              ▼                              │
│              Linq Client     Terac Client                        │
└──────────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌────────────────┐            ┌─────────────────┐
│   Linq API     │            │    Terac API     │
│  (Messaging)   │            │  (Workers + QA)  │
└────────┬───────┘            └────────┬─────────┘
         │                             │
         ▼                             ▼
   Human Workers ◄───────────── Worker Assignment
   (via Linq)                    Quality Gate
```

---

## Data Flow: Job Submission

```
1. PM fills form → POST /api/jobs (Next.js)
   payload: { problem, deadline, workerBudget }

2. Next.js API route → POST /jobs (FastAPI backend)

3. FastAPI creates Job record → returns jobId → frontend navigates to /dashboard/[jobId]

4. Background task: Orchestrator.run(job)
   a. Claude call: generate context_file + subtask decomposition
   b. For each subtask:
      - TeracClient.queryWorkers(targeting_criteria) → worker pool
      - TeracClient.submitTask(subtask, worker) → terac_task_id
      - WorkerAgent(subtask, worker, terac_task_id).start() [async task]
      - LinqClient.createConversation(worker.linq_id, subtask) → conversation_id
```

---

## Data Flow: Worker Agent Lifecycle

```
WorkerAgent.run():
  loop every 30s:
    messages = LinqClient.getMessages(conversation_id, since=last_seen)
    for msg in messages:
      classification = Claude.classify(msg)
      if COMPLETION:
        deliverable = extract_deliverable(msg)
        result = TeracClient.submitDeliverable(terac_task_id, deliverable)
        if result.passed:
          Orchestrator.markDone(subtask_id, deliverable)
          → DB: assignments.status = "passed"
          → Orchestrator checks if all subtasks done
        else:
          LinqClient.sendMessage(conversation_id, revision_request)
      elif QUESTION:
        context_chunks = ContextFile.search(msg)
        answer = Claude.answer(msg, context_chunks)
        LinqClient.sendMessage(conversation_id, answer)
      elif BLOCKER:
        Orchestrator.escalate(subtask_id, msg)
        LinqClient.sendMessage(pm_conversation_id, escalation_digest)
    Orchestrator.updateStatus(subtask_id, status)
    → DB: assignments.status updated
```

---

## Data Flow: Frontend Polling

```
Frontend (SWR, every 5s):
  GET /api/jobs/[jobId]/workers
    → FastAPI: SELECT * FROM assignments WHERE job_id = ?
    → returns: [{ workerId, workerName, subtaskTitle, status, lastMessage, lastUpdated }]

  → MinionGrid re-renders updated cards
  → Status badge changes color
  → Progress bar in PMControlPanel updates
```

---

## API Contract (Frontend <-> Backend)

### `POST /jobs`
```json
Request:  { "problem": "...", "deadline": "2026-07-25T18:00:00", "workerBudget": 4 }
Response: { "jobId": "job-abc123", "status": "deploying" }
```

### `GET /jobs/:jobId`
```json
{
  "jobId": "job-abc123",
  "title": "Build authentication system",
  "status": "in-progress",
  "completedSubtasks": 1,
  "totalSubtasks": 4,
  "progressPercent": 25,
  "contextFile": { ... }
}
```

### `GET /jobs/:jobId/workers`
```json
{
  "workers": [
    {
      "id": "w-1",
      "teracId": "terac-xyz",
      "name": "Alex K.",
      "subtaskId": "st-1",
      "subtaskTitle": "Build REST API for user auth",
      "status": "in-progress",
      "lastMessage": "Working on the JWT validation logic",
      "lastUpdated": "2026-07-24T14:32:00Z"
    }
  ]
}
```

### `GET /jobs/:jobId/workers/:workerId/messages`
```json
{
  "messages": [
    { "id": "m-1", "sender": "agent", "content": "Hi! Here's your task...", "timestamp": "..." },
    { "id": "m-2", "sender": "worker", "content": "Got it, starting now", "timestamp": "..." }
  ]
}
```

### `POST /jobs/:jobId/workers/:workerId/messages`
```json
Request:  { "content": "PM message to worker" }
Response: { "messageId": "m-5", "status": "sent" }
```

### `GET /jobs/:jobId/output`
```json
{
  "jobId": "job-abc123",
  "finalOutput": "# Synthesized Result\n\n...",
  "contributions": [
    { "subtaskId": "st-1", "workerId": "w-1", "summary": "Implemented auth API" }
  ]
}
```

---

## Shared Database Schema

```sql
-- Jobs
CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    problem_statement TEXT NOT NULL,
    deadline TEXT,
    worker_budget INTEGER,
    status TEXT DEFAULT 'deploying',
    context_file JSON,
    final_output TEXT,
    created_at TEXT
);

-- Subtasks (from Orchestrator decomposition)
CREATE TABLE subtasks (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    acceptance_criteria JSON,
    required_skills JSON,
    estimated_hours INTEGER,
    status TEXT DEFAULT 'pending',
    deliverable JSON
);

-- Terac assignments
CREATE TABLE assignments (
    subtask_id TEXT PRIMARY KEY,
    terac_task_id TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    worker_name TEXT,
    status TEXT DEFAULT 'pending',
    assigned_at TEXT,
    completed_at TEXT
);

-- Linq conversations
CREATE TABLE linq_conversations (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    subtask_id TEXT,
    worker_id TEXT,
    created_at TEXT
);

-- Linq messages
CREATE TABLE linq_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender TEXT NOT NULL,
    content TEXT NOT NULL,
    attachments JSON,
    timestamp TEXT NOT NULL,
    classified_type TEXT
);

-- Agent action logs
CREATE TABLE agent_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    job_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    action TEXT NOT NULL,
    payload JSON,
    tokens_used INTEGER
);
```

---

## Inter-Component Communication Summary

| From | To | Method | Data |
|---|---|---|---|
| Frontend | Backend | REST (Next.js API routes proxy) | Job create, status poll, message send |
| Backend (Orchestrator) | Terac | HTTP (TeracClient) | Task submission, worker query, quality gate |
| Backend (Worker Agent) | Linq | HTTP (LinqClient) | Message send/receive |
| Linq (worker reply) | Backend | Poll / webhook | New messages |
| Worker Agent | Orchestrator | In-process event / async queue | Status updates, blocker escalation |
| Orchestrator | Linq (PM channel) | HTTP (LinqClient) | Digest summaries, escalations |

---

## Environment Variables Summary

```
# Backend (FastAPI)
ANTHROPIC_API_KEY=...
TERAC_API_KEY=...
TERAC_API_URL=https://api.terac.com/v1
LINQ_API_KEY=...
LINQ_API_URL=https://api.linq.com/v1
DATABASE_URL=sqlite:///./dev.db

# Frontend (Next.js)
BACKEND_URL=http://localhost:8000
LINQ_API_KEY=...
LINQ_API_URL=...
```

---

## Local Development Startup

```bash
# Terminal 1: Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 2: Frontend
cd frontend
npm install
npm run dev  # runs on :3000
```

Frontend proxies `/api/*` to FastAPI at `localhost:8000`.
