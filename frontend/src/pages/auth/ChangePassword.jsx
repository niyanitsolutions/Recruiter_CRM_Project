import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Lock, ArrowRight, ShieldCheck } from 'lucide-react'
import { clearForcePasswordChange, selectUser, selectForcePasswordChange } from '../../store/authSlice'
import { Button, Input } from '../../components/common'
import api from '../../services/api'

const ChangePassword = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const user = useSelector(selectUser)
  const isForced = useSelector(selectForcePasswordChange)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({ mode: 'onBlur' })

  const newPassword = watch('new_password')

  const onSubmit = async (data) => {
    setIsLoading(true)
    try {
      await api.post('/auth/change-password', {
        current_password: data.current_password,
        new_password: data.new_password,
      })
      toast.success('Password changed successfully!')
      dispatch(clearForcePasswordChange())
      navigate('/dashboard')
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to change password'
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent-100 mb-4">
          <ShieldCheck className="w-8 h-8 text-accent-600" />
        </div>
        <h2 className="text-2xl font-bold text-surface-900">
          {isForced ? 'Set Your New Password' : 'Change Password'}
        </h2>
        <p className="text-surface-500 mt-2 text-sm">
          {isForced
            ? `Hi ${user?.fullName || 'there'}, your admin has asked you to set a new password before continuing.`
            : 'Enter your current password and choose a new one.'}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <Input
          label="Current Password"
          type="password"
          placeholder="Enter current password"
          leftIcon={<Lock className="w-4 h-4" />}
          error={errors.current_password?.message}
          {...register('current_password', { required: 'Current password is required' })}
        />

        <Input
          label="New Password"
          type="password"
          placeholder="Min. 8 characters"
          leftIcon={<Lock className="w-4 h-4" />}
          error={errors.new_password?.message}
          {...register('new_password', {
            required: 'New password is required',
            minLength: { value: 8, message: 'Minimum 8 characters' },
            pattern: {
              value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
              message: 'Must include uppercase, lowercase, and a number',
            },
          })}
        />

        <Input
          label="Confirm New Password"
          type="password"
          placeholder="Repeat new password"
          leftIcon={<Lock className="w-4 h-4" />}
          error={errors.confirm_password?.message}
          {...register('confirm_password', {
            required: 'Please confirm your new password',
            validate: (v) => v === newPassword || 'Passwords do not match',
          })}
        />

        <Button
          type="submit"
          isLoading={isLoading}
          className="w-full"
          rightIcon={<ArrowRight className="w-4 h-4" />}
        >
          {isForced ? 'Set Password & Continue' : 'Change Password'}
        </Button>
      </form>

      {!isForced && (
        <button
          onClick={() => navigate(-1)}
          className="w-full mt-4 px-4 py-3 text-sm text-surface-600 hover:text-surface-800 font-medium transition-colors"
        >
          ← Back
        </button>
      )}
    </div>
  )
}

export default ChangePassword
