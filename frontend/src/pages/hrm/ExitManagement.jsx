import React, { useState, useEffect, useCallback } from 'react'
import {
  DoorOpen, Plus, Search, Loader2, X, ChevronDown, ChevronRight,
  CheckCircle, Clock, AlertCircle, CheckSquare, Square, UserMinus,
  Calendar, FileText, Package,
} from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'

const EXIT_TYPES = ['resignation', 'termination', 'retirement', 'contract_end', 'absconding']
const EXIT_STATUSES = ['submitted', 'in_notice', 'cleared', 'completed', 'cancelled']

const STATUS_STYLE = {
  draft:      'bg-gray-100 text-gray-600',
  submitted:  'bg-amber-100 text-amber-700',
  in_notice:  'bg-blue-100 text-blue-700',
  cleared:    'bg-purple-100 text-purple-700',
  completed:  'bg-green-100 text-green-700',
  cancelled:  'bg-red-100 text-red-600',
}

const STATUS_LABEL = {
  draft: 'Draft', submitted: 'Submitted', in_notice: 'In Notice',
  cleared: 'Cleared', completed: 'Completed', cancelled: 'Cancelled',
}

function NewExitModal({ onClose, onCreated }) {
  const [employees, setEmployees] = useState([])
  const [empSearch, setEmpSearch] = useState('')
  const [form, setForm] = useState({
    employee_id: '',
    exit_type: 'resignation',
    resignation_date: new Date().toISOString().split('T')[0],
    notice_period_days: 30,
    reason: '',
    detailed_reason: '',
  })
  const [loading, setLoading] = useState(false)
  const [empLoading, setEmpLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedEmp, setSelectedEmp] = useState(null)

  useEffect(() => {
    const load = async () => {
      setEmpLoading(true)
      try {
        const res = await hrmService.listEmployees({ status: 'active', page_size: 200 })
        setEmployees(res.data.items || [])
      } catch {}
      setEmpLoading(false)
    }
    load()
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const filteredEmps = empSearch
    ? employees.filter(e => e.full_name?.toLowerCase().includes(empSearch.toLowerCase()))
    : employees

  const handleCreate = async () => {
    if (!form.employee_id) { toast.error('Select an employee'); return }
    if (!form.reason.trim()) { toast.error('Reason is required'); return }
    setLoading(true)
    try {
      await hrmService.createExitRequest({
        ...form,
        notice_period_days: parseInt(form.notice_period_days) || 30,
      })
      toast.success('Exit request created')
      onCreated()
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to create exit request')
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-900">New Exit Request</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Employee selector */}
          <div className="relative">
            <label className="input-label">Employee <span className="text-red-500">*</span></label>
            <div
              className="input flex items-center justify-between cursor-pointer"
              onClick={() => setShowDropdown(d => !d)}
            >
              <span className={selectedEmp ? 'text-gray-900' : 'text-gray-400'}>
                {selectedEmp ? selectedEmp.full_name : 'Select employee…'}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </div>
            {showDropdown && (
              <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                <div className="p-2">
                  <input className="input text-sm" placeholder="Search…" value={empSearch}
                    onChange={e => setEmpSearch(e.target.value)} onClick={e => e.stopPropagation()} autoFocus />
                </div>
                {empLoading && <div className="py-3 text-center"><Loader2 className="w-4 h-4 animate-spin text-gray-400 inline" /></div>}
                {filteredEmps.map(emp => (
                  <button key={emp._id || emp.id}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                    onClick={() => {
                      setSelectedEmp(emp)
                      set('employee_id', emp._id || emp.id)
                      setShowDropdown(false)
                    }}>
                    {emp.full_name} <span className="text-gray-400 text-xs">· {emp.designation_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Exit Type</label>
              <select className="input" value={form.exit_type} onChange={e => set('exit_type', e.target.value)}>
                {EXIT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Notice Period (days)</label>
              <input className="input" type="number" min="0" value={form.notice_period_days}
                onChange={e => set('notice_period_days', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="input-label">Resignation / Exit Date <span className="text-red-500">*</span></label>
              <input className="input" type="date" value={form.resignation_date}
                onChange={e => set('resignation_date', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="input-label">Reason <span className="text-red-500">*</span></label>
            <input className="input" placeholder="Short reason" value={form.reason}
              onChange={e => set('reason', e.target.value)} />
          </div>
          <div>
            <label className="input-label">Detailed Reason</label>
            <textarea className="input resize-none" rows={3} placeholder="Optional detailed explanation"
              value={form.detailed_reason} onChange={e => set('detailed_reason', e.target.value)} />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleCreate} disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Request
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[status] || 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABEL[status] || status}
    </span>
  )
}

function ExitCard({ exit: ex, onRefresh }) {
  const [expanded, setExpanded] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [checkLoading, setCheckLoading] = useState(false)

  const completedItems = (ex.checklist || []).filter(i => i.completed).length
  const totalItems = (ex.checklist || []).length

  const handleStatusChange = async (status) => {
    setUpdating(true)
    try {
      await hrmService.updateExitStatus(ex.id, { status })
      toast.success(`Status updated to ${STATUS_LABEL[status]}`)
      onRefresh()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to update status')
    }
    setUpdating(false)
  }

  const toggleChecklist = async (index) => {
    setCheckLoading(true)
    try {
      await hrmService.toggleChecklistItem(ex.id, index)
      onRefresh()
    } catch { toast.error('Failed') }
    setCheckLoading(false)
  }

  const handleCancel = async () => {
    if (!confirm('Cancel this exit request?')) return
    try {
      await hrmService.cancelExitRequest(ex.id)
      toast.success('Exit request cancelled')
      onRefresh()
    } catch { toast.error('Failed to cancel') }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:border-indigo-200 transition-colors">
      {/* Summary row */}
      <div
        className="flex items-center gap-4 p-4 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="w-10 h-10 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
          {ex.employee_name?.charAt(0) || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">{ex.employee_name}</p>
          <p className="text-xs text-gray-400">
            {ex.designation_name} {ex.department_name ? `· ${ex.department_name}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={ex.status} />
          {totalItems > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-14 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div className="h-1.5 rounded-full bg-indigo-400"
                     style={{ width: `${(completedItems / totalItems) * 100}%` }} />
              </div>
              <span className="text-[10px] text-gray-400">{Math.round((completedItems / totalItems) * 100)}%</span>
            </div>
          )}
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-4 bg-gray-50">
          {/* Key dates */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-xl p-3 border border-gray-100">
              <p className="text-xs text-gray-400 mb-0.5">Exit Type</p>
              <p className="text-sm font-medium text-gray-800 capitalize">{ex.exit_type?.replace(/_/g, ' ')}</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-gray-100">
              <p className="text-xs text-gray-400 mb-0.5">Resignation Date</p>
              <p className="text-sm font-medium text-gray-800">
                {ex.resignation_date ? new Date(ex.resignation_date).toLocaleDateString('en-IN') : '—'}
              </p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-gray-100">
              <p className="text-xs text-gray-400 mb-0.5">Last Working Day</p>
              <p className="text-sm font-medium text-gray-800">
                {ex.last_working_date ? new Date(ex.last_working_date).toLocaleDateString('en-IN') : '—'}
              </p>
            </div>
          </div>

          {/* Reason */}
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-xs text-gray-400 mb-1">Reason</p>
            <p className="text-sm text-gray-700">{ex.reason}</p>
            {ex.detailed_reason && <p className="text-xs text-gray-500 mt-1">{ex.detailed_reason}</p>}
          </div>

          {/* Checklist with progress */}
          {ex.checklist?.length > 0 && (
            <div className="bg-white rounded-xl p-4 border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700">Exit Checklist</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{completedItems}/{totalItems}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: completedItems === totalItems ? '#d1fae5' : completedItems > 0 ? '#fef3c7' : '#f1f5f9',
                          color: completedItems === totalItems ? '#10b981' : completedItems > 0 ? '#f59e0b' : '#94a3b8',
                        }}>
                    {totalItems ? Math.round((completedItems / totalItems) * 100) : 0}%
                  </span>
                </div>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-gray-100 rounded-full h-2 mb-4 overflow-hidden">
                <div
                  className="h-2 rounded-full transition-all duration-500"
                  style={{
                    width: totalItems ? `${(completedItems / totalItems) * 100}%` : '0%',
                    background: completedItems === totalItems
                      ? 'linear-gradient(90deg, #10b981, #34d399)'
                      : 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                  }}
                />
              </div>
              <div className="space-y-1">
                {ex.checklist.map((item, i) => (
                  <button
                    key={i}
                    disabled={checkLoading || ['completed', 'cancelled'].includes(ex.status)}
                    onClick={() => toggleChecklist(i)}
                    className="w-full flex items-center gap-3 text-left rounded-xl px-3 py-2.5 transition-colors hover:bg-gray-50 disabled:cursor-default"
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      item.completed ? 'bg-green-500 border-green-500' : 'border-gray-300 bg-white'
                    }`}>
                      {item.completed && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className={`text-sm flex-1 ${item.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                      {item.item}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Status actions */}
          {!['completed', 'cancelled'].includes(ex.status) && (
            <div className="flex flex-wrap gap-2">
              {ex.status === 'submitted' && (
                <button onClick={() => handleStatusChange('in_notice')} disabled={updating}
                  className="btn-secondary text-xs flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Acknowledge → In Notice
                </button>
              )}
              {ex.status === 'in_notice' && (
                <button onClick={() => handleStatusChange('cleared')} disabled={updating}
                  className="btn-secondary text-xs flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-purple-600" /> Mark Cleared
                </button>
              )}
              {ex.status === 'cleared' && (
                <button onClick={() => handleStatusChange('completed')} disabled={updating}
                  className="btn-primary text-xs flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" /> Complete Exit
                </button>
              )}
              <button onClick={handleCancel} disabled={updating}
                className="btn-secondary text-xs text-red-500 border-red-200 hover:bg-red-50 flex items-center gap-1.5">
                <X className="w-3.5 h-3.5" /> Cancel Request
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ExitManagement() {
  const [exits, setExits]         = useState([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [filterStatus, setFilter] = useState('')
  const [page, setPage]           = useState(1)
  const [showNew, setShowNew]     = useState(false)
  const PAGE_SIZE = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await hrmService.listExitRequests({
        search: search || undefined,
        status: filterStatus || undefined,
        page,
        page_size: PAGE_SIZE,
      })
      setExits(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch {}
    setLoading(false)
  }, [search, filterStatus, page])

  useEffect(() => { setPage(1) }, [search, filterStatus])
  useEffect(() => { load() }, [load])

  // Status counts from loaded page
  const counts = exits.reduce((acc, e) => { acc[e.status] = (acc[e.status] || 0) + 1; return acc }, {})

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <DoorOpen className="w-6 h-6 text-red-500" />
            Exit Management
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">{total} exit request{total !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Exit Request
        </button>
      </div>

      {/* Status filter chips */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilter('')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all
            ${filterStatus === '' ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>
          All ({total})
        </button>
        {EXIT_STATUSES.map(s => (
          <button key={s} onClick={() => setFilter(filterStatus === s ? '' : s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all
              ${filterStatus === s ? 'ring-2 ring-offset-1 ' + STATUS_STYLE[s] : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search employee name…" className="input pl-9 text-sm" />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-red-400" /></div>
      ) : exits.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <DoorOpen className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          No exit requests found.
        </div>
      ) : (
        <div className="space-y-3">
          {exits.map(ex => (
            <ExitCard key={ex.id} exit={ex} onRefresh={load} />
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40">Prev</button>
            <button disabled={page * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)} className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      {showNew && <NewExitModal onClose={() => setShowNew(false)} onCreated={load} />}
    </div>
  )
}
