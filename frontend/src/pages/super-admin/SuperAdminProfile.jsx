import React, { useState } from 'react'
import { useSelector } from 'react-redux'
import { User, Mail, Shield, Key, Eye, EyeOff } from 'lucide-react'
import { Card, Button } from '../../components/common'
import { selectUser } from '../../store/authSlice'
import toast from 'react-hot-toast'

const SuperAdminProfile = () => {
  const user = useSelector(selectUser)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' })
  const [showPass, setShowPass] = useState({ current: false, newPass: false, confirm: false })

  const handlePasswordChange = (e) => {
    e.preventDefault()
    if (passwords.newPass !== passwords.confirm) {
      toast.error('New passwords do not match')
      return
    }
    if (passwords.newPass.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    toast.success('Password change is not yet implemented in this version')
    setShowChangePassword(false)
    setPasswords({ current: '', newPass: '', confirm: '' })
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-gray-500 mt-1">Super Admin account details</p>
      </div>

      {/* Profile Info */}
      <Card>
        <Card.Content className="pt-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-2xl font-bold">
              {user?.fullName?.charAt(0) || 'S'}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{user?.fullName || 'Super Admin'}</h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                <Shield className="w-3 h-3" />
                Super Admin
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <User className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Username</p>
                <p className="text-sm font-medium text-gray-900">{user?.username || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <Mail className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Email</p>
                <p className="text-sm font-medium text-gray-900">{user?.email || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <Shield className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Role</p>
                <p className="text-sm font-medium text-gray-900">Super Administrator</p>
              </div>
            </div>
          </div>
        </Card.Content>
      </Card>

      {/* Change Password */}
      <Card>
        <Card.Header>
          <div className="flex items-center justify-between">
            <Card.Title>Security</Card.Title>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowChangePassword(!showChangePassword)}
            >
              <Key className="w-4 h-4 mr-2" />
              Change Password
            </Button>
          </div>
        </Card.Header>
        {showChangePassword && (
          <Card.Content>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              {[
                { key: 'current', label: 'Current Password' },
                { key: 'newPass', label: 'New Password' },
                { key: 'confirm', label: 'Confirm New Password' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <div className="relative">
                    <input
                      type={showPass[key] ? 'text' : 'password'}
                      value={passwords[key]}
                      onChange={(e) => setPasswords(p => ({ ...p, [key]: e.target.value }))}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                      onClick={() => setShowPass(p => ({ ...p, [key]: !p[key] }))}
                    >
                      {showPass[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex gap-3">
                <Button type="submit" variant="primary" size="sm">Update Password</Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowChangePassword(false)}>Cancel</Button>
              </div>
            </form>
          </Card.Content>
        )}
      </Card>
    </div>
  )
}

export default SuperAdminProfile
