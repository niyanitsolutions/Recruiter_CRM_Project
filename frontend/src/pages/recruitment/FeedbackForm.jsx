import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MessageSquare, ArrowLeft, Save, Star, ThumbsUp, ThumbsDown, Minus } from 'lucide-react'
import { toast } from 'react-hot-toast'
import interviewService from '../../services/interviewService'

const FeedbackForm = () => {
  const navigate = useNavigate()
  const { id } = useParams()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [interview, setInterview] = useState(null)

  const [formData, setFormData] = useState({
    overall_rating: 0,
    technical_skills: 0,
    communication: 0,
    problem_solving: 0,
    cultural_fit: 0,
    experience_relevance: 0,
    skill_ratings: [],
    result: 'pending',
    recommendation: '',
    strengths: '',
    weaknesses: '',
    detailed_feedback: ''
  })

  useEffect(() => {
    loadInterview()
  }, [id])

  const loadInterview = async () => {
    try {
      setLoading(true)
      const response = await interviewService.getInterview(id)
      setInterview(response.data)
      
      // Pre-populate if feedback exists
      if (response.data.feedback) {
        setFormData(prev => ({
          ...prev,
          ...response.data.feedback
        }))
      }
    } catch (error) {
      toast.error('Failed to load interview')
      navigate('/interviews')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleRating = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (formData.overall_rating === 0) {
      toast.error('Please provide an overall rating')
      return
    }

    if (formData.result === 'pending') {
      toast.error('Please select a result (Passed/Failed/On Hold)')
      return
    }

    try {
      setSaving(true)
      
      await interviewService.submitFeedback(id, formData)
      toast.success('Feedback submitted successfully')
      navigate('/interviews')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit feedback')
    } finally {
      setSaving(false)
    }
  }

  const RatingStars = ({ value, onChange, label }) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-surface-700">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className={`p-1 transition-colors ${
              star <= value ? 'text-yellow-400' : 'text-surface-300 hover:text-yellow-200'
            }`}
          >
            <Star className={`w-5 h-5 ${star <= value ? 'fill-current' : ''}`} />
          </button>
        ))}
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/interviews')}
          className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Submit Feedback</h1>
          <p className="text-surface-500">Provide interview assessment</p>
        </div>
      </div>

      {/* Interview Info */}
      {interview && (
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-4 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-surface-500">Candidate</p>
              <p className="font-medium text-surface-900">{interview.candidate_name}</p>
            </div>
            <div>
              <p className="text-surface-500">Job</p>
              <p className="font-medium text-surface-900">{interview.job_title}</p>
            </div>
            <div>
              <p className="text-surface-500">Stage</p>
              <p className="font-medium text-surface-900">{interview.stage_name}</p>
            </div>
            <div>
              <p className="text-surface-500">Date</p>
              <p className="font-medium text-surface-900">
                {new Date(interview.scheduled_date).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Result */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Interview Result</h2>
          
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, result: 'passed' }))}
              className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-lg border-2 transition-all ${
                formData.result === 'passed'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-surface-200 hover:border-green-300 text-surface-600'
              }`}
            >
              <ThumbsUp className="w-5 h-5" />
              <span className="font-medium">Passed</span>
            </button>
            
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, result: 'on_hold' }))}
              className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-lg border-2 transition-all ${
                formData.result === 'on_hold'
                  ? 'border-yellow-500 bg-yellow-50 text-yellow-700'
                  : 'border-surface-200 hover:border-yellow-300 text-surface-600'
              }`}
            >
              <Minus className="w-5 h-5" />
              <span className="font-medium">On Hold</span>
            </button>
            
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, result: 'failed' }))}
              className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-lg border-2 transition-all ${
                formData.result === 'failed'
                  ? 'border-red-500 bg-red-50 text-red-700'
                  : 'border-surface-200 hover:border-red-300 text-surface-600'
              }`}
            >
              <ThumbsDown className="w-5 h-5" />
              <span className="font-medium">Failed</span>
            </button>
          </div>
        </div>

        {/* Ratings */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Ratings</h2>
          
          <div className="divide-y divide-surface-100">
            <RatingStars
              label="Overall Rating"
              value={formData.overall_rating}
              onChange={(v) => handleRating('overall_rating', v)}
            />
            <RatingStars
              label="Technical Skills"
              value={formData.technical_skills}
              onChange={(v) => handleRating('technical_skills', v)}
            />
            <RatingStars
              label="Communication"
              value={formData.communication}
              onChange={(v) => handleRating('communication', v)}
            />
            <RatingStars
              label="Problem Solving"
              value={formData.problem_solving}
              onChange={(v) => handleRating('problem_solving', v)}
            />
            <RatingStars
              label="Cultural Fit"
              value={formData.cultural_fit}
              onChange={(v) => handleRating('cultural_fit', v)}
            />
            <RatingStars
              label="Experience Relevance"
              value={formData.experience_relevance}
              onChange={(v) => handleRating('experience_relevance', v)}
            />
          </div>
        </div>

        {/* Strengths & Weaknesses */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Assessment</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Strengths
              </label>
              <textarea
                name="strengths"
                value={formData.strengths}
                onChange={handleChange}
                className="input w-full"
                rows={4}
                placeholder="Key strengths observed..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Areas for Improvement
              </label>
              <textarea
                name="weaknesses"
                value={formData.weaknesses}
                onChange={handleChange}
                className="input w-full"
                rows={4}
                placeholder="Areas that need improvement..."
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Detailed Feedback
            </label>
            <textarea
              name="detailed_feedback"
              value={formData.detailed_feedback}
              onChange={handleChange}
              className="input w-full"
              rows={4}
              placeholder="Detailed feedback about the interview..."
            />
          </div>
        </div>

        {/* Recommendation */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Recommendation</h2>
          
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Your Recommendation
            </label>
            <select
              name="recommendation"
              value={formData.recommendation}
              onChange={handleChange}
              className="input w-full max-w-md"
            >
              <option value="">Select...</option>
              <option value="strongly_recommend">Strongly Recommend</option>
              <option value="recommend">Recommend</option>
              <option value="neutral">Neutral</option>
              <option value="not_recommend">Do Not Recommend</option>
              <option value="strongly_not_recommend">Strongly Do Not Recommend</option>
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/interviews')}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                Submitting...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Submit Feedback
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

export default FeedbackForm