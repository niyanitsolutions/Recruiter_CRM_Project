import { useState, useEffect, useCallback } from 'react'
import { Database, Download, Trash2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import tenantSettingsService from '../../services/tenantSettingsService'
import {
  Breadcrumb, PageHeader, SectionCard, Field, Input, SelectField,
  Toggle, ActionBar, SkeletonLoader,
} from './SettingsLayout'

const DEFAULT = {
  auto_backup: false, backup_frequency: 'weekly', backup_retention_days: 90,
  candidate_retention_years: 5, audit_log_retention_years: 3,
  gdpr_enabled: false, auto_delete_inactive_candidates: false,
  inactive_candidate_days: 365, anonymize_on_delete: true,
}

const DataManagementPage = () => {
  const [data, setData]       = useState(DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await tenantSettingsService.getDataManagement()
      if (res.data && Object.keys(res.data).length > 0) setData({ ...DEFAULT, ...res.data })
    } catch {
      toast.error('Failed to load data management settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    try {
      setSaving(true)
      await tenantSettingsService.saveDataManagement(data)
      toast.success('Data management settings saved')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const set = (f, v) => setData(d => ({ ...d, [f]: v }))

  if (loading) return <div className="p-6 max-w-3xl mx-auto"><SkeletonLoader /></div>

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <Breadcrumb page="Data Management" />
      <PageHeader title="Data Management" description="Configure backup, retention, GDPR, and export settings." />

      {/* Backup */}
      <SectionCard title="Backup Configuration" icon={Database}>
        <div className="border border-surface-100 rounded-xl px-4 mb-4">
          <Toggle checked={data.auto_backup} onChange={v => set('auto_backup', v)} label="Automatic Backups" description="Schedule automatic data backups" />
        </div>
        {data.auto_backup && (
          <div className="space-y-4">
            <Field label="Backup Frequency">
              <SelectField value={data.backup_frequency} onChange={e => set('backup_frequency', e.target.value)} className="w-40">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </SelectField>
            </Field>
            <Field label="Retention Period (days)" hint="Backups older than this are deleted">
              <Input type="number" min={7} value={data.backup_retention_days} onChange={e => set('backup_retention_days', parseInt(e.target.value) || 90)} className="w-28" />
            </Field>
          </div>
        )}
      </SectionCard>

      {/* Data Retention */}
      <SectionCard title="Data Retention">
        <div className="space-y-4">
          <Field label="Candidate Data Retention (years)" hint="Candidate records older than this can be purged">
            <Input type="number" min={1} value={data.candidate_retention_years} onChange={e => set('candidate_retention_years', parseInt(e.target.value) || 5)} className="w-28" />
          </Field>
          <Field label="Audit Log Retention (years)" hint="Audit logs older than this are archived">
            <Input type="number" min={1} value={data.audit_log_retention_years} onChange={e => set('audit_log_retention_years', parseInt(e.target.value) || 3)} className="w-28" />
          </Field>
        </div>

        <div className="border border-surface-100 rounded-xl px-4 mt-4 divide-y divide-surface-50">
          <Toggle
            checked={data.auto_delete_inactive_candidates}
            onChange={v => set('auto_delete_inactive_candidates', v)}
            label="Auto-Delete Inactive Candidates"
            description="Automatically remove candidates with no activity"
          />
          {data.auto_delete_inactive_candidates && (
            <div className="py-3">
              <Field label="Inactivity Period (days)">
                <Input type="number" min={90} value={data.inactive_candidate_days} onChange={e => set('inactive_candidate_days', parseInt(e.target.value) || 365)} className="w-28" />
              </Field>
            </div>
          )}
          <Toggle
            checked={data.anonymize_on_delete}
            onChange={v => set('anonymize_on_delete', v)}
            label="Anonymize Instead of Delete"
            description="Replace PII with anonymised data instead of hard-deleting records"
          />
        </div>
      </SectionCard>

      {/* GDPR */}
      <SectionCard title="GDPR / Compliance">
        <div className="border border-surface-100 rounded-xl px-4 mb-4">
          <Toggle
            checked={data.gdpr_enabled}
            onChange={v => set('gdpr_enabled', v)}
            label="GDPR Mode"
            description="Enable GDPR-compliant data handling, consent tracking, and right-to-erasure"
          />
        </div>
        {data.gdpr_enabled && (
          <div className="flex items-start gap-3 p-4 bg-warning-50 rounded-xl border border-warning-100">
            <AlertTriangle className="w-5 h-5 text-warning-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning-800">GDPR mode is active</p>
              <p className="text-xs text-warning-600 mt-1">
                Candidate data collection will include consent forms. Candidates can request data deletion.
                Your team will be notified of any erasure requests.
              </p>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Export */}
      <SectionCard title="Data Export">
        <p className="text-sm text-surface-500 mb-4">Export a full copy of your organisation's data.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Candidates', desc: 'All candidate records' },
            { label: 'Jobs', desc: 'All job postings' },
            { label: 'Clients', desc: 'All client records' },
            { label: 'Interviews', desc: 'Interview history' },
            { label: 'Users', desc: 'User accounts' },
            { label: 'Audit Logs', desc: 'System activity' },
          ].map(({ label, desc }) => (
            <button
              key={label}
              onClick={() => toast.success(`${label} export queued. You will receive an email when ready.`)}
              className="flex items-center gap-2 p-3 border border-surface-200 rounded-xl hover:bg-surface-50 transition-colors text-left"
            >
              <Download className="w-4 h-4 text-accent-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-surface-800">{label}</p>
                <p className="text-xs text-surface-400">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </SectionCard>

      <ActionBar saving={saving} onSave={save} />
    </div>
  )
}

export default DataManagementPage
