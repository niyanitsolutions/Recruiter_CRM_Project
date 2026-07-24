import { useState } from 'react'
import { Star, Bookmark, Tag, Send, X } from 'lucide-react'
import toast from 'react-hot-toast'
import telephonyService from '../../services/telephonyService'

/**
 * Metadata-only review controls for a recording — favorite, bookmark, tags,
 * comment thread. Never touches the provider's actual recording, only the
 * additive is_favorited/is_bookmarked/tags/review_comments fields already
 * on telephony_call_logs (see set_recording_review in telephony_service.py).
 */
export default function RecordingReviewPanel({ log, onChange }) {
  const [tagInput, setTagInput] = useState('')
  const [commentInput, setCommentInput] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async (patch) => {
    setSaving(true)
    try {
      await telephonyService.setRecordingReview(log.call_id, patch)
      onChange({ ...log, ...patch, ...(patch.comment ? {
        review_comments: [...(log.review_comments || []), { text: patch.comment, created_at: new Date().toISOString() }],
      } : {}) })
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save review.')
    } finally {
      setSaving(false)
    }
  }

  const toggleFavorite = () => save({ favorited: !log.is_favorited })
  const toggleBookmark = () => save({ bookmarked: !log.is_bookmarked })

  const addTag = (e) => {
    e.preventDefault()
    const tag = tagInput.trim()
    if (!tag) return
    const tags = [...new Set([...(log.tags || []), tag])]
    save({ tags })
    setTagInput('')
  }

  const removeTag = (tag) => save({ tags: (log.tags || []).filter(t => t !== tag) })

  const addComment = (e) => {
    e.preventDefault()
    const comment = commentInput.trim()
    if (!comment) return
    save({ comment })
    setCommentInput('')
  }

  return (
    <div className="space-y-3 max-w-lg">
      <div className="flex items-center gap-2">
        <button
          type="button" disabled={saving} onClick={toggleFavorite}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${log.is_favorited ? 'bg-amber-50 text-amber-600' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}
        >
          <Star className="w-3.5 h-3.5" fill={log.is_favorited ? 'currentColor' : 'none'} /> Favorite
        </button>
        <button
          type="button" disabled={saving} onClick={toggleBookmark}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${log.is_bookmarked ? 'bg-primary-50 text-primary-600' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}
        >
          <Bookmark className="w-3.5 h-3.5" fill={log.is_bookmarked ? 'currentColor' : 'none'} /> Bookmark
        </button>
      </div>

      <div>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {(log.tags || []).map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-100 text-surface-600 text-xs">
              <Tag className="w-3 h-3" /> {tag}
              <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-500"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
        <form onSubmit={addTag} className="flex gap-2">
          <input
            type="text" value={tagInput} onChange={e => setTagInput(e.target.value)}
            placeholder="Add a tag…" className="input-field text-xs py-1.5 flex-1"
          />
          <button type="submit" className="px-2.5 py-1.5 rounded-lg bg-surface-100 hover:bg-surface-200 text-xs">Add</button>
        </form>
      </div>

      <div>
        <div className="space-y-1.5 max-h-32 overflow-y-auto mb-1.5">
          {(log.review_comments || []).map((c, idx) => (
            <div key={idx} className="text-xs text-surface-600 bg-surface-50 rounded-lg px-2.5 py-1.5">
              {c.text}
              <span className="text-surface-400 ml-2">{c.created_at ? new Date(c.created_at).toLocaleString() : ''}</span>
            </div>
          ))}
        </div>
        <form onSubmit={addComment} className="flex gap-2">
          <input
            type="text" value={commentInput} onChange={e => setCommentInput(e.target.value)}
            placeholder="Add a review comment…" className="input-field text-xs py-1.5 flex-1"
          />
          <button type="submit" className="px-2.5 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs"><Send className="w-3.5 h-3.5" /></button>
        </form>
      </div>
    </div>
  )
}
