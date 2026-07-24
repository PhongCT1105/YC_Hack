# Workspace Planner and Terac Recruitment Design

**Date:** 2026-07-24  
**Status:** Approved for specification  
**Target:** Fast, single-owner MVP on the existing `terac` branch

## Objective

Turn the existing research-sprint demo into a workspace-based product where one
admin can create multiple research questions, plan recruitment with an AI agent,
launch each job through Terac, monitor experts as live workers, communicate with
them, and watch their findings grow a workspace-specific knowledge graph.

The implementation must preserve the teammate work already merged from
`origin/main`, including Linq messaging, configuration/generation pages, the
existing Supabase jobs schema, and the redesigned expert sprint page.

## Product Boundary

This version is a single-owner demo protected by the existing `ADMIN_KEY`.
It does not add accounts, teams, roles, billing, or per-user ownership.

An existing `sprints` row is the canonical workspace record. Existing subtasks,
participants, findings, edges, messages, and events remain attached to a sprint
through `sprint_id`; no parallel workspace data model will be introduced.

The owner experience and expert experience remain separate:

- The owner uses `/dashboard/[workspaceId]?key=ADMIN_KEY`.
- An expert uses `/sprint?workspaceId=[workspaceId]` through the Terac task link.
- The admin key is never included in an expert link.

## Workspace Lifecycle

Each workspace has one explicit stage:

1. `planning`: the question and decomposed subtasks exist, but recruitment is not
   live.
2. `recruiting`: the owner confirmed the quote and Terac accepted the launch.
3. `active`: at least one expert joined or claimed a subtask.
4. `complete`: all workspace subtasks were submitted and the workspace is ready
   for synthesis.

Creating a workspace:

1. Validate and normalize the question.
2. Ask the coordinator model to decompose it into independent subtasks.
3. Insert the workspace and subtasks. If subtask insertion fails, delete the new
   workspace before returning the error.
4. Add a `SPRINT_CREATED` event.
5. Seed the PM conversation with the planner asking how many experts to recruit.
6. Return the new workspace and select it in the dashboard.

Failures during subtask insertion must not leave a workspace that appears usable.

## Owner Application Shell

The dashboard becomes the primary application shell.

### Workspace navigation

A persistent left rail:

- Lists workspaces newest first.
- Shows the stage, worker count, findings count, completed tasks, requested
  headcount, and quoted cost.
- Creates a new workspace from a question.
- Selects a workspace by navigating to `/dashboard/[workspaceId]` while
  preserving the admin key.
- Collapses on desktop and becomes a drawer on narrow screens.

If the requested workspace does not exist, the shell selects the newest available
workspace. If none exists, it shows an empty state focused on creating the first
question.

### Workspace header

The header shows:

- The selected question, rather than a raw job ID as the primary label.
- Stage and progress.
- Office, knowledge-tree, and report views.
- A clear entry point to the planning agent.
- Admin-only demo actions such as adding an AI stand-in.

Desktop-only legends and secondary controls collapse into a menu on mobile.

### Main workspace views

- **Office:** experts appear as minions and reflect pending, working, review,
  completed, or blocked status.
- **Knowledge tree:** findings and relationships are scoped to the selected
  workspace.
- **Report:** synthesis uses only the selected workspace and remains available
  after generation.

Selecting a minion opens the existing worker panel. Owner messages continue to
use the live Linq path when available and the sprint message path otherwise.

### Planning-agent panel

The planning agent is a persistent right-side panel on desktop and a full-width
sheet on mobile. It opens automatically after a workspace is created.

The conversation:

- Knows the selected question, stage, subtask count, worker count, findings
  count, and completion state.
- Can quote recruitment, launch recruitment, and read progress through explicit
  server-side tools.
- Asks for headcount when it is unknown.
- Shows whether a quote is live or estimated.
- Requires unambiguous owner confirmation before launch.
- Persists both owner and agent messages per workspace.
- Keeps launch and API errors visible and retryable.

## Terac Integration

The Terac client remains server-only. `TERAC_API_KEY`, `TERAC_API_BASE`, and any
project identifier must never be exposed through `NEXT_PUBLIC_*` variables or
client responses.

### Quote

The quote tool accepts 1–20 participants and creates or obtains a Terac draft for
the selected workspace. It stores:

- Requested participant count.
- Per-participant and total price where available.
- Terac opportunity/draft ID.
- Whether the quote is estimated.

Repeated quote requests must not silently launch a job. If the requested
headcount changes, the adapter may create a replacement draft when the Terac API
does not support draft updates; the most recent draft becomes the launch target.

### Launch

