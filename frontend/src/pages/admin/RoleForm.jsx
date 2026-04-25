import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Loader2, Shield, RotateCcw } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import roleService from '../../services/roleService'
import userService from '../../services/userService'

// ── Permission sections — single source of truth shared with UserForm ────────
const PERMISSION_SECTIONS = [
  { section: 'Admin Management', modules: [
    { label: 'Users',        perms: ['users:view','users:create','users:edit','users:delete'] },
    { label: 'Partners',     perms: ['partners:view','partners:create','partners:edit','partners:delete'] },
    { label: 'Departments',  perms: ['departments:view','departments:create','departments:edit','departments:delete'] },
    { label: 'Designations', perms: ['designations:view','designations:create','designations:edit','designations:delete'] },
  ]},
  { section: 'Client Management', modules: [
    { label: 'Clients',            perms: ['clients:view','clients:create','clients:edit','clients:delete'] },
    { label: 'Jobs',               perms: ['jobs:view','jobs:create','jobs:edit','jobs:delete'] },
    { label: 'Interviews',         perms: ['interviews:view','interviews:schedule','interviews:update_status'] },
    { label: 'Interview Settings', perms: ['interview_settings:view','interview_settings:create','interview_settings:edit','interview_settings:delete'] },
    { label: 'Onboards',           perms: ['onboards:view','onboards:create','onboards:edit'] },
  ]},
  { section: 'Candidate Management', modules: [
    { label: 'Candidates', perms: ['candidates:view','candidates:create','candidates:edit','candidates:delete','candidates:assign'] },
    { label: 'Interviews', perms: ['interviews:view','interviews:schedule','interviews:update_status'] },
    { label: 'Jobs',       perms: ['jobs:view','jobs:create','jobs:edit','jobs:delete'] },
  ]},
  { section: 'HR Management', modules: [
    { label: 'Users',      perms: ['users:view','users:create','users:edit','users:delete'] },
    { label: 'Candidates', perms: ['candidates:view','candidates:create','candidates:edit','candidates:delete','candidates:assign'] },
    { label: 'Onboards',   perms: ['onboards:view','onboards:create','onboards:edit'] },
  ]},
  { section: 'Accounts Management', modules: [
    { label: 'Accounts', perms: ['accounts:view','accounts:invoices','accounts:payouts'] },
    { label: 'Partners', perms: ['partners:view','partners:create','partners:edit','partners:delete'] },
  ]},
  { section: 'Partner', modules: [
    { label: 'Candidates', perms: ['candidates:view','candidates:create'] },
    { label: 'Jobs',       perms: ['jobs:view'] },
    { label: 'Interviews', perms: ['interviews:view'] },
    { label: 'Payouts',    perms: ['payouts:view','payouts:edit'] },
  ]},
  { section: 'Others', modules: [
    { label: 'Tasks',         perms: ['tasks:view','tasks:create','tasks:edit'] },
    { label: 'Payouts',       perms: ['payouts:view','payouts:edit'] },
    { label: 'Invoices',      perms: ['invoices:view','invoices:approve'] },
    { label: 'Imports',       perms: ['imports:view','imports:create'] },
    { label: 'Exports',       perms: ['exports:view','exports:create'] },
    { label: 'Targets',       perms: ['targets:view','targets:create','targets:edit','targets:delete','targets:admin'] },
    { label: 'Analytics',     perms: ['analytics:view','analytics:edit'] },
    { label: 'Reports',       perms: ['reports:view','reports:export'] },
    { label: 'CRM Settings',  perms: ['crm_settings:view','crm_settings:edit'] },
    { label: 'Audit',         perms: ['audit:view','audit:sessions','audit:alerts','audit:admin'] },
    { label: 'Notifications', perms: ['notifications:create'] },
  ]},
]

// ── Helpers ───────────────────────────────────────────────────────────────────
const getSectionPerms = (sec) => [...new Set(sec.modules.flatMap(m => m.perms))]

const getCheckState = (perms, selectedSet) => {
  const total = perms.length
  const count = perms.filter(p => selectedSet.has(p)).length
  if (count === 0)     return 'unchecked'
  if (count === total) return 'checked'
  return 'indeterminate'
}

// TriCheckbox supports checked / indeterminate / unchecked states
const TriCheckbox = ({ state, onChange, className = '' }) => {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'indeterminate'
  }, [state])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === 'checked'}
      onChange={onChange}
      className={`w-4 h-4 rounded border-surface-300 text-accent-600 focus:ring-accent-500 cursor-pointer ${className}`}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────

