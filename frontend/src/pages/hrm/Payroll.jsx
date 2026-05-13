import React, { useState, useEffect } from 'react'
import { Banknote, Play, CheckCircle, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'
import TableScroll from '../../components/common/TableScroll'

const STATUS_COLORS = {
  draft:     'bg-gray-100 text-gray-600',
  processed: 'bg-blue-100 text-blue-700',
  paid:      'bg-green-100 text-green-700',
  on_hold:   'bg-yellow-100 text-yellow-700',
}

export default function Payroll() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear]   = useState(now.getFullYear())
  const [payslips, setPayslips] = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)
  const [generating, setGenerating] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await hrmService.listPayslips({ month, year, page, page_size: 20 })
      setPayslips(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [month, year, page])

  const generate = async () => {
    setGenerating(true)
    try {
      const res = await hrmService.generatePayroll({ month, year })
      const created = Array.isArray(res.data) ? res.data.length : 0
      if (created === 0) {
        toast('No active employees found. Add employees first.', { icon: 'ℹ️' })
      } else {
        toast.success(`Generated ${created} payslip${created !== 1 ? 's' : ''}`)
      }
      load()
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Failed to generate payroll'
      toast.error(msg)
    }
    setGenerating(false)
  }

  const markPaid = async (id) => {
    try {
      await hrmService.updatePayslipStatus(id, { status: 'paid' })
      toast.success('Marked as paid')
      load()
    } catch {
      toast.error('Failed to update status')
    }
  }

  const fmt = (n) => n?.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }) || '—'

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>
          <p className="text-sm text-gray-500">{total} payslips</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <select className="input w-28" value={month} onChange={e => setMonth(Number(e.target.value))}>
            {[...Array(12)].map((_, i) => (
              <option key={i+1} value={i+1}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</option>
            ))}
          </select>
          <select className="input w-24" value={year} onChange={e => setYear(Number(e.target.value))}>
            {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={generate} disabled={generating} className="btn-primary flex items-center gap-2 text-sm">
            <Play className="w-4 h-4" /> {generating ? 'Generating…' : 'Generate Payroll'}
          </button>
          <button onClick={load} className="btn-secondary flex items-center gap-2 text-sm">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <TableScroll>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Employee', 'Gross', 'Deductions', 'Net Salary', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
              ))
            ) : payslips.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                <Banknote className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                No payslips. Click "Generate Payroll" to create.
              </td></tr>
            ) : payslips.map(ps => (
              <tr key={ps.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{ps.employee_name}</div>
                  <div className="text-xs text-gray-400">{ps.employee_code}</div>
                </td>
                <td className="px-4 py-3 text-gray-700">{fmt(ps.gross_earnings)}</td>
                <td className="px-4 py-3 text-red-600">{fmt(ps.total_deductions)}</td>
                <td className="px-4 py-3 font-semibold text-gray-900">{fmt(ps.net_salary)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[ps.status] || ''}`}>{ps.status}</span>
                </td>
                <td className="px-4 py-3">
                  {ps.status !== 'paid' && (
                    <button onClick={() => markPaid(ps.id)} className="p-1.5 hover:bg-green-50 rounded text-green-600" title="Mark Paid">
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </TableScroll>
      </div>
    </div>
  )
}
