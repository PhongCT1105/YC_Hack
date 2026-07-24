# Implementation: Agentic Workflow

## Overview

The agentic layer has two agent types:

1. **Orchestrator** — one per job. Decomposes the problem, manages the worker fleet, synthesizes outputs.
2. **Worker Agent** — one per subtask. Owns communication with the assigned Terac worker via Linq, monitors progress, submits deliverables.

All agents use the Claude API (claude-sonnet-4-6).

---

## Orchestrator Agent

### Responsibilities
- Parse PM input into a structured job
- Generate a shared context file
- Decompose job into subtasks (structured JSON)
- Spawn Worker Agents
- Aggregate status, generate PM digests
- Synthesize final output

### Decomposition Prompt

```
System:
You are an expert project manager. Given a problem statement and constraints,
decompose the work into concrete, independently executable subtasks.
Each subtask must have clear acceptance criteria so a remote worker knows exactly
when they are done. Return only valid JSON.

User:
Problem: {problem_statement}
Deadline: {deadline}
Max workers: {worker_budget}

Return JSON:
{
  "context_file": {
    "project_brief": "...",
    "constraints": ["..."],
    "glossary": {"term": "definition"},
    "success_criteria": ["..."]
  },
  "subtasks": [
    {
      "id": "st-1",
      "title": "...",
      "description": "...",
      "acceptance_criteria": ["..."],
      "required_skills": ["..."],
      "worker_count": 1,
      "estimated_hours": 2,
      "dependencies": []
    }
  ]
}
```

### Synthesis Prompt

```
System:
You are synthesizing outputs from multiple parallel workers into a single coherent deliverable.
Resolve any contradictions. Prefer higher-quality sections. Maintain consistency of voice and structure.

User:
Original problem: {problem_statement}
Context file: {context_file}

Worker deliverables:
{deliverables_json}

Produce the final unified output.
```

### Orchestrator State Machine

```
INIT -> DECOMPOSING -> DEPLOYING -> MONITORING -> SYNTHESIZING -> DONE
                                       |
                                   ESCALATED (PM intervention)
```

---

## Worker Agent

### Responsibilities
- Open Linq conversation with assigned worker
- Answer worker questions using context file
- Detect completion signals in worker messages
- Submit deliverable to Terac quality gate
- Report status back to Orchestrator

### Opening Message Template

```
Hi {worker_name}, I'm your AI project coordinator for this task.

Task: {subtask_title}
Description: {subtask_description}
Deadline: {deadline}

You're done when:
{acceptance_criteria_list}

Reply with any questions — I'll help with context. Reply "DONE" and attach your work when complete.
```

### Worker Reply Classification Prompt

```
System:
Classify the following message from a human worker. Return JSON only.

User:
Message: "{message}"

Return:
{
  "type": "question" | "progress_update" | "blocker" | "completion",
  "summary": "...",
  "requires_context": true | false,
  "context_query": "..." // if requires_context
}
```

### Worker Agent Loop (pseudocode)

```python
async def run(self):
    await linq.send_opening_message(self.worker_id, self.subtask, self.context_file)
    while self.status != "done":
        messages = await linq.get_new_messages(self.conversation_id)
        for msg in messages:
            classification = await claude.classify(msg.content)
            if classification.type == "completion":
                deliverable = extract_deliverable(msg)
                result = await terac.submit_deliverable(self.terac_task_id, deliverable)
                if result.passed:
                    self.status = "done"
                    await orchestrator.report_complete(self.subtask_id, deliverable)
                else:
                    await linq.send(self.conversation_id, f"Terac review flagged: {result.feedback}. Please revise.")
            elif classification.type == "question":
                context_answer = retrieve_context(self.context_file, classification.context_query)
                reply = await claude.answer(msg.content, context_answer)
                await linq.send(self.conversation_id, reply)
            elif classification.type == "blocker":
                await orchestrator.escalate(self.subtask_id, classification.summary)
        await orchestrator.send_status_update(self.subtask_id, self.status)
        await asyncio.sleep(30)
```

---

## Token Efficiency Strategy

- Context file is chunked and stored. Worker Agents only embed the chunk relevant to the current question (not the full file every turn).
- Orchestrator receives **status summaries** from Worker Agents (not raw Linq transcripts).
- Synthesis uses full deliverables only once at the end — not re-processed mid-job.
- Claude calls use `max_tokens` caps per operation type (classify: 200, reply: 500, synthesis: 4000).

---

## Logging Schema

Every agent action appended to `agent_logs` table:

```sql
CREATE TABLE agent_logs (
    id INTEGER PRIMARY KEY,
    timestamp TEXT NOT NULL,
    job_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,        -- "orchestrator" or "worker-st-1"
    action TEXT NOT NULL,          -- "decompose", "send_message", "submit_deliverable", etc.
    payload JSON,
    tokens_used INTEGER
);
```

---

## Tech Stack

| Layer | Choice |
|---|---|
| Language | Python 3.11+ |
| LLM | Anthropic SDK (`claude-sonnet-4-6`) |
| Async | asyncio + FastAPI background tasks |
| Persistence | SQLite (dev) / Postgres (prod) |
| API | FastAPI |
