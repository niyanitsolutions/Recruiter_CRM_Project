import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { Banknote, Play, CheckCircle, RefreshCw, Eye, Edit2, Download, Trash2, X, Plus, Minus } from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'
import TableScroll from '../../components/common/TableScroll'
import ModalPortal from '../../components/common/ModalPortal'

// ── Number-to-words (Indian numbering) ───────────────────────────────────────
const ONES = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
  'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
const TENS = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
function _h(n) {
  let s = ''
  if (n >= 100) { s += ONES[Math.floor(n/100)] + ' Hundred '; n %= 100 }
  if (n >= 20)  { s += TENS[Math.floor(n/10)] + ' '; n %= 10 }
  if (n > 0)    s += ONES[n] + ' '
  return s
}
function toWords(amount) {
  let n = Math.floor(Math.abs(amount || 0))
  if (n === 0) return 'Zero Rupees Only'
  let s = ''
  if (n >= 10000000) { s += _h(Math.floor(n/10000000)) + 'Crore '; n %= 10000000 }
  if (n >= 100000)   { s += _h(Math.floor(n/100000))   + 'Lakh ';  n %= 100000 }
  if (n >= 1000)     { s += _h(Math.floor(n/1000))     + 'Thousand '; n %= 1000 }
  if (n > 0)         s += _h(n)
  return s.trim() + ' Rupees Only'
}

const MONTH_NAMES = ['','January','February','March','April','May','June',
  'July','August','September','October','November','December']

const STATUS_COLORS = {
  draft:     'bg-gray-100 text-gray-600',
  processed: 'bg-blue-100 text-blue-700',
  paid:      'bg-green-100 text-green-700',
  on_hold:   'bg-yellow-100 text-yellow-700',
}

const fmt = (n) => n != null ? n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }) : '—'

