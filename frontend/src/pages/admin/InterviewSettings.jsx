import React, { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, SlidersHorizontal, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import pipelineService from '../../services/pipelineService'
import clientService from '../../services/clientService'
import jobService from '../../services/jobService'
import usePermissions from '../../hooks/usePermissions'

const MODES = [
  { value: 'video', label: 'Video Call' },
  { value: 'in_person', label: 'In Person' },
  { value: 'phone', label: 'Phone' },
]

const DURATIONS = [30, 45, 60, 90, 120]

const blankRound = (n) => ({
  stage_name: `Round ${n}`,
  order: n,
  mode: 'video',
  duration: 60,
  is_mandatory: true,
  requires_feedback: true,
  auto_advance: false,
  auto_reject: false,
})

const InterviewSettings = () => {
  const { has } = usePermissions()

  // ─── Main list ───────────────────────────────────────────────────────────────
  const [pipelines, setPipelines] = useState([])
  const [loading, setLoading] = useState(true)

  // ─── Panel state ─────────────────────────────────────────────────────────────
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelLoading, setPanelLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Form data
  const [clients, setClients] = useState([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [filteredJobs, setFilteredJobs] = useState([])
  const [selectedJobId, setSelectedJobId] = useState('')
  const [numRounds, setNumRounds] = useState(3)
  const [rounds, setRounds] = useState([blankRound(1), blankRound(2), blankRound(3)])
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [loadingPipeline, setLoadingPipeline] = useState(false)
  const [existingPipelineId, setExistingPipelineId] = useState(null)

  useEffect(() => { loadPipelines() }, [])

  // ─── Load pipeline list ───────────────────────────────────────────────────────
  const loadPipelines = async () => {
    try {
      setLoading(true)
      const res = await pipelineService.getPipelines({ page_size: 100 })
      setPipelines(res.data || [])
    } catch {
      setPipelines([])
    } finally {
      setLoading(false)
    }
  }

  // ─── Open panel (create or edit) ─────────────────────────────────────────────
  const openPanel = async (pipeline = null) => {
    // Reset form state
    setFormError('')
    setExistingPipelineId(null)
    setSelectedClientId('')
    setSelectedJobId('')
    setFilteredJobs([])
    setNumRounds(3)
    setRounds([blankRound(1), blankRound(2), blankRound(3)])
    setPanelOpen(true)
    setPanelLoading(true)

    try {
      // Always load clients dropdown
      const cRes = await clientService.getClientsDropdown()
      setClients(cRes.data || [])

      if (!pipeline) {
        // Creating new — done
        return
      }

      // Editing existing: load full pipeline details
      const p = await pipelineService.getPipeline(pipeline.id)
      setExistingPipelineId(p.id || pipeline.id)

      // Load stages as rounds
      const stages = [...(p.stages || [])].sort((a, b) => a.order - b.order)
      if (stages.length > 0) {
        setNumRounds(stages.length)
        setRounds(stages.map((s, i) => ({
          stage_name: s.stage_name || `Round ${i + 1}`,
          order: i + 1,
          mode: s.mode || 'video',
          duration: s.duration || 60,
          is_mandatory: s.is_mandatory ?? true,
          requires_feedback: s.requires_feedback ?? true,
          auto_advance: s.auto_advance ?? false,
          auto_reject: s.auto_reject ?? false,
        })))
      }

      // Pre-select job and its client
      const jobId = p.job_id || pipeline.job_id
      if (jobId) {
        setSelectedJobId(jobId)
        // Get job details to find client_id
        const jRes = await jobService.getJob(jobId)
        const job = jRes?.data || jRes
        if (job?.client_id) {
          setSelectedClientId(job.client_id)
          const jListRes = await jobService.getJobs({ client_id: job.client_id, page_size: 100 })
          setFilteredJobs(jListRes.data || [])
        }
      }
    } catch (err) {
      console.error('Failed to open panel:', err)
      toast.error('Failed to load pipeline data')
    } finally {
      setPanelLoading(false)
    }
  }

  const closePanel = () => {
    setPanelOpen(false)
    setFormError('')
  }

  // ─── Form handlers ───────────────────────────────────────────────────────────

  const handleClientChange = async (clientId) => {
    setSelectedClientId(clientId)
    setSelectedJobId('')
    setExistingPipelineId(null)
    setFilteredJobs([])
    if (!clientId) return
    try {
      setLoadingJobs(true)
      const res = await jobService.getJobs({ client_id: clientId, page_size: 100 })
      setFilteredJobs(res.data || [])
    } catch {
      setFilteredJobs([])
    } finally {
      setLoadingJobs(false)
    }
  }

  const handleJobChange = async (jobId) => {
    setSelectedJobId(jobId)
    setExistingPipelineId(null)
    if (!jobId) return
    try {
      setLoadingPipeline(true)
      const res = await pipelineService.getPipelineForJob(jobId)
      if (res?.data) {
        // Existing pipeline found — load its stages
        const stages = [...(res.data.stages || [])].sort((a, b) => a.order - b.order)
        if (stages.length > 0) {
          setNumRounds(stages.length)
          setRounds(stages.map((s, i) => ({
            stage_name: s.stage_name || `Round ${i + 1}`,
            order: i + 1,
            mode: s.mode || 'video',
            duration: s.duration || 60,
            is_mandatory: s.is_mandatory ?? true,
            requires_feedback: s.requires_feedback ?? true,
            auto_advance: s.auto_advance ?? false,
            auto_reject: s.auto_reject ?? false,
          })))
          setExistingPipelineId(res.data.id)
        }
      }
    } catch {
      // No existing pipeline — keep current rounds
    } finally {
      setLoadingPipeline(false)
    }
  }

  const handleNumRoundsChange = (value) => {
    const n = Math.max(1, Math.min(10, parseInt(value, 10) || 1))
    setNumRounds(n)
    setRounds(prev => {
      if (n > prev.length) {
        return [
          ...prev,
          ...Array.from({ length: n - prev.length }, (_, i) => blankRound(prev.length + i + 1)),
        ]
      }
      return prev.slice(0, n).map((r, i) => ({ ...r, order: i + 1 }))
    })
  }

  const updateRound = (idx, field, value) => {
    setRounds(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  // ─── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedJobId) { setFormError('Please select a job'); return }
    if (rounds.some(r => !r.stage_name.trim())) { setFormError('All rounds must have a name'); return }

    try {
      setSaving(true)
      setFormError('')

      const stages = rounds.map((r, i) => ({
        stage_name: r.stage_name.trim(),
        order: i + 1,
        mode: r.mode,
        duration: Number(r.duration),
        is_mandatory: r.is_mandatory,
        requires_feedback: r.requires_feedback,
        auto_advance: r.auto_advance,
        auto_reject: r.auto_reject,
      }))

      const job = filteredJobs.find(j => j.id === selectedJobId)
      const pipelineName = job ? `${job.title} Pipeline` : 'Interview Pipeline'

      if (existingPipelineId) {
        await pipelineService.updatePipeline(existingPipelineId, {
          name: pipelineName,
          stages,
          job_id: selectedJobId,
        })
        toast.success('Pipeline updated successfully')
      } else {
        await pipelineService.createPipeline({
          name: pipelineName,
          job_id: selectedJobId,
          stages,
          is_default: false,
        })
        toast.success('Pipeline created successfully')
      }

      closePanel()
      loadPipelines()
    } catch (err) {
      console.error('Failed to save pipeline:', err)
      const detail = err.response?.data?.detail
      const msg = Array.isArray(detail)
        ? detail.map(e => e.msg || JSON.stringify(e)).join(', ')
        : detail || err.message || 'Failed to save pipeline'
      setFormError(msg)
    } finally {
      setSaving(false)
    }
  }

  // ─── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = async (pipeline) => {
    const label = pipeline.job_title || pipeline.name
    if (!window.confirm(`Delete pipeline for "${label}"? This cannot be undone.`)) return
    try {
      await pipelineService.deletePipeline(pipeline.id)
      toast.success('Pipeline deleted')
      loadPipelines()
    } catch (err) {
      console.error('Failed to delete pipeline:', err)
      const detail = err.response?.data?.detail
      const msg = Array.isArray(detail)
        ? detail.map(e => e.msg || JSON.stringify(e)).join(', ')
        : detail || err.message || 'Failed to delete pipeline'
      toast.error(msg)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Interview Settings</h1>
          <p className="text-surface-500 mt-1">Manage interview pipelines per job</p>
        </div>
        {(has('interview_settings:create') || has('jobs:create')) && (
          <button
            onClick={() => openPanel()}
            className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white rounded-lg text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Create / Edit Pipeline
          </button>
        )}
      </div>

      {/* Pipelines table */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-50 border-b border-surface-100">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider">Company</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider">Job</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider">Total Rounds</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-surface-500">
                  <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full mx-auto mb-2" />
                  Loading pipelines...
                </td>
              </tr>
            ) : pipelines.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center">
                  <SlidersHorizontal className="w-10 h-10 text-surface-300 mx-auto mb-3" />
                  <p className="text-surface-500 font-medium">No pipelines configured</p>
                  <p className="text-surface-400 text-sm mt-1">
                    Click "Create / Edit Pipeline" to define interview rounds per job.
                  </p>
                </td>
              </tr>
            ) : (
              pipelines.map(p => (
                <tr key={p.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-surface-700">
                    {p.client_name || <span className="text-surface-400 italic">—</span>}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-surface-900">{p.job_title || p.name}</p>
                    {p.is_default && (
                      <span className="text-xs text-primary-600 font-medium">Default pipeline</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-1 bg-primary-50 text-primary-700 text-xs font-semibold rounded-full">
                      {p.stage_count} {p.stage_count === 1 ? 'Round' : 'Rounds'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {(has('interview_settings:edit') || has('jobs:edit')) && (
                        <button
                          onClick={() => openPanel(p)}
                          className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
                          title="Edit Pipeline"
                        >
                          <Edit className="w-4 h-4 text-surface-500" />
                        </button>
                      )}
                      {(has('interview_settings:delete') || has('jobs:delete')) && (
                        <button
                          onClick={() => handleDelete(p)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Pipeline"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pipeline Form Panel (right slide-in) ──────────────────────────────── */}
      {panelOpen && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/40" onClick={closePanel} />

          {/* Panel */}
          <div className="relative bg-white w-full max-w-xl h-full flex flex-col shadow-2xl">

            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
              <h3 className="text-lg font-semibold text-surface-900">
                {existingPipelineId ? 'Edit Pipeline' : 'Create Pipeline'}
              </h3>
              <button
                onClick={closePanel}
                className="p-1.5 hover:bg-surface-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-surface-500" />
              </button>
            </div>

            {/* Panel body */}
            {panelLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto mb-3" />
                  <p className="text-surface-500 text-sm">Loading pipeline data...</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                {/* Error */}
                {formError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {formError}
                  </div>
                )}

                {/* Company */}
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">
                    Company <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedClientId}
                    onChange={e => handleClientChange(e.target.value)}
                    className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Select Company</option>
                    {clients.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                {/* Job */}
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">
                    Job <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedJobId}
                    onChange={e => handleJobChange(e.target.value)}
                    disabled={!selectedClientId || loadingJobs}
                    className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-surface-50 disabled:opacity-70"
                  >
                    <option value="">
                      {loadingJobs
                        ? 'Loading jobs...'
                        : selectedClientId
                          ? `Select Job (${filteredJobs.length} available)`
                          : 'Select a company first'}
                    </option>
                    {filteredJobs.map(j => (
                      <option key={j.id} value={j.id}>{j.title}</option>
                    ))}
                  </select>
                  {loadingPipeline && (
                    <p className="text-xs text-surface-400 mt-1">Checking for existing pipeline...</p>
                  )}
                  {existingPipelineId && !loadingPipeline && (
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                      <p className="text-xs text-amber-600">
                        Existing pipeline loaded — saving will overwrite it.
                      </p>
                    </div>
                  )}
                </div>

                {/* Number of rounds */}
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">
                    Number of Rounds
                  </label>
                  <select
                    value={numRounds}
                    onChange={e => handleNumRoundsChange(e.target.value)}
                    className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>{n} {n === 1 ? 'Round' : 'Rounds'}</option>
                    ))}
                  </select>
                </div>

                {/* Dynamic round sections */}
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-surface-700">Round Details</p>

                  {rounds.map((round, idx) => (
                    <div
                      key={idx}
                      className="border border-surface-200 rounded-xl p-4 space-y-3 bg-surface-50"
                    >
                      {/* Round header + name input */}
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 flex-shrink-0 flex items-center justify-center bg-primary-600 text-white text-xs font-bold rounded-full">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={round.stage_name}
                          onChange={e => updateRound(idx, 'stage_name', e.target.value)}
                          placeholder={`Round ${idx + 1} name`}
                          className="flex-1 border border-surface-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>

                      {/* Mode + Duration */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-surface-600 mb-1">Interview Mode</label>
                          <select
                            value={round.mode}
                            onChange={e => updateRound(idx, 'mode', e.target.value)}
                            className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                          >
                            {MODES.map(m => (
                              <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-surface-600 mb-1">Duration</label>
                          <select
                            value={round.duration}
                            onChange={e => updateRound(idx, 'duration', Number(e.target.value))}
                            className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                          >
                            {DURATIONS.map(d => (
                              <option key={d} value={d}>{d} min</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Flags */}
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { key: 'is_mandatory', label: 'Mandatory' },
                          { key: 'requires_feedback', label: 'Feedback Required' },
                          { key: 'auto_advance', label: 'Auto-advance on Pass' },
                          { key: 'auto_reject', label: 'Auto-reject on Fail' },
                        ].map(flag => (
                          <label
                            key={flag.key}
                            className="flex items-center gap-2 text-xs text-surface-700 cursor-pointer select-none"
                          >
                            <input
                              type="checkbox"
                              checked={round[flag.key]}
                              onChange={e => updateRound(idx, flag.key, e.target.checked)}
                              className="rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                            />
                            {flag.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Panel footer */}
            <div className="px-6 py-4 border-t border-surface-100 flex justify-end gap-3 flex-shrink-0">
              <button
                onClick={closePanel}
                className="px-4 py-2 text-surface-700 hover:bg-surface-100 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || panelLoading}
                className="px-5 py-2 bg-accent-600 hover:bg-accent-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {saving
                  ? 'Saving...'
                  : existingPipelineId
                    ? 'Save Changes'
                    : 'Create Pipeline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default InterviewSettings
