import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Edit, Trash2, Shield, Users, MoreVertical, Lock } from 'lucide-react'
import roleService from '../../services/roleService'

const Roles = () => {
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteDialog, setDeleteDialog] = useState({ open: false, role: null })
  const [openMenuId, setOpenMenuId] = useState(null)   // which role's 3-dot menu is open
  const menuRef = useRef(null)

  // Close menu when clicking anywhere outside it
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    fetchRoles()
  }, [])

  const fetchRoles = async () => {
    try {
      setLoading(true)
      const response = await roleService.getRoles()
      setRoles(response.data || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const handleDelete = async () => {
    try {
      await roleService.deleteRole(deleteDialog.role.id)
      setDeleteDialog({ open: false, role: null })
      fetchRoles()
    } catch (err) { console.error(err) }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Roles</h1>
          <p className="text-surface-500 mt-1">Manage roles and permissions</p>
        </div>
        <Link to="/roles/new" className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white rounded-lg">
          <Plus className="w-4 h-4" /> Add Role
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          [1,2,3].map(i => <div key={i} className="h-40 bg-surface-200 rounded-xl animate-pulse"></div>)
        ) : roles.length === 0 ? (
          <p className="col-span-full text-center text-surface-500 py-8">No roles found</p>
        ) : (
          roles.map(role => (
            <div key={role.id} className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${role.is_system_role ? 'bg-purple-100' : 'bg-accent-100'}`}>
                    <Shield className={`w-5 h-5 ${role.is_system_role ? 'text-purple-600' : 'text-accent-600'}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-surface-900">{role.display_name}</h3>
                    {role.is_system_role && (
                      <span className="flex items-center gap-1 text-xs text-purple-600">
                        <Lock className="w-3 h-3" /> System Role
                      </span>
                    )}
                  </div>
                </div>
                {!role.is_system_role && (
                  <div className="relative" ref={openMenuId === role.id ? menuRef : null}>
                    <button
                      className="p-1 hover:bg-surface-100 rounded"
                      onClick={() => setOpenMenuId(openMenuId === role.id ? null : role.id)}
                    >
                      <MoreVertical className="w-4 h-4 text-surface-400" />
                    </button>
                    {openMenuId === role.id && (
                      <div className="absolute right-0 mt-1 w-32 bg-white rounded-lg shadow-lg border z-10">
                        <Link
                          to={`/roles/${role.id}/edit`}
                          className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-50"
                          onClick={() => setOpenMenuId(null)}
                        >
                          <Edit className="w-4 h-4" /> Edit
                        </Link>
                        <button
                          onClick={() => { setDeleteDialog({ open: true, role }); setOpenMenuId(null) }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <p className="text-sm text-surface-500 mb-4">{role.description || 'No description'}</p>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1 text-surface-600">
                  <Users className="w-4 h-4" /> {role.user_count || 0} users
                </span>
                <span className="text-surface-500">{role.permissions?.length || 0} permissions</span>
              </div>
            </div>
          ))
        )}
      </div>

      {deleteDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setDeleteDialog({ open: false, role: null })} />
          <div className="relative bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold">Delete Role</h3>
            <p className="mt-2 text-surface-600">Are you sure you want to delete "{deleteDialog.role?.display_name}"?</p>
            <div className="mt-6 flex gap-3 justify-end">
              <button onClick={() => setDeleteDialog({ open: false, role: null })} className="px-4 py-2 text-surface-700 hover:bg-surface-100 rounded-lg">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Roles