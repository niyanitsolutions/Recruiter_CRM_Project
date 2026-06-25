import { useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Lock, CheckCircle, XCircle, ArrowLeft } from 'lucide-react'
import { Button, Input } from '../../components/common'
import authService from '../../services/authService'

const ResetPassword = () => {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()

  const [status, setStatus] = useState('form')   // form | success | error
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({ mode: 'onBlur' })

  const newPassword = watch('new_password')

  const onSubmit = async (data) => {
    if (!token) {
      setStatus('error')
      setErrorMessage('Invalid reset link. No token provided.')
      return
    }
    setIsLoading(true)
    try {
      await authService.resetPassword(token, data.new_password)
      setStatus('success')
      toast.success('Password reset successfully!')
      setTimeout(() => navigate('/login'), 3000)
    } catch (err) {
      const data = err.response?.data
      const detail = data?.detail
      const message = data?.message
      const msg =
        (typeof detail === 'string' && detail)
          ? detail
          : (typeof message === 'string' && message)
          ? message
          : err.response?.status === 429
          ? 'Too many attempts. Please wait a minute before trying again.'
          : err.response?.status
          ? `Reset failed (HTTP ${err.response.status}). Please request a new reset link.`
          : 'Unable to reach the server. Check your connection and try again.'
      setStatus('error')
      setErrorMessage(msg)
    } finally {
      setIsLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="animate-fade-in text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
          <XCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-surface-900">Invalid Link</h2>
        <p className="text-surface-500 mt-2 mb-6">
          This password reset link is missing a token. Please request a new reset link.
        </p>
        <Link to="/forgot-password">
          <Button className="w-full">Request New Link</Button>
        </Link>
        <Link to="/login" className="block text-center text-sm text-accent-600 hover:underline mt-4">
          ← Back to Login
        </Link>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="animate-fade-in text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-surface-900">Password Reset!</h2>
        <p className="text-surface-500 mt-2 mb-2">
          Your password has been updated successfully.
        </p>
        <p className="text-surface-400 text-sm mb-6">
          All active sessions have been revoked. Redirecting to login…
        </p>
        <Link to="/login">
          <Button className="w-full">Continue to Login</Button>
        </Link>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-surface-900">Reset Failed</h2>
          <p className="text-surface-500 mt-2">{errorMessage}</p>
        </div>
        <Link to="/forgot-password">
          <Button className="w-full">Request New Reset Link</Button>
        </Link>
        <Link to="/login" className="block text-center text-sm text-accent-600 hover:underline">
          ← Back to Login
        </Link>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent-100 mb-4">
          <Lock className="w-8 h-8 text-accent-600" />
        </div>
        <h2 className="text-2xl font-bold text-surface-900">Set New Password</h2>
        <p className="text-surface-500 mt-2 text-sm">
          Choose a strong password for your account.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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

        <Button type="submit" isLoading={isLoading} className="w-full">
          Reset Password
        </Button>
      </form>

      <div className="mt-6 text-center">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-sm text-surface-600 hover:text-surface-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to login
        </Link>
      </div>
    </div>
  )
}

export default ResetPassword
