import api from './api'

const pipelineService = {
  // List all pipelines
  getPipelines: async (params = {}) => {
    const response = await api.get('/pipelines/', { params })
    return response.data
  },

  // Get pipeline by ID
  getPipeline: async (pipelineId) => {
    const response = await api.get(`/pipelines/${pipelineId}`)
    return response.data
  },

  // Get pipeline attached to a job
  getPipelineForJob: async (jobId) => {
    const response = await api.get(`/pipelines/job/${jobId}`)
    return response.data
  },

  // Get stages for a job (ordered, ready for interview dropdown)
  getStagesForJob: async (jobId) => {
    const response = await api.get(`/pipelines/job/${jobId}/stages`)
    return response.data
  },

  // Create pipeline
  createPipeline: async (pipelineData) => {
    const response = await api.post('/pipelines/', pipelineData)
    return response.data
  },

  // Update pipeline
  updatePipeline: async (pipelineId, pipelineData) => {
    const response = await api.put(`/pipelines/${pipelineId}`, pipelineData)
    return response.data
  },

  // Delete pipeline
  deletePipeline: async (pipelineId) => {
    const response = await api.delete(`/pipelines/${pipelineId}`)
    return response.data
  },
}

export default pipelineService
