import React, { useState, useEffect } from 'react'
import { Clock, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react'
import hrmService from '../../services/hrmService'

const STATUS_COLORS = {
  present:  'bg-green-100 text-green-700',
  late:     'bg-yellow-100 text-yellow-700',
  absent:   'bg-red-100 text-red-700',
  on_leave: 'bg-blue-100 text-blue-700',
  wfh:      'bg-purple-100 text-purple-700',
  holiday:  'bg-gray-100 text-gray-600',
}

export default function Attendance() {
  const [records, setRecords]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [checking, setChecking]   = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await hrmService.getTeamToday()
      setRecords(res.data || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleCheckIn = async (empId) => {
    setChecking(empId + '_in')
    try { await hrmService.checkIn({ employee_id: empId }); load() } catch {}
    setChecking(null)
  }

  const handleCheckOut = async (empId) => {
    setChecking(empId + '_out')
    try { await hrmService.checkOut({ employee_id: empId }); load() } catch {}
    setChecking(null)
  }

  const fmt = (dt) => dt ? new Date(dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
          <p className="text-sm text-gray-500">Today — {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <button onClick={load} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Present', count: records.filter(r => ['present','late'].includes(r.status)).length, icon: CheckCircle, color: 'text-green-500' },
          { label: 'Absent',  count: records.filter(r => r.status === 'absent').length,  icon: XCircle,     color: 'text-red-500' },
          { label: 'Late',    count: records.filter(r => r.is_late).length,               icon: AlertCircle, color: 'text-yellow-500' },
          { label: 'On Leave',count: records.filter(r => r.status === 'on_leave').length, icon: Clock,       color: 'text-blue-500' },
        ].map(({ label, count, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <Icon className={`w-8 h-8 ${color}`} />
            <div>
              <p className="text-2xl font-bold text-gray-900">{count}</p>
              <p className="text-sm text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Employee', 'Status', 'Check In', 'Check Out', 'Hours', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
              ))
            ) : records.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No attendance records for today</td></tr>
            ) : records.map(rec => (
              <tr key={rec.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{rec.employee_name}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[rec.status] || 'bg-gray-100 text-gray-600'}`}>
                    {rec.status}
                    {rec.is_late && rec.late_by_minutes > 0 && ` (+${rec.late_by_minutes}m)`}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{fmt(rec.check_in)}</td>
                <td className="px-4 py-3 text-gray-600">{fmt(rec.check_out)}</td>
                <td className="px-4 py-3 text-gray-600">{rec.work_hours ? `${rec.work_hours}h` : '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {!rec.check_in && (
                      <button disabled={checking === rec.employee_id + '_in'} onClick={() => handleCheckIn(rec.employee_id)}
                        className="px-3 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600 disabled:opacity-50">
                        Check In
                      </button>
                    )}
                    {rec.check_in && !rec.check_out && (
                      <button disabled={checking === rec.employee_id + '_out'} onClick={() => handleCheckOut(rec.employee_id)}
                        className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 disabled:opacity-50">
                        Check Out
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