const RoleForm = () => {
  const navigate  = useNavigate()
  const { id }    = useParams()
  const isEdit    = Boolean(id)
  const dispatch  = useDispatch()
  const currentUser = useSelector(state => state.auth.user)
  const auth      = useSelector(state => state.auth)

  const [loading,   setLoading]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [resetting, setResetting] = useState(false)
  const [error,     setError]     = useState(null)

  const [formData, setFormData] = useState({
    name: '', display_name: '', description: '', permissions: [],
  })

  // ── Load existing role ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isEdit) return
    const fetchRole = async () => {
      try {
        setLoading(true)
        const response = await roleService.getRole(id)
        const role = response.data
        setFormData({
          name:         role.name         || '',
          display_name: role.display_name || '',
          description:  role.description  || '',
          permissions:  role.permissions  || [],
        })
      } catch { setError('Failed to load role') }
      finally { setLoading(false) }
    }
    fetchRole()
  }, [id, isEdit])

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const togglePermission = (perm) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter(p => p !== perm)
        : [...prev.permissions, perm],
    }))
  }

  const toggleModule = (mod) => {
    setFormData(prev => {
      const current = new Set(prev.permissions)
      const allOn   = mod.perms.every(p => current.has(p))
      mod.perms.forEach(p => allOn ? current.delete(p) : current.add(p))
      return { ...prev, permissions: Array.from(current) }
    })
  }

  const toggleSection = (sec) => {
    const secPerms = getSectionPerms(sec)
    setFormData(prev => {
      const current = new Set(prev.permissions)
      const allOn   = secPerms.every(p => current.has(p))
      secPerms.forEach(p => allOn ? current.delete(p) : current.add(p))
      return { ...prev, permissions: Array.from(current) }
    })
  }

  // ── Reset to default permissions for this role name ──────────────────────
  const handleResetToDefault = async () => {
    if (!formData.name) return
    try {
      setResetting(true)
      setError(null)
      const res = await roleService.getDefaultPermissions(formData.name)
      setFormData(prev => ({ ...prev, permissions: res.data?.permissions || [] }))
    } catch {
      setError(`No default permissions found for role "${formData.name}". Only system roles have defaults.`)
    } finally {
      setResetting(false)
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      setSaving(true)
      if (isEdit) {
        await roleService.updateRole(id, formData)
        // Refresh current user's permissions in Redux if they have this role
        if (currentUser?.role === formData.name) {
          try {
            const profile = await userService.getMyProfile()
            const u = profile.data
            dispatch({
              type: 'auth/setCredentials',
              payload: {
                user: {
                  ...currentUser,
                  id:          u.id,
                  username:    u.username,
                  fullName:    u.full_name,
                  email:       u.email,
                  role:        u.role,
                  permissions: u.permissions || [],
                  isOwner:     u.is_owner,
                },
                access_token:  auth.token,
                refresh_token: null,
              },
            })
          } catch (e2) {
            console.error('Failed to refresh current user after role update', e2)
          }
        }
      } else {
        await roleService.createRole(formData)
      }
      navigate('/roles')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save')
    } finally { setSaving(false) }
  }

  if (loading) return (
    <div className="p-6 flex justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-accent-600" />
    </div>
  )

  const permSet = new Set(formData.permissions)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button onClick={() => navigate('/roles')}
        className="flex items-center gap-2 text-surface-600 hover:text-surface-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Roles
      </button>
      <h1 className="text-2xl font-bold text-surface-900 mb-6">
        {isEdit ? 'Edit Role' : 'Create Role'}
      </h1>

      {error && <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── Role Details ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
          <h2 className="text-lg font-semibold mb-4">Role Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Role Name <span className="text-red-500">*</span>
              </label>
              <input type="text" name="name" value={formData.name} onChange={handleChange}
                disabled={isEdit}
                placeholder="custom_role"
                className={`w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500 ${isEdit ? 'bg-surface-100' : ''}`} />
              <p className="mt-1 text-xs text-surface-400">Lowercase, underscores only. Cannot be changed after creation.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Display Name <span className="text-red-500">*</span>
              </label>
              <input type="text" name="display_name" value={formData.display_name} onChange={handleChange}
                placeholder="Custom Role"
                className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-surface-700 mb-1">Description</label>
              <textarea name="description" value={formData.description} onChange={handleChange} rows={2}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500 resize-none" />
            </div>
          </div>
        </div>

        {/* ── Permissions ───────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-accent-600" />
            <h2 className="text-lg font-semibold">Permissions</h2>
            <span className="ml-auto flex items-center gap-3">
              <span className="text-sm text-surface-400">
                {formData.permissions.length} selected
              </span>
              <button
                type="button"
                onClick={handleResetToDefault}
                disabled={resetting || !formData.name}
                title="Reset to default permissions for this role"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-surface-300 text-surface-600 hover:border-accent-400 hover:text-accent-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {resetting
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <RotateCcw className="w-3.5 h-3.5" />
                }
                Reset to Default
              </button>
            </span>
          </div>
          <p className="text-sm text-surface-500 mb-5">
            All users assigned this role will inherit these permissions (unless individually overridden).
          </p>

          {/* ── Hierarchical section → module → permission ────────────── */}
          <div className="space-y-4">
            {PERMISSION_SECTIONS.map(sec => {
              const secPerms = getSectionPerms(sec)
              const secState = getCheckState(secPerms, permSet)
              return (
                <div key={sec.section} className="border border-surface-200 rounded-xl overflow-hidden shadow-md">
                  {/* Level 1 — Section header */}
                  <div
                    style={{ background: 'linear-gradient(135deg, #0F0C29 0%, #1C1A4A 100%)' }}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer select-none border-b border-white/10 border-l-4 transition-all duration-300 hover:brightness-125 ${
                      secState === 'checked'       ? 'border-l-accent-400'
                    : secState === 'indeterminate' ? 'border-l-blue-400'
                    :                               'border-l-white/20'
                    }`}
                    onClick={() => toggleSection(sec)}
                  >
                    <TriCheckbox
                      state={secState}
                      onChange={() => toggleSection(sec)}
                    />
                    <span className={`font-bold text-sm uppercase tracking-widest ${
                      secState === 'checked'       ? 'text-white'
                    : secState === 'indeterminate' ? 'text-white/80'
                    :                               'text-white/60'
                    }`}>{sec.section}</span>
                    <span className={`ml-auto text-xs font-medium ${
                      secState === 'checked'       ? 'text-white/70'
                    : secState === 'indeterminate' ? 'text-blue-300'
                    :                               'text-white/40'
                    }`}>
                      {secPerms.filter(p => permSet.has(p)).length}/{secPerms.length}
                    </span>
                  </div>

                  {/* Level 2 — Module rows */}
                  <div className="divide-y divide-surface-100">
                    {sec.modules.map(mod => {
                      const modState = getCheckState(mod.perms, permSet)
                      return (
                        <div key={mod.label} className="bg-white">
                          {/* Module row */}
                          <div
                            className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-surface-50 select-none"
                            onClick={() => toggleModule(mod)}
                          >
                            <TriCheckbox state={modState} onChange={() => toggleModule(mod)} />
                            <span className={`text-sm font-medium ${modState !== 'unchecked' ? 'text-surface-800' : 'text-surface-600'}`}>
                              {mod.label}
                            </span>
                          </div>
                          {/* Level 3 — Permission chips */}
                          <div className="px-4 pb-2.5 flex flex-wrap gap-1.5">
                            {mod.perms.map(perm => {
                              const on     = permSet.has(perm)
                              const action = perm.split(':')[1].replace(/_/g, ' ')
                              return (
                                <button
                                  key={perm}
                                  type="button"
                                  onClick={() => togglePermission(perm)}
                                  title={perm}
                                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all
                                    ${on
                                      ? 'bg-accent-600 text-white border-accent-600 shadow-sm'
                                      : 'bg-white text-surface-500 border-surface-300 hover:border-accent-400 hover:text-accent-600'
                                    }`}
                                >
                                  {action}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <div className="flex justify-end gap-4">
          <button type="button" onClick={() => navigate('/roles')}
            className="px-6 py-2 border border-surface-300 rounded-lg hover:bg-surface-50">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-accent-600 hover:bg-accent-700 text-white rounded-lg disabled:opacity-50">
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : <><Save className="w-4 h-4" /> {isEdit ? 'Update Role' : 'Create Role'}</>
            }
          </button>
        </div>
      </form>
    </div>
  )
}

export default RoleForm
