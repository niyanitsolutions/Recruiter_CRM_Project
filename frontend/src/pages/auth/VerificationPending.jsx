import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Mail, CheckCircle, RefreshCw, ArrowLeft } from 'lucide-react'
import authService from '../../services/authService'

const VerificationPending = () => {
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') || ''

  const [resendLoading, setResendLoading] = useState(false)
  const [resendSent, setResendSent] = useState(false)

  const handleResend = async () => {
    if (!email) return
    setResendLoading(true)
    try {
      await authService.resendVerification(email)
      setResendSent(true)
    } catch {
      setResendSent(true)
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-surface-200 px-8 py-4 flex items-center gap-3">
        <img src="/Hire_Flow_Logo.png" alt="HireFlow" style={{ height: '32px', width: 'auto' }} />
        <p className="text-xs text-surface-500">Recruitment &amp; Partner Management</p>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-surface-200 p-10 text-center animate-fade-in">
          <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Mail className="w-10 h-10 text-indigo-500" />
          </div>

          <h2 className="text-2xl font-bold text-surface-900 mb-2">Check your inbox</h2>
          <p className="text-surface-500 text-sm mb-2">
            We've sent a verification link to:
          </p>
          {email && (
            <p className="font-semibold text-surface-900 text-sm mb-5">{email}</p>
          )}
          <p className="text-surface-400 text-xs mb-7 leading-relaxed">
            Click the link in the email to verify your address and activate your free trial.
            The link expires in 24 hours.
          </p>

          {!resendSent ? (
            <button
              onClick={handleResend}
              disabled={resendLoading || !email}
              className="w-full flex items-center justify-center gap-2 py-2.5 mb-4 rounded-xl text-sm font-medium border border-surface-200 text-surface-600 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {resendLoading ? (
                <span style={{ width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin .7s linear infinite' }} />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Resend verification email
            </button>
          ) : (
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 mb-4 flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              A new verification email has been sent.
            </div>
          )}

          <Link
            to="/login"
            className="inline-flex items-center gap-1 text-sm text-surface-400 hover:text-surface-600 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Login
          </Link>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default VerificationPending
