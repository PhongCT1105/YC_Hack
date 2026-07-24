# Shao — Task Delegation

Shao owns **Linq integration** and the **Next.js frontend**.

---

## 1. Linq Integration

### Goal
Enable agents to send and receive messages with workers through Linq. The agent must be able to:
- Initiate a conversation with a worker
- Push relevant context excerpts into the thread
- Parse incoming worker replies and relay structured updates to the Orchestrator

### Tasks

#### 1.1 Linq API Research & Setup
- [ ] Obtain Linq API credentials / SDK
- [ ] Identify endpoints: create conversation, send message, receive/poll messages
- [ ] Determine auth flow (OAuth, API key, etc.)
- [ ] Document rate limits and webhook vs. polling approach

#### 1.2 Agent Messaging Module (`/lib/linq/`)
- [ ] `createConversation(workerId, taskContext)` — opens a Linq thread with a worker, seeds it with task brief
- [ ] `sendMessage(conversationId, message)` — sends agent message to worker
- [ ] `getMessages(conversationId, since?)` — fetches new messages since last poll
- [ ] `pushContextSnippet(conversationId, excerpt)` — injects relevant context file section

#### 1.3 Context Injection Logic
- [ ] On conversation open: send full subtask spec + top 3 most relevant context file sections
- [ ] On worker question: query context file for relevant answer, send as agent reply
- [ ] Strategy: simple keyword match or embedding similarity against context file chunks

#### 1.4 PM Summary Delivery via Linq
- [ ] PM gets a Linq channel (or fallback: in-app notification)
- [ ] Orchestrator sends digest summaries: aggregate status, blockers, % complete
- [ ] PM can reply to kick off a re-delegation or escalation

#### 1.5 Message Storage
- [ ] Store all Linq message history in a local DB (SQLite or Postgres)
- [ ] Schema: `conversation_id`, `sender`, `content`, `timestamp`, `task_id`
- [ ] Expose `getConversationHistory(taskId)` for the frontend

---

## 2. Frontend (Next.js)

### Goal
A dashboard that gives the PM a real-time view of all workers and lets them interact with the system without going into individual Linq threads.

### Tasks

#### 2.1 Project Setup
- [ ] Init Next.js 14+ app with App Router
- [ ] Set up Tailwind CSS
- [ ] Set up API routes (`/api/`) for backend communication
- [ ] Connect to backend WebSocket or polling endpoint for live updates

#### 2.2 PM Input Page (`/`)
- [ ] Textarea: problem statement
- [ ] Input: time constraint (deadline or hours)
- [ ] Input: budget (number of workers)
- [ ] Submit button → POST to `/api/jobs` → triggers Orchestrator
- [ ] Loading state while Orchestrator decomposes + deploys

#### 2.3 Dashboard Page (`/dashboard/[jobId]`)
- [ ] Grid of **Minion Cards** — one per worker
  - Worker name / Terac ID
  - Subtask title
  - Status badge: `pending` / `in-progress` / `review` / `done` / `blocked`
  - Last message from agent or worker
  - Last updated timestamp
  - Click to expand Linq thread view
- [ ] Auto-refresh / WebSocket updates for card status changes
- [ ] Top bar: overall job progress bar, total cost estimate, time remaining

#### 2.4 Worker Detail Drawer
- [ ] Slide-in drawer on minion card click
- [ ] Shows full Linq conversation history for that worker
- [ ] PM can type and send a direct message (routed through Worker Agent)
- [ ] Shows subtask spec and Terac quality gate status

#### 2.5 PM Control Panel (top of dashboard)
- [ ] "Message All Workers" broadcast
- [ ] "View Context File" modal — full context file the Orchestrator generated
- [ ] Job status: decomposed tasks list with completion checkboxes

#### 2.6 Final Output Page (`/dashboard/[jobId]/output`)
- [ ] Displays Orchestrator's synthesized final result
- [ ] Export as markdown or PDF
- [ ] Shows which workers contributed which sections

---

## Integration Points Shao Owns

| Connects To | How |
|---|---|
| Orchestrator Agent | REST API: receives job decomposition, posts worker status updates |
| Terac (read) | Fetch worker name/ID to display on minion cards |
| Linq API | Direct integration via `/lib/linq/` module |
| Frontend <-> Backend | Next.js API routes proxy to Python/Node orchestrator backend |

---

## Suggested File Structure

```
/app
  /page.tsx                  # PM input form
  /dashboard
    /[jobId]/page.tsx        # Minion grid dashboard
    /[jobId]/output/page.tsx # Final output
/components
  /MinionCard.tsx
  /WorkerDrawer.tsx
  /ContextFileModal.tsx
  /JobInputForm.tsx
/lib
  /linq/
    index.ts                 # Linq client
    types.ts
  /api.ts                    # Backend API client
/api
  /jobs/route.ts             # POST: create job
  /jobs/[jobId]/route.ts     # GET: job status
  /jobs/[jobId]/workers/route.ts
```
