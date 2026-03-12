import React, { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { Save, Loader2, Key, User, Mail, Phone } from 'lucide-react'
import { selectUser } from '../../store/authSlice'
import userService from '../../services/userService'

const Profile = () => {
  const currentUser = useSelector(selectUser)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState(null)
  const [formData, setFormData] = useState({ mobile: '', address: '', city: '', state: '', zip_code: '' })
  const [passwordData, setPasswordData] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [message, setMessage] = useState({ type: '', text: '' })
  const [activeTab, setActiveTab] = useState('profile')

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await userService.getMyProfile()
        setProfile(response.data)
        setFormData({
          mobile: response.data.mobile || '',
          address: response.data.address || '',
          city: response.data.city || '',
          state: response.data.state || '',
          zip_code: response.data.zip_code || '',
        })
      } catch (err) { console.error(err) }
      finally { setLoading(false) }
    }
    fetchProfile()
  }, [])

  const handleProfileUpdate = async (e) => {
    e.preventDefault()
    try {
      setSaving(true)
      await userService.updateMyProfile(formData)
      setMessage({ type: 'success', text: 'Profile updated successfully' })
    } catch (err) { setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to update' }) }
    finally { setSaving(false) }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    if (passwordData.new_password !== passwordData.confirm_password) {
      setMessage({ type: 'error', text: 'Passwords do not match' }); return
    }
    try {
      setSaving(true)
      await userService.changePassword(passwordData)
      setMessage({ type: 'success', text: 'Password changed successfully' })
      setPasswordData({ current_password: '', new_password: '', confirm_password: '' })
    } catch (err) { setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to change password' }) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="p-6"><div className="animate-pulse h-64 bg-surface-200 rounded-xl"></div></div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-surface-900 mb-6">My Profile</h1>

      {message.text && (
        <div className={`mb-6 p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {/* Profile Header */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-accent-100 flex items-center justify-center text-accent-700 text-3xl font-bold">
            {profile?.full_name?.charAt(0)}
          </div>
          <div>
            <h2 className="text-xl font-semibold text-surface-900">{profile?.full_name}</h2>
            <p className="text-surface-500 capitalize">{profile?.role?.replace('_', ' ')}</p>
            <div className="flex items-center gap-4 mt-2 text-sm text-surface-600">
              <span className="flex items-center gap-1"><Mail className="w-4 h-4" /> {profile?.email}</span>
              <span className="flex items-center gap-1"><Phone className="w-4 h-4" /> {profile?.mobile}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6">
        <button onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'profile' ? 'bg-accent-600 text-white' : 'bg-surface-100 text-surface-700'}`}>
          <User className="w-4 h-4 inline mr-2" /> Profile
        </button>
        <button onClick={() => setActiveTab('password')}
          className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'password' ? 'bg-accent-600 text-white' : 'bg-surface-100 text-surface-700'}`}>
          <Key className="w-4 h-4 inline mr-2" /> Password
        </button>
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <form onSubmit={handleProfileUpdate} className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
          <h3 className="text-lg font-semibold mb-4">Edit Profile</h3>
          <p className="text-sm text-surface-500 mb-4">Note: Username, email, and name cannot be changed. Contact admin for changes.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Mobile</label>
              <input type="tel" value={formData.mobile} onChange={(e) => setFormData(f => ({ ...f, mobile: e.target.value }))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Address</label>
              <input type="text" value={formData.address} onChange={(e) => setFormData(f => ({ ...f, address: e.target.value }))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">City</label>
              <input type="text" value={formData.city} onChange={(e) => setFormData(f => ({ ...f, city: e.target.value }))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">State</label>
              <input type="text" value={formData.state} onChange={(e) => setFormData(f => ({ ...f, state: e.target.value }))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">ZIP Code</label>
              <input type="text" value={formData.zip_code} onChange={(e) => setFormData(f => ({ ...f, zip_code: e.target.value }))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-6 py-2 bg-accent-600 text-white rounded-lg disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Changes
            </button>
          </div>
        </form>
      )}

      {/* Password Tab */}
      {activeTab === 'password' && (
        <form onSubmit={handlePasswordChange} className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
          <h3 className="text-lg font-semibold mb-4">Change Password</h3>
          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Current Password</label>
              <input type="password" value={passwordData.current_password}
                onChange={(e) => setPasswordData(p => ({ ...p, current_password: e.target.value }))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">New Password</label>
              <input type="password" value={passwordData.new_password}
                onChange={(e) => setPasswordData(p => ({ ...p, new_password: e.target.value }))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Confirm New Password</label>
              <input type="password" value={passwordData.confirm_password}
                onChange={(e) => setPasswordData(p => ({ ...p, confirm_password: e.target.value }))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
            </div>
          </div>
          <div className="mt-6">
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-6 py-2 bg-accent-600 text-white rounded-lg disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />} Change Password
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export default Profile