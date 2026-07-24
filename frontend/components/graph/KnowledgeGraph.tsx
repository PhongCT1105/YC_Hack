'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  BaseEdge,
  Background,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlowProvider,
  getBezierPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeProps,
  type NodeTypes,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { adminHeaders } from '@/lib/workspaceClient'

// ---------- API shapes ----------

type ApiNode = {
  id: string
  type: 'question' | 'subtask' | 'finding'
  label: string
  meta: Record<string, any>
}

type ApiEdge = {
  id: string
  source: string
  target: string
  relation: 'structure' | 'builds_on' | 'references' | 'supports' | 'contradicts' | string
  rationale: string
}

type GraphResponse = {
  sprint: { id: string; question: string } | null
  nodes: ApiNode[]
  edges: ApiEdge[]
}

// ---------- Layout ----------

const SUBTASK_SPACING_X = 260
const FINDING_STACK_Y = 90

function computeLayout(nodes: ApiNode[], edges: ApiEdge[]) {
  const positions = new Map<string, { x: number; y: number }>()

  const question = nodes.find((n) => n.type === 'question')
  const subtasks = nodes.filter((n) => n.type === 'subtask')
  const findings = nodes.filter((n) => n.type === 'finding')
  const subtaskIds = new Set(subtasks.map((s) => s.id))

  if (question) positions.set(question.id, { x: 0, y: 0 })

  const n = subtasks.length
  subtasks.forEach((s, i) => {
    const x = (i - (n - 1) / 2) * SUBTASK_SPACING_X
    positions.set(s.id, { x, y: 180 })
  })

  // Find each finding's parent subtask via the structural edges.
  const findingParent = new Map<string, string>()
  edges.forEach((e) => {
    if (e.relation === 'structure' && subtaskIds.has(e.source)) {
      findingParent.set(e.target, e.source)
    }
  })

  const stackIndex = new Map<string, number>()
  findings.forEach((f) => {
    const parentId = findingParent.get(f.id)
    const parentPos = parentId ? positions.get(parentId) : undefined
    const idx = stackIndex.get(parentId ?? '__orphan__') ?? 0
    stackIndex.set(parentId ?? '__orphan__', idx + 1)
    const x = parentPos ? parentPos.x : 0
    const y = 340 + FINDING_STACK_Y * idx
    positions.set(f.id, { x, y })
  })

  return positions
}

// ---------- Node rendering ----------

const STATUS_STYLES: Record<string, string> = {
  open: 'border-gray-500 bg-gray-800 text-gray-200',
  claimed: 'border-amber-500 bg-amber-950 text-amber-100',
  submitted: 'border-green-500 bg-green-950 text-green-100',
}

const CONFIDENCE_BORDER: Record<string, string> = {
  high: 'border-green-400',
  medium: 'border-amber-400',
  low: 'border-red-400',
}

function QuestionNode({ data }: NodeProps<{ label: string; compact?: boolean }>) {
  return (
    <div
      className={`rounded-xl border-2 border-indigo-400 bg-gray-950 text-white shadow-xl px-5 py-4 font-semibold ${
        data.compact ? 'max-w-[200px] text-[11px] px-3 py-2' : 'max-w-[380px] text-sm'
      }`}
    >
      <Handle type="source" position={Position.Bottom} />
      <div className="text-[10px] uppercase tracking-widest text-indigo-300 mb-1">
        Research Question
      </div>
      <div className="leading-snug">{data.label}</div>
    </div>
  )
}

