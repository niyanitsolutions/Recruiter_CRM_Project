import React, { useState, useEffect } from 'react'
import { UserCircle, Lock } from 'lucide-react'
import { Card, Button } from '../../components/common'
import sellerPortalService from '../../services/sellerPortalService'
import toast from 'react-hot-toast'

const SellerProfile = () => {
  const [profile, setProfile] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isChangingPwd, setIsChangingPwd] = useState(false)

  const [profileForm, setProfileForm] = useState({
    seller_name: '', phone: '', address: '',
  })

  const [pwdForm, setPwdForm] = useState({
    old_password: '', new_password: '', confirm_password: '',
  })

  const fetchProfile = async () => {
    setIsLoading(true)
    try {
      const res = await sellerPortalService.getProfile()
      setProfile(res.data)
      setProfileForm({
        seller_name: res.data.seller_name || '',
        phone: res.data.phone || '',
        address: res.data.address || '',
      })
    } catch {
      toast.error('Failed to load profile')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchProfile() }, [])

  const handleSaveProfile = async () => {
    setIsSaving(true)
    try {
      await sellerPortalService.updateProfile(profileForm)
      toast.success('Profile updated')
      fetchProfile()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update profile')
    } finally {
      setIsSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (pwdForm.new_password !== pwdForm.confirm_password) {
      toast.error('New passwords do not match')
      return
    }
    if (pwdForm.new_password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setIsChangingPwd(true)
    try {
      await sellerPortalService.changePassword({
        old_password: pwdForm.old_password,
        new_password: pwdForm.new_password,
      })
      toast.success('Password changed successfully')
      setPwdForm({ old_password: '', new_password: '', confirm_password: '' })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to change password')
    } finally {
      setIsChangingPwd(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">My Profile</h1>
        <p className="text-surface-500">Manage your seller account details</p>
      </div>

      {/* Profile Info */}
      <Card>
        <Card.Header>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent-100 rounded-xl flex items-center justify-center">
              <UserCircle className="w-6 h-6 text-accent-600" />
            </div>
            <div>
              <Card.Title>Profile Information</Card.Title>
              <Card.Description>Update your name, phone, and address</Card.Description>
            </div>
          </div>
        </Card.Header>
        <Card.Content>
          <div className="space-y-4">
            <div>
              <label className="form-label">Seller Name</label>
              <input
                className="input"
                value={profileForm.seller_name}
                onChange={(e) => setProfileForm(f => ({ ...f, seller_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="form-label">Company Name</label>
              <input className="input" value={profile?.company_name || ''} disabled readOnly />
            </div>
            <div>
              <label className="form-label">Email (read-only)</label>
              <input className="input" value={profile?.email || ''} disabled readOnly />
            </div>
            <div>
              <label className="form-label">Phone</label>
              <input
                className="input"
                value={profileForm.phone}
                onChange={(e) => setProfileForm(f => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div>
              <label className="form-label">Address</label>
              <input
                className="input"
                value={profileForm.address}
                onChange={(e) => setProfileForm(f => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveProfile} isLoading={isSaving}>Save Changes</Button>
            </div>
          </div>
        </Card.Content>
      </Card>

      {/* Password Change */}
      <Card>
        <Card.Header>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-warning-100 rounded-xl flex items-center justify-center">
              <Lock className="w-6 h-6 text-warning-600" />
            </div>
            <div>
              <Card.Title>Change Password</Card.Title>
              <Card.Description>Keep your account secure with a strong password</Card.Description>
            </div>
          </div>
        </Card.Header>
        <Card.Content>
          <div className="space-y-4">
            <div>
              <label className="form-label">Current Password</label>
              <input
                type="password"
                className="input"
                value={pwdForm.old_password}
                onChange={(e) => setPwdForm(f => ({ ...f, old_password: e.target.value }))}
              />
            </div>
            <div>
              <label className="form-label">New Password</label>
              <input
                type="password"
                className="input"
                value={pwdForm.new_password}
                onChange={(e) => setPwdForm(f => ({ ...f, new_password: e.target.value }))}
              />
            </div>
            <div>
              <label className="form-label">Confirm New Password</label>
              <input
                type="password"
                className="input"
                value={pwdForm.confirm_password}
                onChange={(e) => setPwdForm(f => ({ ...f, confirm_password: e.target.value }))}
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={handleChangePassword} isLoading={isChangingPwd} variant="secondary">
                Change Password
              </Button>
            </div>
          </div>
        </Card.Content>
      </Card>
    </div>
  )
}

export default SellerProfile
