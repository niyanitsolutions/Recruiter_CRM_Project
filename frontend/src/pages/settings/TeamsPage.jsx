import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, UsersRound, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import tenantSettingsService from '../../services/tenantSettingsService'
import {
  Breadcrumb, PageHeader, SectionCard, Field, Input, Textarea,
  SelectField, SaveBtn, CancelBtn, SkeletonLoader,
} from './SettingsLayout'

const EMPTY_FORM = {
  name: '',
  team_lead: '',
  members: [],
  department: '',
  description: '',
}

const Modal = ({ open, title, children, onClose }) => {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
          <h3 className="font-semibold text-surface-900">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-surface-100 rounded-lg">
            <X className="w-4 h-4 text-surface-500" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

const TeamsPage = () => {
  const [teams, setTeams]       = useState([])
  const [users, setUsers]       = useState([])
  const [depts, setDepts]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [deleting, setDeleting] = useState(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [teamsRes, usersRes, deptsRes] = await Promise.all([
        tenantSettingsService.getTeams(),
        api.get('/users').then(r => r.data),
        api.get('/departments').then(r => r.data),
      ])
      setTeams(teamsRes.data || [])
      setUsers(usersRes.data || [])
      setDepts(deptsRes.data || [])
    } catch {
      toast.error('Failed to load teams')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  const openEdit = (team) => {
    setEditing(team.id)
    setForm({
      name: team.name || '',
      team_lead: team.team_lead || '',
      members: team.members || [],
      department: team.department || '',
      description: team.description || '',
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Team name is required'); return }
    try {
      setSaving(true)
      if (editing) {
        await tenantSettingsService.updateTeam(editing, form)
        toast.success('Team updated')
      } else {
        await tenantSettingsService.createTeam(form)
        toast.success('Team created')
      }
      setModalOpen(false)
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save team')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      setDeleting(id)
      await tenantSettingsService.deleteTeam(id)
      toast.success('Team deleted')
      load()
    } catch {
      toast.error('Failed to delete team')
    } finally {
      setDeleting(null)
    }
  }

  const toggleMember = (userId) => {
    setForm(f => ({
      ...f,
      members: f.members.includes(userId)
        ? f.members.filter(m => m !== userId)
        : [...f.members, userId],
    }))
  }

  const getUserName = (id) => {
    const u = users.find(u => u.id === id || u._id === id)
    return u ? (u.full_name || u.username || id) : id
  }

  if (loading) return <div className="p-6 max-w-4xl mx-auto"><SkeletonLoader /></div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Breadcrumb page="Teams" />
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Teams" description="Create and manage cross-functional teams within your organisation." />
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-accent-600 text-white text-sm font-medium rounded-lg hover:bg-accent-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Team
        </button>
      </div>

      {teams.length === 0 ? (
        <div className="bg-white rounded-xl border border-surface-100 flex flex-col items-center gap-3 py-16 text-surface-400">
          <UsersRound className="w-10 h-10" />
          <p className="text-sm">No teams yet. Create your first team.</p>
          <button onClick={openCreate} className="text-sm text-accent-600 hover:underline">Create Team</button>
        </div>
      ) : (
        <div className="space-y-3">
          {teams.map(team => (
            <div key={team.id} className="bg-white rounded-xl border border-surface-100 px-6 py-4 flex items-center gap-4">
              <div className="p-2 bg-blue-50 rounded-lg">
                <UsersRound className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-surface-900">{team.name}</p>
                <p className="text-xs text-surface-500 mt-0.5">
                  {team.team_lead ? `Lead: ${getUserName(team.team_lead)} · ` : ''}
                  {(team.members || []).length} member{(team.members || []).length !== 1 ? 's' : ''}
                  {team.department ? ` · ${team.department}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEdit(team)}
                  className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
                >
                  <Pencil className="w-4 h-4 text-surface-500" />
                </button>
                <button
                  onClick={() => handleDelete(team.id)}
                  disabled={deleting === team.id}
                  className="p-2 hover:bg-danger-50 rounded-lg transition-colors"
                >
                  {deleting === team.id
                    ? <Loader2 className="w-4 h-4 animate-spin text-danger-500" />
                    : <Trash2 className="w-4 h-4 text-danger-500" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} title={editing ? 'Edit Team' : 'New Team'} onClose={() => setModalOpen(false)}>
        <div className="space-y-4">
          <Field label="Team Name" required>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Engineering Team"
            />
          </Field>

          <Field label="Team Lead">
            <SelectField
              value={form.team_lead}
              onChange={e => setForm(f => ({ ...f, team_lead: e.target.value }))}
            >
              <option value="">Select lead…</option>
              {users.map(u => (
                <option key={u.id || u._id} value={u.id || u._id}>
                  {u.full_name || u.username}
                </option>
              ))}
            </SelectField>
          </Field>

          <Field label="Department">
            <SelectField
              value={form.department}
              onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
            >
              <option value="">Select department…</option>
              {depts.map(d => (
                <option key={d.id || d._id} value={d.name}>{d.name}</option>
              ))}
            </SelectField>
          </Field>

          <Field label="Members">
            <div className="border border-surface-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-surface-50">
              {users.map(u => {
                const uid = u.id || u._id
                const checked = form.members.includes(uid)
                return (
                  <label key={uid} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMember(uid)}
                      className="rounded border-surface-300 text-accent-600"
                    />
                    <span className="text-sm text-surface-800">{u.full_name || u.username}</span>
                  </label>
                )
              })}
            </div>
            {form.members.length > 0 && (
              <p className="text-xs text-surface-500 mt-1">{form.members.length} member(s) selected</p>
            )}
          </Field>

          <Field label="Description">
            <Textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Brief description of this team's purpose…"
              rows={2}
            />
          </Field>

          <div className="flex justify-end gap-3 pt-2">
            <CancelBtn onClick={() => setModalOpen(false)} />
            <SaveBtn saving={saving} onClick={handleSave} label={editing ? 'Update' : 'Create'} />
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default TeamsPage
