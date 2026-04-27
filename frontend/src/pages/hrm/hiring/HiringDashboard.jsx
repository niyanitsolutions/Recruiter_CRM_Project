import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Briefcase, Users, Calendar, FileText, UserCheck, ArrowRight } from 'lucide-react'
import hrmService from '../../../services/hrmService'

export default function HiringDashboard() {
  const [jobs, setJobs]   = useState({ total: 0 })
  const [cands, setCands] = useState({ total: 0 })
  const [ints, setInts]   = useState({ total: 0 })
  const [offers, setOffers] = useState({ total: 0 })
  const [onbs, setOnbs]   = useState({ total: 0 })

  useEffect(() => {
    Promise.all([
      hrmService.listJobs({ page: 1, page_size: 1, status: 'open' }),
      hrmService.listHiringCandidates({ page: 1, page_size: 1 }),
      hrmService.listInterviews({ page: 1, page_size: 1 }),
      hrmService.listOffers({ page: 1, page_size: 1 }),
      hrmService.listOnboardings({ page: 1, page_size: 1 }),
    ]).then(([j, c, i, o, ob]) => {
      setJobs({ total: j.data.total })
      setCands({ total: c.data.total })
      setInts({ total: i.data.total })
      setOffers({ total: o.data.total })
      setOnbs({ total: ob.data.total })
    }).catch(() => {})
  }, [])

  const steps = [
    { label: 'Open Jobs',    count: jobs.total,   icon: Briefcase,  to: '/hrm/hiring/jobs',       color: 'blue' },
    { label: 'Candidates',   count: cands.total,  icon: Users,      to: '/hrm/hiring/candidates', color: 'indigo' },
    { label: 'Interviews',   count: ints.total,   icon: Calendar,   to: '/hrm/hiring/interviews', color: 'purple' },
    { label: 'Offers',       count: offers.total, icon: FileText,   to: '/hrm/hiring/offers',     color: 'yellow' },
    { label: 'Onboarding',   count: onbs.total,   icon: UserCheck,  to: '/hrm/hiring/onboarding', color: 'green' },
  ]

  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
    yellow: 'bg-yellow-50 text-yellow-600 border-yellow-200',
    green: 'bg-green-50 text-green-600 border-green-200',
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Hiring Pipeline</h1>
        <p className="text-sm text-gray-500">Full cycle recruitment management</p>
      </div>

      <div className="flex items-stretch gap-2 overflow-x-auto pb-2">
        {steps.map((step, i) => (
          <React.Fragment key={step.label}>
            <Link to={step.to} className={`flex-1 min-w-36 bg-white rounded-xl border p-5 hover:shadow-md transition-shadow ${colors[step.color]}`}>
              <step.icon className="w-6 h-6 mb-3" />
              <p className="text-3xl font-bold text-gray-900">{step.count}</p>
              <p className="text-sm font-medium mt-1">{step.label}</p>
            </Link>
            {i < steps.length - 1 && (
              <div className="flex items-center text-gray-300 flex-shrink-0">
                <ArrowRight className="w-5 h-5" />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {steps.map(step => (
          <Link key={step.label} to={step.to} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow flex items-center gap-3">
            <step.icon className="w-5 h-5 text-blue-500" />
            <span className="text-sm font-medium text-gray-700">Manage {step.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
