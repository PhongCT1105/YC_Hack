import { supabase } from '@/lib/supabase'

export interface AgentFile {
  id: string
  job_id: string
  worker_agent_id: string | null
  filename: string
  file_type: 'md' | 'json'
  content: string
  size_label: string | null
  created_at: string
  updated_at: string
}

// ── Jobs ────────────────────────────────────────────────────────────────────

export async function createJob(params: {
  problem: string
  workerCount: number
  deadline?: string
  linqPhone?: string
}): Promise<string> {
  const { data, error } = await supabase
    .from('jobs')
    .insert({
      problem: params.problem,
      worker_count: params.workerCount,
      deadline: params.deadline ?? null,
      linq_phone: params.linqPhone ?? null,
      orchestrator_agent: {
        model: 'gemini-2.0-flash',
        role: 'orchestrator',
        created_at: new Date().toISOString(),
      },
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

// ── Worker Agents ────────────────────────────────────────────────────────────

export async function createWorkerAgent(params: {
  jobId: string
  workerIndex: number
  subtaskTitle: string
  config: object
}): Promise<string> {
  const { data, error } = await supabase
    .from('worker_agents')
    .insert({
      job_id: params.jobId,
      worker_index: params.workerIndex,
      subtask_title: params.subtaskTitle,
      config: params.config,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

// ── Agent Files ──────────────────────────────────────────────────────────────

export async function createAgentFile(params: {
  jobId: string
  workerAgentId?: string | null
  filename: string
  content: string
  sizeLabel?: string
}): Promise<string> {
  const fileType = params.filename.endsWith('.json') ? 'json' : 'md'
  const { data, error } = await supabase
    .from('agent_files')
    .insert({
      job_id: params.jobId,
      worker_agent_id: params.workerAgentId ?? null,
      filename: params.filename,
      file_type: fileType,
      content: params.content,
      size_label: params.sizeLabel ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function updateAgentFile(id: string, content: string): Promise<void> {
  const { error } = await supabase
    .from('agent_files')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function getAgentFile(id: string): Promise<AgentFile> {
  const { data, error } = await supabase
    .from('agent_files')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function getAgentFilesByJob(jobId: string): Promise<AgentFile[]> {
  const { data, error } = await supabase
    .from('agent_files')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}