// ── Payslip Document (shared by View modal + Print) ───────────────────────────
function PayslipDocument({ ps, companyName, structure }) {
  if (!ps) return null

  // Build visibility map: only is_selected + show_in_payslip components appear on payslip
  const visMap = {}
  if (structure?.components) {
    structure.components.forEach(c => {
      visMap[c.key] = c.is_selected !== false && c.show_in_payslip !== false
    })
  }
  // Default show if key not in visMap (legacy data without structure)
  const showItem = (key) => key in visMap ? visMap[key] : true

  // Earnings rows
  const earnRows = []
  if (ps.basic > 0 && showItem('basic_salary'))                  earnRows.push({ label: 'Basic Salary',         amount: ps.basic })
  if (ps.hra > 0 && showItem('hra'))                             earnRows.push({ label: 'HRA',                  amount: ps.hra })
  if (ps.special_allowance > 0 && showItem('special_allowance')) earnRows.push({ label: 'Special Allowance',    amount: ps.special_allowance })
  if (ps.overtime > 0 && showItem('overtime'))                   earnRows.push({ label: 'Overtime',             amount: ps.overtime })
  if (ps.bonus > 0 && showItem('bonus'))                         earnRows.push({ label: 'Bonus',                amount: ps.bonus })
  ;(ps.other_earnings || []).forEach(e => earnRows.push({ label: e.name, amount: e.amount }))

  // Deduction rows
  const dedRows = []
  if (ps.pf_employee > 0 && showItem('epf_contribution'))        dedRows.push({ label: 'EPF Contribution',      amount: ps.pf_employee })
  if (ps.professional_tax > 0 && showItem('professional_tax'))   dedRows.push({ label: 'Professional Tax',      amount: ps.professional_tax })
  if (ps.tds > 0 && showItem('tds'))                             dedRows.push({ label: 'TDS',                   amount: ps.tds })
  if (ps.advance_deduction > 0 && showItem('loan_deduction'))    dedRows.push({ label: 'Loan / Advance',        amount: ps.advance_deduction })
  ;(ps.other_deductions || []).forEach(d => dedRows.push({ label: d.name, amount: d.amount }))

  const maxRows = Math.max(earnRows.length, dedRows.length)
  const rows = Array.from({ length: maxRows }, (_, i) => ({
    earn: earnRows[i] || null,
    ded:  dedRows[i]  || null,
  }))

  return (
    <div id="payslip-print-area" style={{ fontFamily: 'Arial, sans-serif', fontSize: 12, color: '#1a1a2e', background: '#fff', padding: '24px 32px', maxWidth: 780 }}>
      {/* Header */}
      <div style={{ borderBottom: '3px solid #4f46e5', paddingBottom: 14, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#4f46e5', margin: 0 }}>{companyName || 'Company Name'}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6b7280' }}>Payslip for the Month of {MONTH_NAMES[ps.month]} {ps.year}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Payslip</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6b7280' }}>#{ps.id?.slice(-8).toUpperCase()}</p>
        </div>
      </div>

      {/* Employee Info Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px', marginBottom: 16, padding: '12px 16px', background: '#f8f7ff', borderRadius: 8 }}>
        {[
          ['Employee Name',  ps.employee_name],
          ['Employee ID',    ps.employee_code],
          ['Designation',    ps.employee_designation || '—'],
          ['Department',     ps.employee_department  || '—'],
          ['Date of Joining',ps.employee_doj         || '—'],
          ['PF Number',      ps.employee_pf_number   || '—'],
          ['UAN Number',     ps.employee_uan_number  || '—'],
          ['Payment Month',  `${MONTH_NAMES[ps.month]} ${ps.year}`],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', gap: 6, padding: '2px 0' }}>
            <span style={{ color: '#6b7280', minWidth: 120 }}>{label}:</span>
            <span style={{ fontWeight: 600 }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Attendance Row */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 14, padding: '8px 16px', background: '#f0fdf4', borderRadius: 8, fontSize: 11 }}>
        {[
          ['Working Days', ps.working_days],
          ['Present Days', ps.present_days],
          ['Absent Days',  ps.absent_days],
          ['Leave Days',   ps.leave_days],
          ['LOP Days',     ps.lop_days],
        ].map(([label, value]) => (
          <div key={label}>
            <span style={{ color: '#6b7280' }}>{label}: </span>
            <span style={{ fontWeight: 600 }}>{value ?? 0}</span>
          </div>
        ))}
      </div>

      {/* Earnings / Deductions Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12, fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#4f46e5', color: '#fff' }}>
            <th style={{ padding: '7px 10px', textAlign: 'left', width: '25%' }}>Earnings</th>
            <th style={{ padding: '7px 10px', textAlign: 'right', width: '25%' }}>Amount (₹)</th>
            <th style={{ padding: '7px 10px', textAlign: 'left', width: '25%' }}>Deductions</th>
            <th style={{ padding: '7px 10px', textAlign: 'right', width: '25%' }}>Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={4} style={{ padding: '10px', textAlign: 'center', color: '#9ca3af' }}>No salary components</td></tr>
          ) : rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fafafa' : '#fff' }}>
              <td style={{ padding: '5px 10px', color: '#374151' }}>{row.earn?.label || ''}</td>
              <td style={{ padding: '5px 10px', textAlign: 'right', color: '#16a34a' }}>
                {row.earn ? row.earn.amount.toLocaleString('en-IN') : ''}
              </td>
              <td style={{ padding: '5px 10px', color: '#374151' }}>{row.ded?.label || ''}</td>
              <td style={{ padding: '5px 10px', textAlign: 'right', color: '#dc2626' }}>
                {row.ded ? row.ded.amount.toLocaleString('en-IN') : ''}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: '#f3f4f6', fontWeight: 700 }}>
            <td style={{ padding: '7px 10px' }}>Gross Earnings</td>
            <td style={{ padding: '7px 10px', textAlign: 'right', color: '#16a34a' }}>
              {(ps.gross_earnings || 0).toLocaleString('en-IN')}
            </td>
            <td style={{ padding: '7px 10px' }}>Total Deductions</td>
            <td style={{ padding: '7px 10px', textAlign: 'right', color: '#dc2626' }}>
              {(ps.total_deductions || 0).toLocaleString('en-IN')}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Net Salary Banner */}
      <div style={{ background: '#4f46e5', color: '#fff', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <p style={{ margin: 0, fontSize: 11, opacity: 0.8 }}>Net Pay</p>
          <p style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 700 }}>₹{(ps.net_salary || 0).toLocaleString('en-IN')}</p>
        </div>
        <div style={{ textAlign: 'right', maxWidth: '55%' }}>
          <p style={{ margin: 0, fontSize: 11, opacity: 0.8 }}>Amount in Words</p>
          <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600 }}>{toWords(ps.net_salary)}</p>
        </div>
      </div>

      {/* Footer */}
      <p style={{ textAlign: 'center', fontSize: 10, color: '#9ca3af', borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
        This is a computer-generated payslip and does not require a signature.
      </p>
    </div>
  )
}

// ── Edit Payslip Modal ────────────────────────────────────────────────────────
function EditPayslipModal({ ps, onClose, onSave }) {
  const [data, setData] = useState({
    basic:              ps.basic              || 0,
    hra:                ps.hra                || 0,
    special_allowance:  ps.special_allowance  || 0,
    overtime:           ps.overtime           || 0,
    bonus:              ps.bonus              || 0,
    pf_employee:        ps.pf_employee        || 0,
    professional_tax:   ps.professional_tax   || 0,
    tds:                ps.tds                || 0,
    advance_deduction:  ps.advance_deduction  || 0,
    working_days:       ps.working_days       || 26,
    present_days:       ps.present_days       || 26,
    lop_days:           ps.lop_days           || 0,
  })
  const [saving, setSaving] = useState(false)
  const inp = 'w-full px-3 py-2 rounded-lg border text-sm'

  const gross = data.basic + data.hra + data.special_allowance + data.overtime + data.bonus
  const totalDed = data.pf_employee + data.professional_tax + data.tds + data.advance_deduction
  const net = gross - totalDed

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(data)
      onClose()
    } catch { toast.error('Failed to save changes') }
    setSaving(false)
  }

  const n = (k) => <input type="number" min="0" className={inp}
    value={data[k]} onChange={e => setData(d => ({ ...d, [k]: Number(e.target.value) || 0 }))} />

  return (
    <ModalPortal isOpen>
      <div className="fixed inset-0 z-[9998] bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-5 border-b">
            <h3 className="font-semibold text-gray-900">Edit Payslip — {ps.employee_name} ({MONTH_NAMES[ps.month]} {ps.year})</h3>
            <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
          </div>
          <div className="overflow-y-auto p-5 space-y-4">
            <div>
              <p className="text-xs font-semibold text-green-700 uppercase mb-2">Earnings (₹)</p>
              <div className="grid grid-cols-2 gap-3">
                {[['basic','Basic'],['hra','HRA'],['special_allowance','Special Allowance'],
                  ['overtime','Overtime'],['bonus','Bonus']].map(([k,l]) => (
                  <div key={k}><label className="text-xs text-gray-500 mb-1 block">{l}</label>{n(k)}</div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-red-700 uppercase mb-2">Deductions (₹)</p>
              <div className="grid grid-cols-2 gap-3">
                {[['pf_employee','EPF'],['professional_tax','Prof. Tax'],
                  ['tds','TDS'],['advance_deduction','Advance/Loan']].map(([k,l]) => (
                  <div key={k}><label className="text-xs text-gray-500 mb-1 block">{l}</label>{n(k)}</div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Attendance</p>
              <div className="grid grid-cols-3 gap-3">
                {[['working_days','Working Days'],['present_days','Present Days'],['lop_days','LOP Days']].map(([k,l]) => (
                  <div key={k}><label className="text-xs text-gray-500 mb-1 block">{l}</label>{n(k)}</div>
                ))}
              </div>
            </div>
            {/* Computed summary */}
            <div className="flex gap-4 text-xs p-3 rounded-lg bg-gray-50">
              <span className="text-green-700 font-medium">Gross ₹{gross.toLocaleString('en-IN')}</span>
              <span className="text-red-700 font-medium">Ded ₹{totalDed.toLocaleString('en-IN')}</span>
              <span className="font-semibold text-gray-900">Net ₹{net.toLocaleString('en-IN')}</span>
            </div>
          </div>
          <div className="flex gap-2 justify-end p-5 border-t">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border text-gray-700">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

// ── Main Payroll Page ─────────────────────────────────────────────────────────
export default function Payroll() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear]   = useState(now.getFullYear())
  const [payslips, setPayslips] = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)
  const [generating, setGenerating] = useState(false)

  // Modals
  const [viewPs,   setViewPs]   = useState(null)  // payslip to view
  const [editPs,   setEditPs]   = useState(null)  // payslip to edit

  // Payroll structure (for visibility control in payslip)
  const [structure, setStructure] = useState(null)

  const companyName = useSelector(s => s.auth?.user?.companyName)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [listRes, structRes] = await Promise.all([
        hrmService.listPayslips({ month, year, page, page_size: 20 }),
        hrmService.getPayrollStructure(),
      ])
      setPayslips(listRes.data.items || [])
      setTotal(listRes.data.total || 0)
      setStructure(structRes.data)
    } catch {}
    setLoading(false)
  }, [month, year, page])

  useEffect(() => { load() }, [load])

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
      toast.error(err?.response?.data?.detail || 'Failed to generate payroll')
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

  const deleteDraft = async (id) => {
    if (!window.confirm('Delete this draft payslip?')) return
    try {
      await hrmService.deletePayslip(id)
      toast.success('Payslip deleted')
      load()
    } catch {
      toast.error('Cannot delete — only draft payslips can be removed')
    }
  }

  const saveEdit = async (data) => {
    const res = await hrmService.updatePayslip(editPs.id, data)
    toast.success('Payslip updated')
    setPayslips(prev => prev.map(p => p.id === res.data.id ? res.data : p))
  }

  const printPayslip = (ps) => {
    const area = document.getElementById('payslip-print-area')
    if (!area) return
    const w = window.open('', '_blank', 'width=900,height=700')
    w.document.write(`<html><head><title>Payslip - ${ps.employee_name}</title>
      <style>body{margin:0;padding:0}@media print{body{margin:0}}</style>
      </head><body>${area.innerHTML}</body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 400)
  }

  const PAGE_SIZE = 20
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>
          <p className="text-sm text-gray-500">{total} payslips for {MONTH_NAMES[month]} {year}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select className="input w-28 text-sm" value={month} onChange={e => { setMonth(Number(e.target.value)); setPage(1) }}>
            {[...Array(12)].map((_, i) => (
              <option key={i+1} value={i+1}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</option>
            ))}
          </select>
          <select className="input w-24 text-sm" value={year} onChange={e => { setYear(Number(e.target.value)); setPage(1) }}>
            {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={generate} disabled={generating} className="btn-primary flex items-center gap-2 text-sm">
            <Play className="w-4 h-4" /> {generating ? 'Generating…' : 'Generate Payroll'}
          </button>
          <button onClick={load} className="btn-secondary flex items-center gap-2 text-sm" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Payslip visibility note */}
      {structure?.is_configured && (
        <div className="text-xs text-gray-500 flex items-center gap-2 px-1">
          <span>Payslip shows components with visibility enabled in your</span>
          <span className="text-indigo-600 font-medium">payroll structure configuration</span>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <TableScroll>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Employee', 'Month/Year', 'Gross Earnings', 'Deductions', 'Net Salary', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3">
                  <div className="h-4 bg-gray-100 rounded animate-pulse" />
                </td></tr>
              ))
            ) : payslips.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                <Banknote className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                No payslips for {MONTH_NAMES[month]} {year}. Click "Generate Payroll" to create.
              </td></tr>
            ) : payslips.map(ps => (
              <tr key={ps.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{ps.employee_name}</div>
                  <div className="text-xs text-gray-400">{ps.employee_code}</div>
                </td>
                <td className="px-4 py-3 text-gray-600">{MONTH_NAMES[ps.month]} {ps.year}</td>
                <td className="px-4 py-3 text-green-700 font-medium">{fmt(ps.gross_earnings)}</td>
                <td className="px-4 py-3 text-red-600">{fmt(ps.total_deductions)}</td>
                <td className="px-4 py-3 font-semibold text-gray-900">{fmt(ps.net_salary)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[ps.status] || ''}`}>{ps.status}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {/* View */}
                    <button onClick={() => setViewPs(ps)} className="p-1.5 hover:bg-indigo-50 rounded text-indigo-600" title="View Payslip">
                      <Eye className="w-4 h-4" />
                    </button>
                    {/* Edit (draft / processed only) */}
                    {ps.status !== 'paid' && (
                      <button onClick={() => setEditPs(ps)} className="p-1.5 hover:bg-amber-50 rounded text-amber-600" title="Edit Payroll">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                    {/* Download PDF */}
                    <button onClick={() => { setViewPs(ps); setTimeout(() => printPayslip(ps), 300) }}
                      className="p-1.5 hover:bg-green-50 rounded text-green-600" title="Download PDF">
                      <Download className="w-4 h-4" />
                    </button>
                    {/* Mark Paid */}
                    {ps.status !== 'paid' && (
                      <button onClick={() => markPaid(ps.id)} className="p-1.5 hover:bg-green-50 rounded text-green-600" title="Mark as Paid">
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    )}
                    {/* Delete draft */}
                    {ps.status === 'draft' && (
                      <button onClick={() => deleteDraft(ps.id)} className="p-1.5 hover:bg-red-50 rounded text-red-500" title="Delete Draft">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </TableScroll>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
              className="px-3 py-1.5 rounded border disabled:opacity-40">Prev</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
              className="px-3 py-1.5 rounded border disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      {/* View Payslip Modal */}
      {viewPs && (
        <ModalPortal isOpen>
          <div className="fixed inset-0 z-[9998] bg-black/50" onClick={() => setViewPs(null)} />
          <div className="fixed inset-0 z-[9999] flex items-start justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-xl w-full max-w-3xl my-8" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="font-semibold text-gray-900">
                  Payslip — {viewPs.employee_name} ({MONTH_NAMES[viewPs.month]} {viewPs.year})
                </h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => printPayslip(viewPs)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                    <Download className="w-3.5 h-3.5" /> Download PDF
                  </button>
                  <button onClick={() => setViewPs(null)}><X className="w-5 h-5 text-gray-400" /></button>
                </div>
              </div>
              <div className="p-4">
                <PayslipDocument ps={viewPs} companyName={companyName} structure={structure} />
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Edit Payslip Modal */}
      {editPs && (
        <EditPayslipModal
          ps={editPs}
          onClose={() => setEditPs(null)}
          onSave={saveEdit}
        />
      )}
    </div>
  )
}
