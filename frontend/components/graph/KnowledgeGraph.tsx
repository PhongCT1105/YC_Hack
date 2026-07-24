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

const SUBTASK_GLOW: Record<string, { border: string; glow: string; bg: string; label: string }> = {
  open:      { border: 'rgba(255,255,255,0.3)',  glow: 'rgba(255,255,255,0.08)', bg: 'rgba(17,24,39,0.95)', label: 'rgba(255,255,255,0.35)' },
  claimed:   { border: 'rgba(255,255,255,0.6)',  glow: 'rgba(255,255,255,0.2)',  bg: 'rgba(20,20,28,0.95)', label: 'rgba(255,255,255,0.65)' },
  submitted: { border: 'rgba(255,255,255,0.9)',  glow: 'rgba(255,255,255,0.35)', bg: 'rgba(22,22,30,0.95)', label: 'rgba(255,255,255,0.9)' },
}

const FINDING_GLOW: Record<string, { border: string; glow: string }> = {
  high:   { border: 'rgba(255,255,255,0.8)',  glow: 'rgba(255,255,255,0.28)' },
  medium: { border: 'rgba(255,255,255,0.5)',  glow: 'rgba(255,255,255,0.14)' },
  low:    { border: 'rgba(255,255,255,0.25)', glow: 'rgba(255,255,255,0.07)' },
}

const GLOW_ANIM: React.CSSProperties = {
  animation: 'node-glow-pulse 3s ease-in-out infinite',
}

function QuestionNode({ data }: NodeProps<{ label: string; compact?: boolean }>) {
  const size = data.compact ? 88 : 140
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <Handle type="source" position={Position.Bottom} />
      <div
        style={{
          width: size, height: size,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.1), rgba(8,8,20,0.96))',
          border: '2px solid rgba(255,255,255,0.85)',
          boxShadow: '0 0 20px rgba(255,255,255,0.35), 0 0 44px rgba(255,255,255,0.1)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', padding: data.compact ? 10 : 16,
          ...GLOW_ANIM,
          animationDelay: '0s',
        }}
      >
        <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
          Question
        </div>
        <div style={{
          fontSize: data.compact ? 9 : 10, color: 'white', fontWeight: 700, lineHeight: 1.3,
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: data.compact ? 3 : 5, WebkitBoxOrient: 'vertical',
        }}>
          {data.label}
        </div>
      </div>
    </div>
  )
}

function SubtaskNode({ data }: NodeProps<{ label: string; status: string; compact?: boolean }>) {
  const s = SUBTASK_GLOW[data.status] ?? SUBTASK_GLOW.open
  const size = data.compact ? 72 : 104
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <Handle type="target" position={Position.Top} />
      <div
        style={{
          width: size, height: size,
          borderRadius: '50%',
          background: `radial-gradient(circle at 35% 30%, ${s.bg.replace('0.95', '0.6')}, ${s.bg})`,
          border: `2px solid ${s.border}`,
          boxShadow: `0 0 14px ${s.glow}, 0 0 28px ${s.glow}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', padding: data.compact ? 8 : 12,
          ...GLOW_ANIM,
          animationDelay: '0.6s',
        }}
      >
        <div style={{ fontSize: 7, color: s.label, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>
          {data.status}
        </div>
        <div style={{
          fontSize: data.compact ? 8 : 9, color: 'white', fontWeight: 600, lineHeight: 1.25,
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
        }}>
          {data.label}
        </div>
      </div>
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
  const g = FINDING_GLOW[data.confidence] ?? FINDING_GLOW.medium
  const size = data.compact ? 60 : 84

  const handleClick = () => {
    if (data.source_url) window.open(data.source_url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      style={{ position: 'relative', width: size, height: size, cursor: data.source_url ? 'pointer' : 'default' }}
      onClick={handleClick}
      title={data.source_url ? 'Click to open source' : undefined}
    >
      <Handle type="target" position={Position.Top} />
      <div
        style={{
          width: size, height: size,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%, rgba(30,30,46,0.9), rgba(8,8,20,0.97))',
          border: `2px solid ${g.border}`,
          boxShadow: `0 0 12px ${g.glow}, 0 0 24px ${g.glow}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', padding: data.compact ? 6 : 10,
          transition: 'filter 150ms',
          ...GLOW_ANIM,
          animationDelay: '1.2s',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = 'brightness(1.3)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = '' }}
      >
        <div style={{ fontSize: 7, color: 'rgba(156,163,175,0.8)', fontWeight: 600, marginBottom: 2 }}>
          {data.codename ?? '?'}
          {data.simulated && <span style={{ color: '#c4b5fd', marginLeft: 2 }}>·AI</span>}
        </div>
        <div style={{
          fontSize: data.compact ? 7 : 9, color: 'rgba(255,255,255,0.9)', lineHeight: 1.25,
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
        }}>
          {data.label}
        </div>
      </div>
      {((data.endorsements ?? 0) > 0 || (data.disputes ?? 0) > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: 8 }}>
          {(data.endorsements ?? 0) > 0 && (
            <span style={{ color: '#4ade80' }}>👍{data.endorsements}</span>
          )}
          {(data.disputes ?? 0) > 0 && (
            <span style={{ color: '#f87171' }}>👎{data.disputes}</span>
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
      return { stroke: 'rgba(255,255,255,0.5)', strokeWidth: 2, dashed: false, animated: false }
    case 'references':
      return { stroke: 'rgba(255,255,255,0.3)', strokeWidth: 2, dashed: false, animated: false }
    case 'supports':
      return { stroke: 'rgba(255,255,255,0.6)', strokeWidth: 2, dashed: false, animated: false }
    case 'contradicts':
      return { stroke: 'rgba(255,255,255,0.7)', strokeWidth: 3, dashed: true, animated: true }
    case 'structure':
    default:
      return { stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1, dashed: false, animated: false }
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
            className="rounded px-1.5 py-0.5 text-[9px] font-semibold shadow bg-black/80 border"
            style={{ borderColor: style?.stroke as string, color: style?.stroke as string }}
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
