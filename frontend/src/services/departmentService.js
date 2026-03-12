import api from './api'

const departmentService = {
  // Get all departments
  getDepartments: async (params = {}) => {
    const response = await api.get('/departments/', { params })
    return response.data
  },

  // Get department tree
  getDepartmentTree: async () => {
    const response = await api.get('/departments/tree')
    return response.data
  },

  // Get department by ID
  getDepartment: async (deptId) => {
    const response = await api.get(`/departments/${deptId}`)
    return response.data
  },

  // Create new department
  createDepartment: async (deptData) => {
    const response = await api.post('/departments/', deptData)
    return response.data
  },

  // Update department
  updateDepartment: async (deptId, deptData) => {
    const response = await api.put(`/departments/${deptId}`, deptData)
    return response.data
  },

  // Delete department
  deleteDepartment: async (deptId) => {
    const response = await api.delete(`/departments/${deptId}`)
    return response.data
  },

  // Get users in department
  getDepartmentUsers: async (deptId, params = {}) => {
    const response = await api.get(`/departments/${deptId}/users`, { params })
    return response.data
  },
}

export default departmentService