# Implementation: Linq Messaging Integration

## Overview

Linq is the communication backbone between agents and workers. The integration must support:

1. **Agent -> Worker**: task briefings, context answers, revision requests
2. **Worker -> Agent**: questions, progress updates, completion signals, file attachments
3. **Agent -> PM**: digest summaries, escalations, final delivery notification

---

## Core Module: `/lib/linq/`

```typescript
// Types
export interface LinqConversation {
  id: string;
  workerId: string;
  taskId: string;
  createdAt: string;
}

export interface LinqMessage {
  id: string;
  conversationId: string;
  sender: "agent" | "worker" | "pm";
  content: string;
  attachments?: LinqAttachment[];
  timestamp: string;
}

export interface LinqAttachment {
  name: string;
  url: string;
  type: string;
}
```

---

## API Functions

### `createConversation(workerId, taskContext)`

Opens a Linq channel with a worker, seeded with the task brief.

```typescript
export async function createConversation(
  workerId: string,
  taskContext: {
    title: string;
    description: string;
    acceptanceCriteria: string[];
    deadline: string;
  }
): Promise<LinqConversation> {
  const resp = await linqClient.post("/conversations", {
    participant_id: workerId,
    metadata: { task_title: taskContext.title },
    initial_message: formatTaskBrief(taskContext),
  });
  return resp.data;
}

function formatTaskBrief(ctx: TaskContext): string {
  return `
Hi! I'm your AI project coordinator for this task.

Task: ${ctx.title}
${ctx.description}

You're done when:
${ctx.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Deadline: ${ctx.deadline}

Reply any time with questions. When complete, reply with "DONE" and attach your work.
  `.trim();
}
```

### `sendMessage(conversationId, content)`

```typescript
export async function sendMessage(
  conversationId: string,
  content: string,
  attachments?: LinqAttachment[]
): Promise<LinqMessage> {
  const resp = await linqClient.post(`/conversations/${conversationId}/messages`, {
    content,
    attachments: attachments ?? [],
    sender_type: "agent",
  });
  return resp.data;
}
```

### `getMessages(conversationId, since?)`

Polls for new messages since last check.

```typescript
export async function getMessages(
  conversationId: string,
  since?: string  // ISO timestamp
): Promise<LinqMessage[]> {
  const params = since ? { since } : {};
  const resp = await linqClient.get(`/conversations/${conversationId}/messages`, { params });
  return resp.data.messages;
}
```

### `pushContextSnippet(conversationId, excerpt)`

Injects a relevant section from the project context file.

```typescript
export async function pushContextSnippet(
  conversationId: string,
  excerpt: string,
  label: string
): Promise<void> {
  const content = `[Context: ${label}]\n\n${excerpt}`;
  await sendMessage(conversationId, content);
}
```

---

## Webhook vs. Polling

**Recommendation for v1: Polling**
- Simpler setup — no need to expose a public webhook endpoint
- Worker Agent polls every 30 seconds
- Acceptable latency for async human workers

**Upgrade path**: Replace polling loop with Linq webhook once a public endpoint is available (or use ngrok in dev).

```python
# Python backend: Worker Agent polling loop
async def poll_linq(conversation_id: str, last_seen: str) -> list[Message]:
    messages = await linq_client.get_messages(conversation_id, since=last_seen)
    return messages

# In WorkerAgent.run():
while self.status != "done":
    new_messages = await poll_linq(self.conversation_id, self.last_seen)
    for msg in new_messages:
        await self.handle_message(msg)
        self.last_seen = msg.timestamp
    await asyncio.sleep(30)
```

---

## Context Injection Strategy

The context file is chunked (500-token chunks with 50-token overlap). When a worker asks a question:

1. Worker Agent sends question text to Claude with instruction to identify the key topic
2. Key topic is matched against context file chunk titles (keyword or embedding similarity)
3. Top 1-2 matching chunks are retrieved and sent via `pushContextSnippet`
4. Claude generates a direct answer using the retrieved chunks

```python
async def handle_question(self, message: str) -> None:
    # 1. Identify topic
    topic = await claude.extract_topic(message)
    # 2. Retrieve relevant context
    chunks = self.context_file.search(topic, top_k=2)
    # 3. Push context to Linq
    for chunk in chunks:
        await linq.push_context_snippet(self.conversation_id, chunk.text, chunk.title)
    # 4. Generate and send answer
    answer = await claude.answer(message, context=chunks)
    await linq.send_message(self.conversation_id, answer)
```

---

## PM Digest Channel

The Orchestrator maintains a separate Linq conversation (or channel) with the PM.

**Digest format (sent every 30 min or on major event):**

```
Project Update — [Job Title]
Time: 2:30 PM

Progress: 3/5 subtasks in progress, 1 complete, 1 pending

Subtask Status:
[DONE]        st-1: User auth API — passed quality gate
[IN PROGRESS] st-2: Dashboard UI — worker says ~2h remaining
[IN PROGRESS] st-3: Database schema — waiting on review
[IN PROGRESS] st-4: API integration — worker has a question (answered)
[PENDING]     st-5: Final testing — not started

No blockers. On track.
```

**Escalation message (immediate send):**

```
BLOCKER — st-3: Database schema

Worker message: "I don't have access to the existing schema file."

Action needed: Please provide schema file or grant database access.
Reply here to unblock, or I'll reassign in 30 minutes.
```

---

## Message Storage (Local DB)

All messages synced to local DB for frontend display and Orchestrator context.

```sql
CREATE TABLE linq_conversations (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    subtask_id TEXT,           -- NULL for PM channel
    worker_id TEXT,
    created_at TEXT
);

CREATE TABLE linq_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender TEXT NOT NULL,      -- "agent" | "worker" | "pm"
    content TEXT NOT NULL,
    attachments JSON,
    timestamp TEXT NOT NULL,
    classified_type TEXT        -- "question" | "progress" | "blocker" | "completion" | null
);
```

---

## Linq Client Setup

```typescript
// /lib/linq/client.ts
import axios from "axios";

export const linqClient = axios.create({
  baseURL: process.env.LINQ_API_URL,
  headers: {
    Authorization: `Bearer ${process.env.LINQ_API_KEY}`,
    "Content-Type": "application/json",
  },
  timeout: 10000,
});
```

Required env vars:
```
LINQ_API_URL=https://api.linq.com/v1
LINQ_API_KEY=your_key_here
```

---

## Fallback: If Linq API Unavailable

During development or if Linq integration is blocked:
- Replace `linqClient` with a local mock that writes messages to DB
- Frontend displays messages from DB directly (no real Linq)
- Workers interact through a simple in-app chat UI instead

This fallback is built into the architecture — the Linq client is a swappable adapter.
