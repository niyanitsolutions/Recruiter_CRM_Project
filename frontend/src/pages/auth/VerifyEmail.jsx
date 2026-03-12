import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, XCircle, Loader, Mail, RefreshCw } from 'lucide-react'
import authService from '../../services/authService'
import { Button } from '../../components/common'

const VerifyEmail = () => {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const type  = searchParams.get('type') || 'tenant'

  const [status, setStatus]   = useState('verifying')  // verifying | success | error
  const [message, setMessage] = useState('')
  const [resendEmail, setResendEmail] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSent, setResendSent]       = useState(false)

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('Invalid verification link. No token provided.')
      return
    }

    authService.verifyEmail(token, type)
      .then(res => {
        setStatus('success')
        setMessage(res.data.message || 'Email verified successfully!')
      })
      .catch(err => {
        setStatus('error')
        const detail = err.response?.data?.detail
        setMessage(
          typeof detail === 'object' ? detail.message : (detail || 'Verification failed. The link may have expired.')
        )
      })
  }, [token, type])

  const handleResend = async (e) => {
    e.preventDefault()
    if (!resendEmail) return
    setResendLoading(true)
    try {
      await authService.resendVerification(resendEmail)
      setResendSent(true)
    } catch {
      // Service always returns success — never expose existence
      setResendSent(true)
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <div className="animate-fade-in">
      {/* Verifying state */}
      {status === 'verifying' && (
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent-100 mb-4">
            <Loader className="w-8 h-8 text-accent-600 animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-surface-900">Verifying your email…</h2>
          <p className="text-surface-500 mt-2">Please wait a moment.</p>
        </div>
      )}

      {/* Success state */}
      {status === 'success' && (
        <div className="text-center py-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-surface-900">Email Verified!</h2>
          <p className="text-surface-500 mt-2 mb-6">{message}</p>
          <Link to="/login">
            <Button className="w-full">Continue to Login</Button>
          </Link>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div className="space-y-5">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-surface-900">Verification Failed</h2>
            <p className="text-surface-500 mt-2">{message}</p>
          </div>

          {/* Resend form */}
          {!resendSent ? (
            <form onSubmit={handleResend} className="space-y-4">
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                Enter your email address to receive a new verification link.
              </div>
              <div>
                <label className="form-label">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                  <input
                    type="email"
                    className="input pl-10"
                    placeholder="owner@company.com"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <Button
                type="submit"
                isLoading={resendLoading}
                className="w-full"
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                Resend Verification Email
              </Button>
            </form>
          ) : (
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-4 text-center text-sm text-green-700">
              <CheckCircle className="w-5 h-5 mx-auto mb-2 text-green-600" />
              If an unverified account exists with that email, a new link has been sent. Check your inbox.
            </div>
          )}

          <Link to="/login" className="block text-center text-sm text-accent-600 hover:underline mt-2">
            ← Back to Login
          </Link>
        </div>
      )}
    </div>
  )
}

export default VerifyEmail
