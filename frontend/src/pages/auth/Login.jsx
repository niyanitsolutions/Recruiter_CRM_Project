import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Mail, Lock, ArrowRight, AlertCircle, Calendar, XCircle, RefreshCw, CheckCircle, UserX } from 'lucide-react'
import { login, clearError, selectAuth, selectSubscriptionExpired } from '../../store/authSlice'
import { Button, Input } from '../../components/common'
import { formatDateTime } from '../../utils/format'
import authService from '../../services/authService'

const Login = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { isLoading } = useSelector(selectAuth)
  const subscriptionExpired = useSelector(selectSubscriptionExpired)

  // "Account Not Found" full-screen state — stores the error message
  const [loginFailed, setLoginFailed] = useState(null)

  // Email not verified state
  const [emailNotVerified, setEmailNotVerified] = useState(null)  // { email, message }
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSent, setResendSent] = useState(false)

  // Inline error for sessionStorage-sourced messages (e.g. api.js interceptor)
  const [inlineError, setInlineError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: { identifier: '', password: '' },
  })

  // Show sessionStorage errors (e.g. subscription expired, set by api.js interceptor)
  useEffect(() => {
    const stored = sessionStorage.getItem('login_error')
    if (stored) {
      sessionStorage.removeItem('login_error')
      setInlineError(stored)
    }
  }, [])

  const onSubmit = async (data) => {
    setLoginFailed(null)
    setEmailNotVerified(null)
    setResendSent(false)
    setInlineError('')
    const result = await dispatch(login(data))

    if (login.fulfilled.match(result)) {
      toast.success('Login successful!')
    } else if (login.rejected.match(result)) {
      const payload = result.payload

      if (payload && typeof payload === 'object' && payload.email_not_verified) {
        // Email-not-verified has its own dedicated screen
        setEmailNotVerified({ email: payload.email, message: payload.message })

      } else if (payload && typeof payload === 'object' && payload.type === 'SUBSCRIPTION_EXPIRED') {
        // Redux already set subscriptionExpired — the if(subscriptionExpired) block below handles it
        // Nothing extra needed here

      } else {
        // User not found, invalid credentials, company not found, etc.
        // Show the persistent "Account Not Found" screen — NOT a toast or modal
        const msg = typeof payload === 'string' ? payload : 'Login failed. Please try again.'
        setLoginFailed(msg)
        dispatch(clearError())  // clear Redux error so it doesn't re-trigger anything
      }
    }
  }

  const handleResendVerification = async () => {
    if (!emailNotVerified?.email) return
    setResendLoading(true)
    try {
      await authService.resendVerification(emailNotVerified.email)
      setResendSent(true)
      toast.success('Verification email sent! Check your inbox.')
    } catch {
      setResendSent(true)  // always show success (privacy)
    } finally {
      setResendLoading(false)
    }
  }

  // ── Account Not Found screen ──────────────────────────────────────────────
  if (loginFailed) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <UserX className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-surface-900">Account Not Found</h2>
          <p className="text-surface-500 mt-2 text-sm">
            We couldn't find an account matching your details.
          </p>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
          <p className="font-semibold mb-1">{loginFailed}</p>
          <p className="text-red-700">
            Double-check your username / email / mobile and password, or create a new account to get started.
          </p>
        </div>

        <Link to="/register">
          <button className="w-full py-3 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-xl transition-colors">
            Create New Account
          </button>
        </Link>

        <button
          onClick={() => setLoginFailed(null)}
          className="w-full px-4 py-3 text-sm text-surface-600 hover:text-surface-800 font-medium transition-colors"
        >
          ← Back to Login
        </button>
      </div>
    )
  }

  // ── Email not verified screen ─────────────────────────────────────────────
  if (emailNotVerified) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
            <Mail className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-2xl font-bold text-surface-900">Verify Your Email</h2>
          <p className="text-surface-500 mt-2 text-sm">
            Your account is not yet verified. Check your inbox for the verification link.
          </p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          {emailNotVerified.message}
          {emailNotVerified.email && (
            <p className="mt-1 text-xs text-amber-700">Email: <strong>{emailNotVerified.email}</strong></p>
          )}
        </div>

        {!resendSent ? (
          <Button
            onClick={handleResendVerification}
            isLoading={resendLoading}
            className="w-full"
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Resend Verification Email
          </Button>
        ) : (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-700 text-center">
            <CheckCircle className="w-5 h-5 mx-auto mb-1 text-green-600" />
            Verification email sent! Check your inbox and click the link.
          </div>
        )}

        <button
          onClick={() => setEmailNotVerified(null)}
          className="w-full px-4 py-3 text-sm text-surface-600 hover:text-surface-800 font-medium transition-colors"
        >
          ← Back to Login
        </button>
      </div>
    )
  }

  // ── Subscription expired screen ───────────────────────────────────────────
  if (subscriptionExpired) {
    const expiryLabel = subscriptionExpired.planExpiry
      ? formatDateTime(subscriptionExpired.planExpiry)
      : null
    const isSeller = subscriptionExpired.userType === 'seller'

    // Seller subscription expired — they must contact super admin to renew
    if (isSeller) {
      return (
        <div className="animate-fade-in">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
              <Calendar className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-2xl font-bold text-surface-900">Subscription Expired</h2>
            {expiryLabel && (
              <p className="text-sm text-surface-500 mt-1">
                Expired on <span className="font-medium text-surface-700">{expiryLabel}</span>
              </p>
            )}
          </div>

          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
            <p className="text-sm text-amber-800">{subscriptionExpired.message}</p>
            <p className="text-sm text-amber-700 mt-2">
              Please contact the platform administrator to renew your seller subscription.
            </p>
          </div>

          <button
            onClick={() => dispatch(clearError())}
            className="w-full px-4 py-3 text-sm text-surface-600 hover:text-surface-800 font-medium border border-surface-200 rounded-xl transition-colors"
          >
            ← Back to Login
          </button>
        </div>
      )
    }

    if (subscriptionExpired.isOwner) {
      return (
        <div className="animate-fade-in">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
              <Calendar className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-2xl font-bold text-surface-900">Subscription Expired</h2>
            {expiryLabel && (
              <p className="text-sm text-surface-500 mt-1">
                Expired on <span className="font-medium text-surface-700">{expiryLabel}</span>
              </p>
            )}
          </div>

          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
            <p className="text-sm text-amber-800">{subscriptionExpired.message}</p>
          </div>

          <button
            onClick={() => navigate('/upgrade-plan', { state: subscriptionExpired })}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-xl transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            Upgrade Plan
          </button>

          <button
            onClick={() => dispatch(clearError())}
            className="w-full mt-3 px-4 py-3 text-sm text-surface-600 hover:text-surface-800 font-medium transition-colors"
          >
            ← Back to Login
          </button>
        </div>
      )
    }

    // Non-owner: show blocked message
    return (
      <div className="animate-fade-in">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-surface-900">Access Unavailable</h2>
        </div>

        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-4 space-y-2">
          <p className="text-sm font-semibold text-red-800">Your company subscription has expired.</p>
          {expiryLabel && (
            <p className="text-xs text-red-700">
              Expired on: <span className="font-medium">{expiryLabel}</span>
            </p>
          )}
          <p className="text-sm text-red-700 mt-2">
            Please contact your company administrator to renew the subscription.
          </p>
        </div>

        <button
          onClick={() => dispatch(clearError())}
          className="w-full px-4 py-3 text-sm text-surface-600 hover:text-surface-800 font-medium border border-surface-200 rounded-xl transition-colors"
        >
          ← Back to Login
        </button>
      </div>
    )
  }

  // ── Login form (default) ──────────────────────────────────────────────────
  return (
    <div className="animate-fade-in">

      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-surface-900">Welcome back</h2>
        <p className="text-surface-500 mt-2">Sign in to access your recruitment CRM dashboard.</p>
      </div>

      {/* Inline error banner (sessionStorage-sourced only) */}
      {inlineError && (
        <div className="mb-5 flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 font-medium">{inlineError}</p>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <Input
          label="Username, Email, or Mobile"
          placeholder="Enter your username, email, or mobile"
          leftIcon={<Mail className="w-4 h-4" />}
          error={errors.identifier?.message}
          {...register('identifier', {
            required: 'This field is required',
            minLength: { value: 3, message: 'Minimum 3 characters required' },
          })}
        />

        <Input
          label="Password"
          type="password"
          placeholder="Enter your password"
          leftIcon={<Lock className="w-4 h-4" />}
          error={errors.password?.message}
          {...register('password', { required: 'Password is required' })}
        />

        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm text-accent-600 hover:text-accent-700 font-medium">
            Forgot password?
          </Link>
        </div>

        <Button
          type="submit"
          isLoading={isLoading}
          className="w-full"
          rightIcon={<ArrowRight className="w-4 h-4" />}
        >
          Sign In
        </Button>
      </form>

      {/* Divider */}
      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-surface-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-white text-surface-500">New to CRM Platform?</span>
        </div>
      </div>

      <Link to="/register">
        <Button variant="outline" className="w-full">Create Your Company Profile</Button>
      </Link>

      
    </div>
  )
}

export default Login
