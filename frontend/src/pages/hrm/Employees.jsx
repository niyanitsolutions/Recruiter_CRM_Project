import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, Edit2, Trash2, Eye, Users } from 'lucide-react'
import hrmService from '../../services/hrmService'
import TableScroll from '../../components/common/TableScroll'

const STATUS_STYLE = {
  active:     { background: 'var(--bg-success)', color: 'var(--text-success)' },
  inactive:   { background: 'var(--bg-card-alt)', color: 'var(--text-muted)' },
  terminated: { background: 'var(--bg-danger)',  color: 'var(--text-danger)' },
  on_leave:   { background: 'var(--bg-warning)', color: 'var(--text-warning)' },
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
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Employees</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{total} total</p>
        </div>
        <Link to="/hrm/employees/new" className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Add Employee
        </Link>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input className="input pl-9 w-full" placeholder="Search by name, email, ID…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-36" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="terminated">Terminated</option>
        </select>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <TableScroll>
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--bg-card-alt)', borderBottom: '1px solid var(--border-card)' }}>
            <tr>
              {['Employee ID', 'Name', 'Designation', 'Department', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody style={{ borderColor: 'var(--border-subtle)' }}>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3">
                  <div className="h-4 rounded animate-pulse" style={{ background: 'var(--bg-card-alt)' }} />
                </td></tr>
              ))
            ) : employees.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center" style={{ color: 'var(--text-muted)' }}>
                <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No employees found
              </td></tr>
            ) : employees.map(emp => (
              <tr key={emp.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{emp.employee_id}</td>
                <td className="px-4 py-3">
                  <div className="font-medium" style={{ color: 'var(--text-heading)' }}>{emp.full_name}</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{emp.email}</div>
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{emp.designation_name || '—'}</td>
                <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{emp.department_name || '—'}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={STATUS_STYLE[emp.employment_status] ?? { background: 'var(--bg-card-alt)', color: 'var(--text-muted)' }}>
                    {emp.employment_status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => navigate(`/hrm/employees/${emp.id}`)} className="p-1.5 rounded" style={{ color: 'var(--text-info)' }} title="View"><Eye className="w-4 h-4" /></button>
                    <button onClick={() => navigate(`/hrm/employees/${emp.id}/edit`)} className="p-1.5 rounded" style={{ color: 'var(--text-warning)' }} title="Edit"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(emp.id, emp.full_name)} className="p-1.5 rounded" style={{ color: 'var(--text-danger)' }} title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </TableScroll>
        {total > 20 && (
          <div className="flex items-center justify-between px-4 py-3 text-sm" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Page {page} of {Math.ceil(total / 20)}</span>
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
