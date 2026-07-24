import { db } from '@/lib/db'

export async function buildGraphSummary(sprintId: string): Promise<string> {
  const { data: subtasks } = await db.from('subtasks').select('id,title').eq('sprint_id', sprintId)
  if (!subtasks?.length) return '(no findings yet)'
  const ids = subtasks.map((s) => s.id)
  const { data: findings } = await db.from('findings').select('subtask_id,text,confidence').in('subtask_id', ids).limit(60)
  if (!findings?.length) return '(no findings yet)'
  const byTask = new Map(subtasks.map((s) => [s.id, s.title]))
  return findings.map((f) => `- [${byTask.get(f.subtask_id)}] (${f.confidence}) ${f.text}`).join('\n')
}