function SubtaskNode({ data }: NodeProps<{ label: string; status: string; compact?: boolean }>) {
  const style = STATUS_STYLES[data.status] ?? STATUS_STYLES.open
  return (
    <div
      className={`rounded-lg border-2 shadow-md px-4 py-3 ${style} ${
        data.compact ? 'max-w-[150px] text-[10px] px-2 py-1.5' : 'max-w-[220px] text-xs'
      }`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="text-[9px] uppercase tracking-widest opacity-70 mb-1">{data.status}</div>
      <div className="font-semibold leading-snug">{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

function FindingNode({
  data,
}: NodeProps<{
  label: string
  confidence: string
  kind?: string
  source_url?: string
  codename?: string
  simulated?: boolean
  compact?: boolean
  endorsements?: number
  disputes?: number
}>) {
  const borderColor = CONFIDENCE_BORDER[data.confidence] ?? 'border-gray-500'

  const handleClick = () => {
    if (data.source_url) window.open(data.source_url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      onClick={handleClick}
      className={`rounded-md border-2 ${borderColor} bg-gray-900 text-gray-100 shadow px-3 py-2 cursor-pointer hover:brightness-125 transition ${
        data.compact ? 'max-w-[130px] text-[9px] px-2 py-1' : 'max-w-[200px] text-[11px]'
      }`}
      title={data.source_url ? 'Click to open source' : undefined}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-1 mb-1 flex-wrap">
        <span className="text-[9px] font-semibold text-gray-400">{data.codename ?? '?'}</span>
        {data.simulated && (
          <span className="text-[8px] uppercase tracking-wide bg-purple-900 text-purple-200 px-1 rounded">
            AI stand-in
          </span>
        )}
      </div>
      <div className="leading-snug">{data.label}</div>
      {((data.endorsements ?? 0) > 0 || (data.disputes ?? 0) > 0) && (
        <div className="flex items-center gap-1.5 mt-1 text-[9px]">
          {(data.endorsements ?? 0) > 0 && (
            <span className="text-green-400">👍{data.endorsements}</span>
          )}
          {(data.disputes ?? 0) > 0 && (
            <span className="text-red-400">👎{data.disputes}</span>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

const nodeTypes: NodeTypes = {
  question: QuestionNode,
  subtask: SubtaskNode,
  finding: FindingNode,
}

// ---------- Edge styling ----------

function edgeStyleFor(relation: string) {
  switch (relation) {
    case 'builds_on':
      return { stroke: '#3b82f6', strokeWidth: 2, dashed: false, animated: false }
    case 'references':
      return { stroke: '#64748b', strokeWidth: 2, dashed: false, animated: false }
    case 'supports':
      return { stroke: '#22c55e', strokeWidth: 2, dashed: false, animated: false }
    case 'contradicts':
      return { stroke: '#ef4444', strokeWidth: 3, dashed: true, animated: true }
    case 'structure':
    default:
      return { stroke: '#4b5563', strokeWidth: 1, dashed: false, animated: false }
  }
}

function RelationEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps<{ relation: string; rationale: string }>) {
  const relation = data?.relation ?? 'structure'
  const rationale = data?.rationale ?? ''
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  if (relation === 'structure') {
    return <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
  }

  const label = relation === 'contradicts' ? '⚡ contradicts' : relation
  const showRationale = rationale && rationale.length <= 80

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          title={rationale || undefined}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <div
            className={`rounded px-1.5 py-0.5 text-[9px] font-semibold shadow ${
              relation === 'contradicts'
                ? 'bg-red-950/90 text-red-300 border border-red-500'
                : 'bg-gray-900/90 border'
            }`}
            style={relation !== 'contradicts' ? { borderColor: style?.stroke as string, color: style?.stroke as string } : undefined}
          >
            {label}
            {showRationale && (
              <div className="text-[8px] font-normal text-gray-400 max-w-[140px] truncate">
                {rationale}
              </div>
            )}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

const edgeTypes: EdgeTypes = { relation: RelationEdge }

function buildEdge(e: ApiEdge): Edge {
  const s = edgeStyleFor(e.relation)
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'relation',
    data: { rationale: e.rationale, relation: e.relation },
    animated: s.animated,
    style: {
      stroke: s.stroke,
      strokeWidth: s.strokeWidth,
      strokeDasharray: s.dashed ? '6 4' : undefined,
    },
    markerEnd:
      e.relation === 'structure' ? undefined : { type: MarkerType.ArrowClosed, color: s.stroke },
  }
}

// ---------- Inner component (needs ReactFlowProvider context) ----------

function KnowledgeGraphInner({
  pollMs,
  compact,
  sprintId,
  adminKey,
}: {
  pollMs: number
  compact: boolean
  sprintId: string
  adminKey: string | null
}) {
  const [graph, setGraph] = useState<GraphResponse | null>(null)
  const lastNodeCount = useRef<number>(-1)
  const { fitView } = useReactFlow()

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const url = `/api/graph?sprintId=${encodeURIComponent(sprintId)}`
        const res = await fetch(url, {
          cache: 'no-store',
          headers: adminHeaders(adminKey),
        })
        if (!res.ok) return
        const data: GraphResponse = await res.json()
        if (!cancelled) setGraph(data)
      } catch {
        // ignore transient fetch errors while polling
      }
    }
    poll()
    const id = setInterval(poll, pollMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [adminKey, pollMs, sprintId])

  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [] as Node[], edges: [] as Edge[] }
    const positions = computeLayout(graph.nodes, graph.edges)
    const nodes: Node[] = graph.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: positions.get(n.id) ?? { x: 0, y: 0 },
      data: { label: n.label, compact, ...n.meta },
    }))
    const edges: Edge[] = graph.edges.map(buildEdge)
    return { nodes, edges }
  }, [graph, compact])

  useEffect(() => {
    if (nodes.length === 0) return
    if (lastNodeCount.current === -1 || lastNodeCount.current !== nodes.length) {
      lastNodeCount.current = nodes.length
      // Defer to next tick so ReactFlow has laid out the new nodes first.
      requestAnimationFrame(() => fitView({ padding: 0.2, duration: 400 }))
    }
  }, [nodes.length, fitView])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      proOptions={{ hideAttribution: true }}
      minZoom={0.1}
      className="bg-gray-950"
    >
      {!compact && <Background color="#374151" gap={24} />}
      {!compact && <Controls />}
    </ReactFlow>
  )
}

// ---------- Public component ----------

export default function KnowledgeGraph({
  pollMs = 3000,
  compact = false,
  sprintId,
  adminKey,
}: {
  pollMs?: number
  compact?: boolean
  sprintId: string
  adminKey: string | null
}) {
  return (
    <ReactFlowProvider>
      <KnowledgeGraphInner
        pollMs={pollMs}
        compact={compact}
        sprintId={sprintId}
        adminKey={adminKey}
      />
    </ReactFlowProvider>
  )
}
