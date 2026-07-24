'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const [problem, setProblem] = useState('')
  const [deadline, setDeadline] = useState('')
  const [workerCount, setWorkerCount] = useState(6)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    // In production: POST /api/jobs and get jobId back
    // For demo: navigate to a mock job dashboard
    await new Promise((r) => setTimeout(r, 1200))
    router.push('/dashboard/demo-job-001')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="text-5xl mb-3">🏢</div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Minion HQ</h1>
          <p className="mt-2 text-gray-400">Describe your job. We'll deploy the workers.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-gray-900 border border-gray-800 rounded-2xl p-8 space-y-6 shadow-2xl"
        >
          {/* Problem statement */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              What needs to get done?
            </label>
            <textarea
              className="w-full bg-gray-800 border border-gray-700 rounded-xl p-4 text-white placeholder-gray-500 resize-none h-36 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="e.g. Build a user authentication system with JWT, including REST API, database schema, unit tests, and documentation..."
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              required
            />
          </div>

          <div className="flex gap-4">
            {/* Deadline */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-300 mb-2">Deadline</label>
              <input
                type="datetime-local"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>

            {/* Worker count */}
            <div className="w-40">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Workers
              </label>
              <div className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-xl p-3">
                <button
                  type="button"
                  onClick={() => setWorkerCount(Math.max(1, workerCount - 1))}
                  className="text-gray-400 hover:text-white font-bold text-lg leading-none"
                >
                  −
                </button>
                <span className="flex-1 text-center font-semibold text-white">{workerCount}</span>
                <button
                  type="button"
                  onClick={() => setWorkerCount(Math.min(12, workerCount + 1))}
                  className="text-gray-400 hover:text-white font-bold text-lg leading-none"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !problem.trim()}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-colors text-sm"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Deploying workers...
              </span>
            ) : (
              'Deploy Workers'
            )}
          </button>
        </form>

        <p className="text-center text-xs text-gray-600 mt-6">
          Powered by Claude · Terac · Linq
        </p>
      </div>
    </main>
  )
}
