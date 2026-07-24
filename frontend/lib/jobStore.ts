export interface JobConfig {
  problem: string
  workerCount: number
  deadline: string
  linqPhone: string
}

const KEY = 'yc-hack-job'

export const jobStore = {
  save(data: Partial<JobConfig>) {
    if (typeof window === 'undefined') return
    const current = this.get()
    localStorage.setItem(KEY, JSON.stringify({ ...current, ...data }))
  },
  get(): Partial<JobConfig> {
    if (typeof window === 'undefined') return {}
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}')
    } catch {
      return {}
    }
  },
}
