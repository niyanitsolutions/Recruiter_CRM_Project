import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  Mail, ArrowLeft, CheckCircle, Building2, Users, ChevronRight,
} from 'lucide-react'
import { Button, Input } from '../../components/common'
import authService from '../../services/authService'

// Steps:
//   "email"           → enter email
//   "scope_selection" → multiple companies: pick "specific" or "all"
//   "company_list"    → pick which company when scope = "specific"
//   "submitted"       → check your inbox

const ForgotPassword = () => {
  const location = useLocation()
  const _stateVal = location.state?.email || ''
  const prefillEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(_stateVal) ? _stateVal : ''

  const [step, setStep] = useState('email')
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState(prefillEmail)
  const [companies, setCompanies] = useState([])

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { email: prefillEmail },
  })

  // Step 1: email entry
  const onEmailSubmit = async (data) => {
    setIsLoading(true)
    const _email = data.email.trim().toLowerCase()
    setEmail(_email)
    try {
      const res = await authService.lookupForgotPasswordScope(_email)
      const list = res.data?.companies ?? []

      if (list.length > 1) {
        setCompanies(list)
        setStep('scope_selection')
      } else {
        // 0 companies (super admin / not found) or exactly 1 — send directly
        const cid = list.length === 1 ? list[0].company_id : null
        await authService.forgotPassword(_email, cid ? 'single' : 'auto', cid)
        setStep('submitted')
        toast.success('Reset instructions sent!')
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Step 2 → "all" path
  const onResetAll = async () => {
    setIsLoading(true)
    try {
      await authService.forgotPassword(email, 'all')
      setStep('submitted')
      toast.success('Reset instructions sent!')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Step 3: pick a company
  const onSelectCompany = async (companyId) => {
    setIsLoading(true)
    try {
      await authService.forgotPassword(email, 'single', companyId)
      setStep('submitted')
      toast.success('Reset instructions sent!')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Submitted ─────────────────────────────────────────────────────────────
  if (step === 'submitted') {
    return (
      <div className="animate-fade-in text-center">
        <div className="w-16 h-16 bg-success-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-8 h-8 text-success-500" />
        </div>
        <h2 className="text-2xl font-bold text-surface-900 mb-2">Check your email</h2>
        <p className="text-surface-500 mb-8">
          We've sent password reset instructions to your email address.
        </p>
        <Link to="/login">
          <Button variant="outline" leftIcon={<ArrowLeft className="w-4 h-4" />}>
            Back to login
          </Button>
        </Link>
      </div>
    )
  }

  // ── Company list (step 3) ─────────────────────────────────────────────────
  if (step === 'company_list') {
    return (
      <div className="animate-fade-in">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-surface-900">Select Company</h2>
          <p className="text-surface-500 mt-2">
            Choose the company whose password you want to reset.
          </p>
        </div>

        <div className="space-y-2">
          {companies.map((c) => (
            <button
              key={c.company_id}
              onClick={() => onSelectCompany(c.company_id)}
              disabled={isLoading}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-surface-200
                         bg-white hover:bg-surface-50 hover:border-accent-400 transition-colors
                         text-left disabled:opacity-50"
            >
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-accent-100 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-accent-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-surface-900 truncate">{c.company_name}</p>
                <p className="text-xs text-surface-400 capitalize">{c.user_type}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-surface-400 flex-shrink-0" />
            </button>
          ))}
        </div>

        <button
          onClick={() => setStep('scope_selection')}
          className="mt-6 inline-flex items-center gap-2 text-sm text-surface-600 hover:text-surface-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>
    )
  }

  // ── Scope selection (step 2) ──────────────────────────────────────────────
  if (step === 'scope_selection') {
    return (
      <div className="animate-fade-in">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-surface-900">Select Password Reset Scope</h2>
          <p className="text-surface-500 mt-2 text-sm">
            This email is associated with <strong>{companies.length} companies</strong>.
            Choose how you want to reset your password.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => setStep('company_list')}
            disabled={isLoading}
            className="w-full flex items-start gap-4 px-4 py-4 rounded-xl border border-surface-200
                       bg-white hover:bg-surface-50 hover:border-accent-400 transition-colors
                       text-left disabled:opacity-50"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-accent-100 flex items-center justify-center mt-0.5">
              <Building2 className="w-5 h-5 text-accent-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-surface-900">Reset for a specific company</p>
              <p className="text-sm text-surface-500 mt-0.5">
                Only the selected company's password will change. Others remain unchanged.
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-surface-400 flex-shrink-0 mt-2.5" />
          </button>

          <button
            onClick={onResetAll}
            disabled={isLoading}
            className="w-full flex items-start gap-4 px-4 py-4 rounded-xl border border-surface-200
                       bg-white hover:bg-surface-50 hover:border-accent-400 transition-colors
                       text-left disabled:opacity-50"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center mt-0.5">
              <Users className="w-5 h-5 text-primary-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-surface-900">Reset for all companies</p>
              <p className="text-sm text-surface-500 mt-0.5">
                The same new password will apply to all {companies.length} companies.
              </p>
            </div>
            {isLoading
              ? <span className="w-5 h-5 mt-2.5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
              : <ChevronRight className="w-5 h-5 text-surface-400 flex-shrink-0 mt-2.5" />
            }
          </button>
        </div>

        <button
          onClick={() => setStep('email')}
          className="mt-6 inline-flex items-center gap-2 text-sm text-surface-600 hover:text-surface-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>
    )
  }

  // ── Email form (step 1) ───────────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-surface-900">Forgot password?</h2>
        <p className="text-surface-500 mt-2">
          No worries, we'll send you reset instructions.
        </p>
      </div>

      <form onSubmit={handleSubmit(onEmailSubmit)} className="space-y-5">
        <Input
          label="Email Address"
          type="email"
          placeholder="Enter your email"
          leftIcon={<Mail className="w-4 h-4" />}
          error={errors.email?.message}
          {...register('email', {
            required: 'Email is required',
            pattern: {
              value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
              message: 'Invalid email address',
            },
          })}
        />

        <Button type="submit" isLoading={isLoading} className="w-full">
          Send Reset Link
        </Button>
      </form>

      <div className="mt-8 text-center">
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

export default ForgotPassword
