import api from './api'

const taskService = {
  getTasks: async (params = {}) => {
    const response = await api.get('/tasks/', { params })
    return response.data
  },
  getTask: async (id) => {
    const response = await api.get(`/tasks/${id}`)
    return response.data
  },
  createTask: async (data) => {
    const response = await api.post('/tasks/', data)
    return response.data
  },
  updateTask: async (id, data) => {
    const response = await api.put(`/tasks/${id}`, data)
    return response.data
  },
  deleteTask: async (id) => {
    const response = await api.delete(`/tasks/${id}`)
    return response.data
  },
}

export default taskService
