import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Edit, Trash2, Award, Users } from 'lucide-react'
import designationService from '../../services/designationService'
import usePermissions from '../../hooks/usePermissions'

const Designations = () => {
  const { has } = usePermissions()
  const [designations, setDesignations] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteDialog, setDeleteDialog] = useState({ open: false, desig: null })

  useEffect(() => { fetchDesignations() }, [])

  const fetchDesignations = async () => {
    try {
      setLoading(true)
      const response = await designationService.getDesignations()
      setDesignations(response.data || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const handleDelete = async () => {
    try {
      await designationService.deleteDesignation(deleteDialog.desig.id)
      setDeleteDialog({ open: false, desig: null })
      fetchDesignations()
    } catch (err) { alert(err.response?.data?.detail || 'Failed to delete') }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Designations</h1>
          <p className="text-surface-500 mt-1">Manage job titles and positions</p>
        </div>
        {has('designations:create') && (
          <Link to="/designations/new" className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white rounded-lg">
            <Plus className="w-4 h-4" /> Add Designation
          </Link>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-surface-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-50 border-b">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-semibold text-surface-600 uppercase">Designation</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-surface-600 uppercase">Level</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-surface-600 uppercase">Department</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-surface-600 uppercase">Users</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-surface-600 uppercase">Status</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-surface-600 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-surface-500">Loading...</td></tr>
            ) : designations.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-surface-500">No designations found</td></tr>
            ) : (
              designations.map(desig => (
                <tr key={desig.id} className="hover:bg-surface-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Award className="w-5 h-5 text-surface-400" />
                      <span className="font-medium text-surface-900">{desig.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-surface-100 text-surface-700 rounded text-sm">{desig.level_name || `Level ${desig.level}`}</span>
                  </td>
                  <td className="px-6 py-4 text-surface-600">{desig.department_name || '-'}</td>
                  <td className="px-6 py-4"><span className="flex items-center gap-1"><Users className="w-4 h-4" /> {desig.user_count || 0}</span></td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs ${desig.is_active ? 'bg-green-100 text-green-700' : 'bg-surface-100 text-surface-600'}`}>
                      {desig.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {has('designations:edit') && (
                        <Link to={`/designations/${desig.id}/edit`} className="p-2 hover:bg-surface-100 rounded-lg"><Edit className="w-4 h-4 text-surface-500" /></Link>
                      )}
                      {has('designations:delete') && (
                        <button onClick={() => setDeleteDialog({ open: true, desig })} className="p-2 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4 text-red-500" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {deleteDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setDeleteDialog({ open: false, desig: null })} />
          <div className="relative bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold">Delete Designation</h3>
            <p className="mt-2 text-surface-600">Are you sure you want to delete "{deleteDialog.desig?.name}"?</p>
            <div className="mt-6 flex gap-3 justify-end">
              <button onClick={() => setDeleteDialog({ open: false, desig: null })} className="px-4 py-2 text-surface-700 hover:bg-surface-100 rounded-lg">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Designations