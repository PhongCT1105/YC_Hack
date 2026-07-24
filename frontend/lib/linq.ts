// Linq client — wraps the Linq messaging API
// Agents use this to send/receive messages with workers via SMS

export interface LinqConversation {
  id: string
  workerId: string
  taskId: string
  createdAt: string
}

export interface LinqMessage {
  id: string
  conversationId: string
  sender: 'agent' | 'worker' | 'pm'
  content: string
  attachments?: { name: string; url: string; type: string }[]
  timestamp: string
}

async function linqFetch(path: string, options?: RequestInit): Promise<unknown> {
  const baseUrl = process.env.LINQ_API_URL ?? process.env.NEXT_PUBLIC_LINQ_API_URL ?? ''
  const apiKey = process.env.LINQ_API_KEY ?? process.env.NEXT_PUBLIC_LINQ_API_KEY ?? ''
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })
  if (!res.ok) {
    throw new Error(`Linq API ${res.status}: ${await res.text()}`)
  }
  return res.json()
}

export async function createConversation(
  workerId: string,
  taskContext: {
    title: string
    description: string
    acceptanceCriteria: string[]
    deadline: string
  }
): Promise<LinqConversation> {
  return linqFetch('/conversations', {
    method: 'POST',
    body: JSON.stringify({
      participant_id: workerId,
      metadata: { task_title: taskContext.title },
      initial_message: formatTaskBrief(taskContext),
    }),
  }) as Promise<LinqConversation>
}

export async function sendMessage(
  conversationId: string,
  content: string,
  attachments: { name: string; url: string; type: string }[] = []
): Promise<LinqMessage> {
  return linqFetch(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, attachments, sender_type: 'agent' }),
  }) as Promise<LinqMessage>
}

export async function getMessages(
  conversationId: string,
  since?: string
): Promise<LinqMessage[]> {
  const qs = since ? `?since=${encodeURIComponent(since)}` : ''
  const data = await linqFetch(`/conversations/${conversationId}/messages${qs}`)
  return (data as { messages: LinqMessage[] }).messages
}

export async function getConversationsByParticipant(
  participantId: string
): Promise<LinqConversation[]> {
  const data = await linqFetch(`/conversations?participant_id=${encodeURIComponent(participantId)}`)
  return (data as { conversations: LinqConversation[] }).conversations ?? []
}

export async function fetchLinqThread(phone: string): Promise<LinqMessage[]> {
  const conversations = await getConversationsByParticipant(phone)
  if (conversations.length === 0) return []
  const messages = await getMessages(conversations[0].id)
  return messages
}

export async function pushContextSnippet(
  conversationId: string,
  excerpt: string,
  label: string
): Promise<void> {
  await sendMessage(conversationId, `[Context: ${label}]\n\n${excerpt}`)
}

function formatTaskBrief(ctx: {
  title: string
  description: string
  acceptanceCriteria: string[]
  deadline: string
}): string {
  return [
    `Hi! I'm your AI project coordinator for this task.`,
    ``,
    `Task: ${ctx.title}`,
    ctx.description,
    ``,
    `You're done when:`,
    ...ctx.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`),
    ``,
    `Deadline: ${ctx.deadline}`,
    ``,
    `Reply any time with questions. When complete, reply "DONE" and attach your work.`,
  ].join('\n')
}
