import React from 'react'
import { Outlet, Link } from 'react-router-dom'

const AuthLayout = () => {
  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary-500 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="white" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#grid)"/>
          </svg>
        </div>

        {/* Floating shapes */}
        <div className="absolute top-20 left-20 w-64 h-64 bg-accent-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-white/10 rounded-full blur-3xl" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          {/* Logo */}
          <div className="flex items-center gap-4 mb-12">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center font-bold text-2xl shadow-glow">
              C
            </div>
            <div>
              <h1 className="text-2xl font-bold">CRM Platform</h1>
              <p className="text-white/60 text-sm">Recruitment & Partner Management</p>
            </div>
          </div>

          {/* Features */}
          <div className="space-y-8">
            <h2 className="text-4xl font-bold leading-tight">
              Streamline your<br />
              <span className="text-accent-400">recruitment process</span>
            </h2>
            <p className="text-lg text-white/80 max-w-md">
              A complete multi-tenant CRM solution for recruitment agencies, staffing companies, and HR departments.
            </p>

            {/* Feature list */}
            <div className="space-y-4">
              {[
                'Multi-tenant architecture with complete data isolation',
                'Role-based access control for teams',
                'Partner payout management system',
                'Comprehensive interview workflow',
              ].map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-accent-500/30 flex items-center justify-center">
                    <svg className="w-4 h-4 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-white/80">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="absolute bottom-8 left-16 right-16">
            <p className="text-white/40 text-sm">
              © 2026 CRM Platform. Built with ❤️ by Niyan IT Solutions for recruitment excellence.
            </p>
          </div>
        </div>
      </div>

      {/* Right Panel - Auth Forms */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-bold text-xl shadow-lg">
              C
            </div>
            <div>
              <h1 className="text-xl font-bold text-surface-900">CRM Platform</h1>
              <p className="text-xs text-surface-500">Recruitment & Partner Management</p>
            </div>
          </div>

          <Outlet />
        </div>
      </div>
    </div>
  )
}

export default AuthLayout