The launch tool is callable only after:

- A quote/draft exists for the selected workspace.
- The latest owner message clearly confirms the displayed spend and launch.

The workspace advances to `recruiting` only when Terac confirms that recruitment
launched. A local estimate or failed API request must not create a false live
state.

### Expert task URL

Each Terac opportunity receives a task URL containing the canonical workspace ID:

`[NEXT_PUBLIC_APP_URL]/sprint?workspaceId=[workspaceId]`

The expert join endpoint must use this workspace ID. It may retain the existing
latest-sprint fallback only for old links that do not provide a workspace ID.

## Expert Workflow

The existing redesigned sprint page remains the expert UI.

1. The expert opens the workspace-specific Terac link.
2. The page obtains the Terac submission identifier and workspace ID.
3. The join API creates or finds the participant in that workspace and claims one
   unassigned subtask from the same workspace.
4. The workspace advances from `recruiting` to `active` when the first participant
   joins.
5. The expert sees the parent question, assigned task, progress steps, coordinator
   chat, and structured finding cards.
6. Each valid finding requires content and a source URL.
7. Submission stores findings, classifies relationships against existing findings
   in the same workspace, and updates the knowledge tree.
8. When all workspace subtasks are submitted, the workspace advances to
   `complete`.
9. The completion response returns to Terac through the existing callback flow.

The coordinator chat and owner-to-worker messaging remain scoped by participant,
subtask, and workspace.

## API Scoping

All dashboard operations use an explicit workspace ID:

- `GET/POST /api/workspaces`
- `GET/POST /api/workspaces/[id]/pmchat`
- `GET /api/workers?sprintId=[id]`
- `GET /api/graph?sprintId=[id]`
- `POST /api/seed` with `sprintId`
- `POST /api/synthesize` with `sprintId`

Expert operations accept or derive a workspace ID:

- `POST /api/sprint/join`
- `GET /api/sprint/state`
- `POST /api/sprint/chat`
- `POST /api/sprint/submit`

Every owner/dashboard endpoint requires `x-admin-key`, including workspace lists,
worker feeds, graphs, and PM history. Public expert routes authenticate their flow
through the existing Terac submission identifier rather than receiving the admin
key.

The dashboard must never fall back to "latest sprint" after a workspace has been
selected. Legacy fallback behavior may remain only when no workspace ID was
provided.

## Error Handling and Safety

- Invalid or missing workspace IDs return `404`, not another workspace's data.
- Unauthorized owner mutations return `401`.
- Terac errors are sanitized before reaching the browser; credentials and raw
  authorization headers are never logged or returned.
- A launch request is idempotent from the UI while it is in flight.
- Polling tolerates transient errors but shows a persistent unavailable state
  after three consecutive failures.
- Optimistic chat messages reconcile with persisted messages without duplicates.
- Database writes check and surface errors instead of silently continuing.
- The Terac key already shared in chat must be rotated after the demo and updated
  in local/deployment secrets.

## Responsive Behavior

At narrow widths:

- The workspace rail becomes an overlay drawer.
- The top bar shows question, stage, progress, and one actions menu.
- The worker list becomes a compact sheet or horizontal selector.
- The worker and planning panels occupy the viewport width.
- The 3D canvas no longer reserves fixed desktop side-panel widths.
- Rendering quality is capped appropriately for high-density mobile screens.

The desktop visual language remains the current dark Minion HQ experience; this
work improves hierarchy and responsiveness without introducing a new brand.

## Testing and Verification

Add Vitest as the TypeScript test runner and exercise domain behavior before
implementation:

- Workspace ID selection never falls through to another workspace.
- Expert links and join requests preserve the workspace ID.
- Quote state does not imply launch.
- Launch requires a stored draft and explicit confirmation.
- Failed or estimated launch attempts do not set `recruiting`.
- First expert join sets `active`.
- Completing every subtask sets `complete`.
- Graph, worker feed, seed, and synthesis routes use the selected workspace.
- Admin-only mutations reject a missing or incorrect key.

Final verification includes:

- Full automated test suite.
- `npm run build`.
- Manual owner flow: create → quote → confirm → recruiting.
- Manual expert flow using a workspace-specific URL.
- Manual multi-workspace check proving workers, graph, messages, and report do not
  cross workspace boundaries.
- Responsive checks at iPhone and desktop widths.

## Out of Scope

- User registration or login.
- Multiple owners or organizations.
- Workspace permissions.
- Payment collection inside this application.
- Native iOS/TestFlight packaging.
- Replacing Terac or Linq with new providers.
- Broad schema or visual refactors unrelated to the workspace flow.
