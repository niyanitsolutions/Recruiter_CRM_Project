import api from './api'

const BASE = '/trash'

const trashService = {
  // List deleted records — optionally filtered by module
  list: (module = '') => {
    const params = module ? { module } : {}
    return api.get(BASE, { params }).then(r => r.data)
  },

  // Restore a soft-deleted record
  restore: (module, id) =>
    api.post(`${BASE}/${module}/${id}/restore`).then(r => r.data),

  // Permanently delete a record (irreversible)
  permanentDelete: (module, id) =>
    api.delete(`${BASE}/${module}/${id}`).then(r => r.data),
}

export default trashService
