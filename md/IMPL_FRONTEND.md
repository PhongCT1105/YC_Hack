# Implementation: Frontend (Next.js)

## Overview

The frontend is a Next.js 14+ App Router application that gives the PM a real-time view of the worker fleet and lets them interact with the system through a clean dashboard.

**Visual concept**: Workers appear as "minion cards" — each card represents one worker on one subtask.

---

## Tech Stack

| Tool | Purpose |
|---|---|
| Next.js 14 (App Router) | Framework |
| Tailwind CSS | Styling |
| shadcn/ui | Component primitives |
| SWR or React Query | Data fetching + polling |
| WebSocket (optional) | Real-time updates |
| Framer Motion | Card animations |

---

## Page Structure

```
/                           PM input form
/dashboard/[jobId]          Live worker dashboard
/dashboard/[jobId]/output   Final synthesized output
```

---

## Page 1: PM Input Form (`/page.tsx`)

```tsx
export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <JobInputForm />
    </main>
  );
}
```

### `JobInputForm` Component

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function JobInputForm() {
  const [problem, setProblem] = useState("");
  const [deadline, setDeadline] = useState("");
  const [workerBudget, setWorkerBudget] = useState(3);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const resp = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problem, deadline, workerBudget }),
    });
    const { jobId } = await resp.json();
    router.push(`/dashboard/${jobId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl space-y-6 p-8 bg-white rounded-2xl shadow">
      <h1 className="text-2xl font-bold">Delegate a Job</h1>

      <div>
        <label className="block text-sm font-medium mb-1">What needs to get done?</label>
        <textarea
          className="w-full border rounded-lg p-3 h-36 resize-none"
          placeholder="Describe your project or task in plain language..."
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
          required
        />
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">Deadline</label>
          <input
            type="datetime-local"
            className="w-full border rounded-lg p-3"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">Workers (budget)</label>
          <input
            type="number"
            min={1}
            max={20}
            className="w-full border rounded-lg p-3"
            value={workerBudget}
            onChange={(e) => setWorkerBudget(Number(e.target.value))}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Deploying workers..." : "Start Job"}
      </button>
    </form>
  );
}
```

---

## Page 2: Dashboard (`/dashboard/[jobId]/page.tsx`)

```tsx
import { MinionGrid } from "@/components/MinionGrid";
import { PMControlPanel } from "@/components/PMControlPanel";

export default function DashboardPage({ params }: { params: { jobId: string } }) {
  return (
    <div className="min-h-screen bg-gray-100">
      <PMControlPanel jobId={params.jobId} />
      <MinionGrid jobId={params.jobId} />
    </div>
  );
}
```

### `MinionGrid` Component

```tsx
"use client";
import useSWR from "swr";
import { MinionCard } from "./MinionCard";
import { WorkerDrawer } from "./WorkerDrawer";
import { useState } from "react";

export function MinionGrid({ jobId }: { jobId: string }) {
  const { data } = useSWR(`/api/jobs/${jobId}/workers`, fetcher, {
    refreshInterval: 5000,  // poll every 5s
  });
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-6">
        {data?.workers.map((worker) => (
          <MinionCard
            key={worker.id}
            worker={worker}
            onClick={() => setSelectedWorker(worker.id)}
          />
        ))}
      </div>
      {selectedWorker && (
        <WorkerDrawer
          workerId={selectedWorker}
          jobId={jobId}
          onClose={() => setSelectedWorker(null)}
        />
      )}
    </>
  );
}
```

---

## `MinionCard` Component

```tsx
const STATUS_STYLES = {
  pending:     "bg-gray-100 text-gray-600",
  "in-progress": "bg-blue-100 text-blue-700",
  review:      "bg-yellow-100 text-yellow-700",
  done:        "bg-green-100 text-green-700",
  blocked:     "bg-red-100 text-red-700",
};

const STATUS_EMOJI = {
  pending: "...",
  "in-progress": "Working",
  review: "In Review",
  done: "Done",
  blocked: "Blocked",
};

export function MinionCard({ worker, onClick }: { worker: Worker; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl shadow p-4 text-left hover:shadow-md transition-shadow w-full"
    >
      {/* Minion avatar */}
      <div className="w-16 h-16 mx-auto mb-3 bg-yellow-300 rounded-full flex items-center justify-center text-2xl">
        {worker.avatar ?? "👷"}
      </div>

      <div className="text-center mb-3">
        <p className="font-semibold text-sm">{worker.name}</p>
        <p className="text-xs text-gray-500">{worker.teracId}</p>
      </div>

      {/* Status badge */}
      <span className={`inline-block text-xs font-medium px-2 py-1 rounded-full ${STATUS_STYLES[worker.status]}`}>
        {STATUS_EMOJI[worker.status]}
      </span>

      {/* Subtask */}
      <p className="mt-2 text-xs font-medium text-gray-700 line-clamp-2">{worker.subtaskTitle}</p>

      {/* Last update */}
      <p className="mt-2 text-xs text-gray-400 line-clamp-2">{worker.lastMessage}</p>
      <p className="text-xs text-gray-300 mt-1">{formatRelativeTime(worker.lastUpdated)}</p>
    </button>
  );
}
```

---

## `WorkerDrawer` Component

Slide-in panel showing Linq conversation history and allowing PM to send a message.

```tsx
export function WorkerDrawer({ workerId, jobId, onClose }) {
  const { data } = useSWR(`/api/jobs/${jobId}/workers/${workerId}/messages`, fetcher, {
    refreshInterval: 5000,
  });
  const [message, setMessage] = useState("");

  async function sendMessage() {
    await fetch(`/api/jobs/${jobId}/workers/${workerId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: message }),
    });
    setMessage("");
  }

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl flex flex-col">
      <div className="p-4 border-b flex justify-between items-center">
        <h2 className="font-semibold">Worker Thread</h2>
        <button onClick={onClose}>Close</button>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {data?.messages.map((msg) => (
          <div key={msg.id} className={`text-sm ${msg.sender === "agent" ? "text-blue-700" : "text-gray-800"}`}>
            <span className="font-medium">{msg.sender === "agent" ? "Agent" : "Worker"}: </span>
            {msg.content}
            <span className="text-xs text-gray-400 ml-2">{formatTime(msg.timestamp)}</span>
          </div>
        ))}
      </div>

      {/* PM message input */}
      <div className="p-4 border-t flex gap-2">
        <input
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
          placeholder="Message worker..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button onClick={sendMessage} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
          Send
        </button>
      </div>
    </div>
  );
}
```

---

## `PMControlPanel` Component

```tsx
export function PMControlPanel({ jobId }) {
  const { data: job } = useSWR(`/api/jobs/${jobId}`, fetcher, { refreshInterval: 10000 });

  return (
    <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
      <div>
        <h1 className="font-bold text-lg">{job?.title ?? "Loading..."}</h1>
        <p className="text-sm text-gray-500">
          {job?.completedSubtasks}/{job?.totalSubtasks} subtasks complete
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-48 bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all"
          style={{ width: `${job?.progressPercent ?? 0}%` }}
        />
      </div>

      <div className="flex gap-3">
        <button className="text-sm border px-3 py-2 rounded-lg hover:bg-gray-50">
          View Context File
        </button>
        <button className="text-sm bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700">
          Message All Workers
        </button>
      </div>
    </div>
  );
}
```

---

## API Routes (Next.js)

```typescript
// /api/jobs/route.ts
export async function POST(req: Request) {
  const body = await req.json();
  const resp = await fetch(`${process.env.BACKEND_URL}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return Response.json(await resp.json());
}

// /api/jobs/[jobId]/workers/route.ts
export async function GET(req: Request, { params }) {
  const resp = await fetch(`${process.env.BACKEND_URL}/jobs/${params.jobId}/workers`);
  return Response.json(await resp.json());
}

// /api/jobs/[jobId]/workers/[workerId]/messages/route.ts
export async function GET(req: Request, { params }) {
  const resp = await fetch(
    `${process.env.BACKEND_URL}/jobs/${params.jobId}/workers/${params.workerId}/messages`
  );
  return Response.json(await resp.json());
}

export async function POST(req: Request, { params }) {
  const body = await req.json();
  const resp = await fetch(
    `${process.env.BACKEND_URL}/jobs/${params.jobId}/workers/${params.workerId}/messages`,
    { method: "POST", body: JSON.stringify(body) }
  );
  return Response.json(await resp.json());
}
```

---

## Environment Variables

```
BACKEND_URL=http://localhost:8000    # FastAPI backend
LINQ_API_URL=...
LINQ_API_KEY=...
```
