import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, Edit2, Trash2, Eye, Users } from 'lucide-react'
import hrmService from '../../services/hrmService'

const STATUS_COLORS = {
  active:     'bg-green-100 text-green-700',
  inactive:   'bg-gray-100 text-gray-600',
  terminated: 'bg-red-100 text-red-700',
  on_leave:   'bg-yellow-100 text-yellow-700',
}

export default function Employees() {
  const navigate = useNavigate()
  const [employees, setEmployees] = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [status, setStatus]       = useState('')
  const [loading, setLoading]     = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await hrmService.listEmployees({ page, page_size: 20, search: search || undefined, status: status || undefined })
      setEmployees(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [page, status])
  useEffect(() => {
    const t = setTimeout(load, 400)
    return () => clearTimeout(t)
  }, [search])

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete employee "${name}"?`)) return
    await hrmService.deleteEmployee(id)
    load()
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500">{total} total</p>
        </div>
        <Link to="/hrm/employees/new" className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Add Employee
        </Link>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-9 w-full" placeholder="Search by name, email, ID…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-36" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="terminated">Terminated</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Employee ID', 'Name', 'Designation', 'Department', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
              ))
            ) : employees.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                No employees found
              </td></tr>
            ) : employees.map(emp => (
              <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{emp.employee_id}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{emp.full_name}</div>
                  <div className="text-xs text-gray-400">{emp.email}</div>
                </td>
                <td className="px-4 py-3 text-gray-600">{emp.designation_name || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{emp.department_name || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[emp.employment_status] || 'bg-gray-100 text-gray-600'}`}>
                    {emp.employment_status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => navigate(`/hrm/employees/${emp.id}`)} className="p-1.5 hover:bg-blue-50 rounded text-blue-500" title="View"><Eye className="w-4 h-4" /></button>
                    <button onClick={() => navigate(`/hrm/employees/${emp.id}/edit`)} className="p-1.5 hover:bg-yellow-50 rounded text-yellow-500" title="Edit"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(emp.id, emp.full_name)} className="p-1.5 hover:bg-red-50 rounded text-red-500" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {total > 20 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm">
            <span className="text-gray-500">Page {page} of {Math.ceil(total / 20)}</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary disabled:opacity-50">Previous</button>
              <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)} className="btn-secondary disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
