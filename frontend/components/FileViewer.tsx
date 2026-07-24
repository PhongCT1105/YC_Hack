'use client'

import { useState, useEffect } from 'react'

export interface ViewableFile {
  id?: string        // Supabase row ID (only set in live mode)
  filename: string
  content: string
  fileType: 'md' | 'json'
}

interface FileViewerProps {
  file: ViewableFile | null
  onClose: () => void
  // Called after a successful update so the parent can sync local state.
  // id may be undefined in mock mode — parent handles that gracefully.
  onUpdate: (id: string | undefined, newContent: string) => Promise<void>
  isLive: boolean
}

export function FileViewer({ file, onClose, onUpdate, isLive }: FileViewerProps) {
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Reset editor when a different file is opened
  useEffect(() => {
    setContent(file?.content ?? '')
    setSavedAt(null)
    setSaveError(null)
  }, [file?.id, file?.filename])

  if (!file) return null

  const isJson = file.fileType === 'json'
  const isDirty = content !== file.content
  const justSaved = savedAt !== null && Date.now() - savedAt < 2500

  async function handleUpdate() {
    if (!isDirty || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await onUpdate(file!.id, content)
      setSavedAt(Date.now())
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setSaveError(msg)
      console.error('[FileViewer] update failed:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-[#0a0a0a] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8 flex-shrink-0">
        <button
          onClick={onClose}
          className="text-white/30 hover:text-white/60 transition-colors flex items-center gap-1.5 text-xs flex-shrink-0"
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/>
          </svg>
          Back
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <svg
            width="12" height="12" fill="none"
            stroke={isJson ? '#FBBF24' : '#60A5FA'}
            strokeWidth="1.5" viewBox="0 0 24 24"
            className="flex-shrink-0"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
          </svg>
          <span className="text-xs font-medium text-white/70 truncate">{file.filename}</span>
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0"
            style={{
              background: isJson ? 'rgba(251,191,36,0.1)' : 'rgba(96,165,250,0.1)',
              color: isJson ? '#FBBF24' : '#60A5FA',
            }}
          >
            {file.fileType.toUpperCase()}
          </span>
          {!isLive && (
            <span className="text-[10px] text-white/20 italic flex-shrink-0">mock</span>
          )}
          {isLive && !file.id && (
            <span className="text-[10px] text-amber-400/50 italic flex-shrink-0">no db id</span>
          )}
        </div>

        {/* Update — always shown, works in both mock and live */}
        <button
          onClick={handleUpdate}
          disabled={saving || !isDirty}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-25 flex-shrink-0"
          style={{
            background: justSaved ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.07)',
            color: justSaved ? 'rgb(134,239,172)' : 'white',
          }}
        >
          {saving ? (
            <>
              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Saving...
            </>
          ) : justSaved ? (
            '✓ Saved'
          ) : (
            'Update'
          )}
        </button>
      </div>

      {/* Error banner */}
      {saveError && (
        <div className="px-4 py-2 bg-red-950/60 border-b border-red-500/20 flex items-start gap-2 flex-shrink-0">
          <span className="text-red-400 text-[10px] font-mono leading-relaxed flex-1 break-all">{saveError}</span>
          <button onClick={() => setSaveError(null)} className="text-red-400/50 hover:text-red-400 text-xs flex-shrink-0">✕</button>
        </div>
      )}

      {/* Editor */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="flex-1 w-full bg-transparent text-white/80 font-mono text-xs leading-relaxed resize-none focus:outline-none p-4"
        spellCheck={false}
        placeholder="No content"
      />
    </div>
  )
}
