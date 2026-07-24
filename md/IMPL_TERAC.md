# Implementation: Terac Integration

## Overview

Terac provides two core services for this platform:
1. **Worker matching** — given a task spec, find and assign the right human workers from a screened pool
2. **Quality gating** — review submitted deliverables and pass/fail them against task criteria

---

## Targeting Criteria Generation

When the Orchestrator creates a subtask, it passes the subtask spec to `generateTargetingCriteria()`.

### Input (Subtask Spec)
```json
{
  "title": "Build REST API for user authentication",
  "description": "Implement JWT-based login and registration endpoints in Python/FastAPI",
  "acceptance_criteria": [
    "POST /auth/register creates user and returns JWT",
    "POST /auth/login validates credentials and returns JWT",
    "All endpoints have input validation and return appropriate HTTP status codes",
    "Unit tests with >80% coverage"
  ],
  "required_skills": ["Python", "FastAPI", "JWT", "REST API design"],
  "estimated_hours": 4
}
```

### Output (Terac Targeting Criteria)
```json
{
  "skills": ["Python", "FastAPI", "JWT", "REST API"],
  "experience_level": "mid",
  "domain_tags": ["backend", "security", "web"],
  "min_rating": 4.0,
  "estimated_hours": 4,
  "task_type": "coding"
}
```

### Skill Mapping (v1 — Coding Focus)

```python
SKILL_MAP = {
    "python": ["Python", "backend"],
    "fastapi": ["FastAPI", "Python", "REST API"],
    "react": ["React", "TypeScript", "frontend"],
    "sql": ["SQL", "database"],
    "jwt": ["JWT", "auth", "security"],
    "data analysis": ["Python", "pandas", "data"],
    # ...
}

def generate_targeting_criteria(subtask: Subtask) -> TeracCriteria:
    skills = set()
    domain_tags = set()
    for skill in subtask.required_skills:
        mapped = SKILL_MAP.get(skill.lower(), [skill])
        skills.update(mapped)
    # estimate experience level from hours + complexity
    experience_level = "senior" if subtask.estimated_hours > 8 else "mid"
    return TeracCriteria(skills=list(skills), experience_level=experience_level, ...)
```

---

## Terac API Client

```python
class TeracClient:
    def __init__(self, api_key: str, base_url: str):
        self.session = httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"}
        )

    async def query_workers(self, criteria: TeracCriteria) -> list[Worker]:
        resp = await self.session.post("/workers/search", json=criteria.dict())
        resp.raise_for_status()
        return [Worker(**w) for w in resp.json()["workers"]]

    async def submit_task(self, subtask_id: str, worker_id: str, spec: dict) -> str:
        resp = await self.session.post("/tasks", json={
            "external_id": subtask_id,
            "worker_id": worker_id,
            "title": spec["title"],
            "description": spec["description"],
            "acceptance_criteria": spec["acceptance_criteria"],
            "estimated_hours": spec["estimated_hours"]
        })
        resp.raise_for_status()
        return resp.json()["task_id"]  # Terac's internal task ID

    async def submit_deliverable(self, terac_task_id: str, deliverable: dict) -> QualityGateResult:
        resp = await self.session.post(f"/tasks/{terac_task_id}/deliverable", json=deliverable)
        resp.raise_for_status()
        data = resp.json()
        return QualityGateResult(
            passed=data["status"] == "approved",
            feedback=data.get("feedback", ""),
            score=data.get("score")
        )

    async def get_task_status(self, terac_task_id: str) -> str:
        resp = await self.session.get(f"/tasks/{terac_task_id}")
        resp.raise_for_status()
        return resp.json()["status"]
```

---

## Worker Assignment Flow

```
generateTargetingCriteria(subtask)
    -> queryWorkers(criteria) -> [worker1, worker2, ...]
    -> assign worker1 (highest match score)
    -> submitTask(subtask_id, worker1.id, spec) -> terac_task_id
    -> store: subtask_id <-> terac_task_id <-> worker1.id
    -> spawn WorkerAgent(subtask, worker1, terac_task_id)
```

### Failure Handling

```python
async def assign_worker(subtask: Subtask, criteria: TeracCriteria) -> Assignment:
    workers = await terac.query_workers(criteria)
    for worker in workers:  # try in ranked order
        try:
            terac_task_id = await terac.submit_task(subtask.id, worker.id, subtask.to_spec())
            return Assignment(worker=worker, terac_task_id=terac_task_id)
        except TeracAssignmentError:
            continue  # worker unavailable, try next
    raise NoWorkerAvailableError(subtask.id)
```

---

## Quality Gate Flow

```
WorkerAgent detects "DONE" signal from worker via Linq
    -> extract deliverable (file content, URL, or text)
    -> terac.submitDeliverable(terac_task_id, deliverable)
    -> if passed:
           orchestrator.markSubtaskComplete(subtask_id, deliverable)
    -> if failed:
           linq.sendToWorker(conversation_id, f"Revision needed: {feedback}")
           # worker revises and re-submits
```

---

## Data Models

```python
@dataclass
class TeracCriteria:
    skills: list[str]
    experience_level: str  # "junior" | "mid" | "senior"
    domain_tags: list[str]
    min_rating: float = 4.0
    estimated_hours: int = 4
    task_type: str = "coding"

@dataclass
class Worker:
    id: str
    name: str
    skills: list[str]
    rating: float
    match_score: float

@dataclass
class Assignment:
    worker: Worker
    terac_task_id: str

@dataclass
class QualityGateResult:
    passed: bool
    feedback: str
    score: float | None
```

---

## DB Schema (Terac-related tables)

```sql
CREATE TABLE assignments (
    subtask_id TEXT PRIMARY KEY,
    terac_task_id TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    worker_name TEXT,
    status TEXT DEFAULT 'pending',  -- pending/in-progress/submitted/passed/failed
    assigned_at TEXT,
    completed_at TEXT
);

CREATE TABLE deliverables (
    id INTEGER PRIMARY KEY,
    subtask_id TEXT NOT NULL,
    terac_task_id TEXT NOT NULL,
    content JSON NOT NULL,
    quality_gate_result TEXT,  -- passed/failed
    quality_gate_feedback TEXT,
    submitted_at TEXT
);
```

---

## Task Type Extensibility

To add a new task domain (e.g., finance analysis), only two things change:

1. Add entries to `SKILL_MAP` in `targeting.py`
2. Add a domain-specific decomposition prompt template in `prompts.py`

No changes needed to the Terac client, Worker Agent, or Orchestrator core.
