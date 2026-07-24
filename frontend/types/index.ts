export type WorkerStatus = 'pending' | 'in-progress' | 'review' | 'done' | 'blocked'

export interface Message {
  id: string
  sender: 'agent' | 'worker'
  content: string
  timestamp: string
}

export interface Worker {
  id: string
  name: string
  teracId: string
  subtaskTitle: string
  status: WorkerStatus
  lastMessage: string
  lastUpdated: string
  position: [number, number, number]  // desk position in 3D scene
  messages: Message[]
  linqPhone?: string
  linqConversationId?: string
}
