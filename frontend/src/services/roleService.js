import api from './api'

const roleService = {
  // Get all roles
  getRoles: async (params = {}) => {
    const response = await api.get('/roles/', { params })
    return response.data
  },

  // Get role by ID
  getRole: async (roleId) => {
    const response = await api.get(`/roles/${roleId}`)
    return response.data
  },

  // Create new role
  createRole: async (roleData) => {
    const response = await api.post('/roles/', roleData)
    return response.data
  },

  // Update role
  updateRole: async (roleId, roleData) => {
    const response = await api.put(`/roles/${roleId}`, roleData)
    return response.data
  },

  // Delete role
  deleteRole: async (roleId) => {
    const response = await api.delete(`/roles/${roleId}`)
    return response.data
  },

  // Get all permissions
  getAllPermissions: async () => {
    const response = await api.get('/roles/permissions')
    return response.data
  },

  // Initialize system roles
  initializeSystemRoles: async () => {
    const response = await api.post('/roles/initialize')
    return response.data
  },

  // Assign role to user
  assignRoleToUser: async (userId, roleName) => {
    const response = await api.post('/roles/assign', null, {
      params: { user_id: userId, role_name: roleName }
    })
    return response.data
  },

  // Get default permissions for a system role (used by Reset to Default)
  getDefaultPermissions: async (roleName) => {
    const response = await api.get(`/roles/defaults/${roleName}`)
    return response.data
  },
}

export default roleService