import React, { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { User, Mail, Shield, Key, Eye, EyeOff, Phone, Edit2, X, Check, Loader2 } from 'lucide-react'
import { Card, Button } from '../../components/common'
import { selectUser, setCredentials } from '../../store/authSlice'
import { getToken, getRefreshToken } from '../../utils/token'
import superAdminService from '../../services/superAdminService'
import toast from 'react-hot-toast'

// ── Password Change Modal ─────────────────────────────────────────────────────
const ChangePasswordModal = ({ onClose }) => {
  const [form, setForm] = useState({ current: '', newPass: '', confirm: '' })
  const [show, setShow] = useState({ current: false, newPass: false, confirm: false })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.newPass !== form.confirm) {
      toast.error('New passwords do not match')
      return
    }
    if (form.newPass.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      await superAdminService.changePassword({
        current_password: form.current,
        new_password: form.newPass,
      })
      toast.success('Password updated successfully')
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update password')
    } finally {
      setLoading(false)
    }
  }

  const fields = [
    { key: 'current', label: 'Current Password' },
    { key: 'newPass', label: 'New Password' },
    { key: 'confirm', label: 'Confirm New Password' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Key className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Change Password</h3>
              <p className="text-xs text-gray-500">Update your account password</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {fields.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
              <div className="relative">
                <input
                  type={show[key] ? 'text' : 'password'}
                  value={form[key]}
                  onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full px-3.5 py-2.5 pr-11 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  placeholder={`Enter ${label.toLowerCase()}`}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShow(s => ({ ...s, [key]: !s[key] }))}
                >
                  {show[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}

          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Updating…
                </span>
              ) : 'Update Password'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Defined outside SuperAdminProfile so the component identity is stable across re-renders.
// If defined inside, every keystroke triggers a new function ref → React unmounts/remounts
// the input → cursor resets to end.
const InfoRow = ({ icon: Icon, label, field, value, isEditing, editForm, setEditForm }) => (
  <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
    <div className="w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center flex-shrink-0">
      <Icon className="w-4.5 h-4.5 text-gray-400" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      {isEditing && field ? (
        <input
          className="w-full text-sm font-medium bg-white border border-blue-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          value={editForm[field] || ''}
          onChange={(e) => setEditForm(f => ({ ...f, [field]: e.target.value }))}
          placeholder={`Enter ${label.toLowerCase()}`}
        />
      ) : (
        <p className="text-sm font-medium text-gray-900 truncate">{value || '—'}</p>
      )}
    </div>
  </div>
)

// ── Main Profile Page ─────────────────────────────────────────────────────────
const SuperAdminProfile = () => {
  const dispatch = useDispatch()
  const user = useSelector(selectUser)

  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [isSaving, setIsSaving] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)

  const startEdit = () => {
    setEditForm({
      full_name: user?.fullName || '',
      username: user?.username || '',
      email: user?.email || '',
      mobile: user?.mobile || '',
    })
    setIsEditing(true)
  }

  const cancelEdit = () => {
    setIsEditing(false)
    setEditForm({})
  }

  const saveProfile = async () => {
    setIsSaving(true)
    try {
      const res = await superAdminService.updateProfile(editForm)
      const updated = res.data?.data || {}

      const token = getToken()
      const refreshToken = getRefreshToken()
      dispatch(setCredentials({
        user: {
          ...user,
          fullName: updated.full_name || user.fullName,
          username: updated.username || user.username,
          email: updated.email || user.email,
          mobile: updated.mobile ?? user.mobile,
        },
        access_token: token,
        refresh_token: refreshToken,
      }))

      toast.success('Profile updated successfully')
      setIsEditing(false)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update profile')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}

      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
          <p className="text-gray-500 mt-1">Super Admin account details</p>
        </div>

        {/* Profile Card */}
        <Card>
          <Card.Content className="pt-6">
            {/* Avatar + name row */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                  {(user?.fullName || 'S').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    {user?.fullName || 'Super Admin'}
                  </h2>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                    <Shield className="w-3 h-3" />
                    Super Admin
                  </span>
                </div>
              </div>

              {/* Edit / Save / Cancel buttons */}
              {!isEditing ? (
                <button
                  onClick={startEdit}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-blue-600 bg-gray-100 hover:bg-blue-50 rounded-xl transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit Profile
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={saveProfile}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-60"
                  >
                    {isSaving
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Check className="w-4 h-4" />}
                    {isSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Info rows */}
            <div className="space-y-3">
              <InfoRow icon={User}   label="Full Name" field="full_name" value={user?.fullName} isEditing={isEditing} editForm={editForm} setEditForm={setEditForm} />
              <InfoRow icon={User}   label="Username"  field="username"  value={user?.username} isEditing={isEditing} editForm={editForm} setEditForm={setEditForm} />
              <InfoRow icon={Mail}   label="Email"     field="email"     value={user?.email}    isEditing={isEditing} editForm={editForm} setEditForm={setEditForm} />
              <InfoRow icon={Phone}  label="Phone"     field="mobile"    value={user?.mobile}   isEditing={isEditing} editForm={editForm} setEditForm={setEditForm} />
              <InfoRow icon={Shield} label="Role"      field={null}      value="Super Administrator" isEditing={isEditing} editForm={editForm} setEditForm={setEditForm} />
            </div>
          </Card.Content>
        </Card>

        {/* Security Card */}
        <Card>
          <Card.Header>
            <div className="flex items-center justify-between">
              <div>
                <Card.Title>Security</Card.Title>
                <p className="text-sm text-gray-500 mt-0.5">Manage your account password</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowPasswordModal(true)}
              >
                <Key className="w-4 h-4 mr-2" />
                Change Password
              </Button>
            </div>
          </Card.Header>
          <Card.Content>
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-100">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                <Shield className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-green-800">Password is set</p>
                <p className="text-xs text-green-600">Use the button above to change your password</p>
              </div>
            </div>
          </Card.Content>
        </Card>
      </div>
    </>
  )
}

export default SuperAdminProfile
