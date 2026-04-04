import { useState, useEffect, useCallback } from 'react'
import { Activity, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { Breadcrumb, PageHeader, SectionCard, SkeletonLoader } from './SettingsLayout'
import api from '../../services/api'

const formatDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString()
}

const LoginActivityPage = () => {
  const [logs, setLogs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const PAGE_SIZE = 50

  const load = useCallback(async (p = 1) => {
    try {
      setLoading(true)
      // Use the existing audit-logs endpoint filtered to login/logout actions
      const res = await api.get(`/audit-logs/?action=login&page=${p}&page_size=${PAGE_SIZE}`)
      // Normalize audit log shape → what the table expects
      const raw = res.data.data || []
      const mapped = raw.map(log => ({
        id: log.id || log._id,
        full_name: log.user_name,
        role: log.user_role,
        login_time: log.created_at,
        ip_address: log.ip_address,
        device: log.user_agent,
      }))
      setLogs(mapped)
      setTotal(res.data.pagination?.total || res.data.total || 0)
      setPage(p)
    } catch {
      toast.error('Failed to load login activity')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(1) }, [load])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <Breadcrumb page="Login Activity" />
      <PageHeader
        title="Login Activity"
        description="Recent login events across all users in your organisation."
      />

      <SectionCard title="Login History" icon={Activity}>
        <div className="flex justify-end mb-4">
          <button
            onClick={() => load(page)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {loading ? (
          <SkeletonLoader />
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-surface-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-50 text-left">
                    <th className="px-4 py-3 font-medium text-surface-600">User</th>
                    <th className="px-4 py-3 font-medium text-surface-600">Role</th>
                    <th className="px-4 py-3 font-medium text-surface-600">Login Time</th>
                    <th className="px-4 py-3 font-medium text-surface-600">IP Address</th>
                    <th className="px-4 py-3 font-medium text-surface-600 hidden md:table-cell">Device</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-50">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-surface-400">
                        No login records found
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-surface-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-surface-800">{log.full_name || log.user_id}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent-50 text-accent-700 capitalize">
                            {log.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-surface-600">{formatDate(log.login_time)}</td>
                        <td className="px-4 py-3 font-mono text-surface-600 text-xs">{log.ip_address || '—'}</td>
                        <td className="px-4 py-3 text-surface-500 text-xs truncate max-w-xs hidden md:table-cell">
                          {log.device ? log.device.substring(0, 80) : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-surface-500">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => load(page - 1)}
                    disabled={page <= 1}
                    className="px-3 py-1 text-sm border border-surface-200 rounded-lg disabled:opacity-40 hover:bg-surface-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => load(page + 1)}
                    disabled={page >= totalPages}
                    className="px-3 py-1 text-sm border border-surface-200 rounded-lg disabled:opacity-40 hover:bg-surface-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </SectionCard>
    </div>
  )
}

export default LoginActivityPage
