import api from './api'

const matchingService = {
  /**
   * Compute (or refresh) match scores for all candidates against a job.
   * Stores results in matching_results collection.
   */
  runMatching: async (jobId) => {
    const response = await api.post(`/jobs/${jobId}/run-matching`)
    return response.data
  },

  /**
   * Fetch stored matching results for a job (sorted by final_score desc).
   */
  getMatchingResults: async (jobId) => {
    const response = await api.get(`/jobs/${jobId}/matching-results`)
    return response.data
  },

  /**
   * Fetch eligible candidates (score >= 60, percentage ok) who also have
   * an application — used to populate the Interview scheduling form.
   */
  getEligibleForInterview: async (jobId) => {
    const response = await api.get(`/jobs/${jobId}/eligible-for-interview`)
    return response.data
  },
}

export default matchingService
