import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Edit2, Building2, Mail, Phone, MapPin, Globe,
  Briefcase, Users, FileText, Calendar, AlertCircle, RefreshCw,
  CheckCircle, ChevronRight, Hash, ExternalLink, TrendingUp, Star,
  Percent, Clock,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import clientService from '../../services/clientService'
import jobService from '../../services/jobService'
import { formatDate, getInitials } from '../../utils/format'

// ── Status configs ────────────────────────────────────────────────────────────
const CLIENT_STATUS = {
  active:   { bg: 'bg-success-100', text: 'text-success-700', label: 'Active'   },
  inactive: { bg: 'bg-surface-100', text: 'text-surface-600', label: 'Inactive' },
  prospect: { bg: 'bg-yellow-100',  text: 'text-yellow-700',  label: 'Prospect' },
  blocked:  { bg: 'bg-danger-100',  text: 'text-danger-700',  label: 'Blocked'  },
}

const JOB_STATUS = {
  open:    { bg: 'bg-success-100', text: 'text-success-700' },
  draft:   { bg: 'bg-surface-100', text: 'text-surface-600' },
  on_hold: { bg: 'bg-yellow-100',  text: 'text-yellow-700'  },
  filled:  { bg: 'bg-accent-100',  text: 'text-accent-700'  },
  closed:  { bg: 'bg-danger-100',  text: 'text-danger-700'  },
}

// ── Sub-components ────────────────────────────────────────────────────────────
const InfoRow = ({ icon: Icon, label, value, href, iconColor = 'text-surface-400' }) => {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-3 border-b border-surface-100 last:border-0">
      <div className="w-8 h-8 bg-surface-50 rounded-lg flex items-center justify-center flex-shrink-0">
        <Icon className={`w-4 h-4 ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-surface-400">{label}</p>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-accent-600 hover:text-accent-700 break-words">
            {value}
          </a>
        ) : (
          <p className="text-sm font-medium text-surface-900 break-words">{value}</p>
        )}
      </div>
    </div>
  )
}

const MetricCard = ({ label, value, icon: Icon, color = 'text-surface-900', bg = 'bg-surface-50', iconBg = 'bg-surface-100' }) => (
  <div className={`${bg} border border-surface-200 rounded-xl p-4 flex items-center gap-3`}>
    <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
      <Icon className={`w-5 h-5 ${color}`} />
    </div>
    <div>
      <p className="text-xs text-surface-500 font-medium">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value ?? '—'}</p>
    </div>
  </div>
)

const SectionCard = ({ title, children, className = '' }) => (
  <div className={`bg-white border border-surface-200 rounded-xl p-5 ${className}`}>
    {title && <h3 className="text-sm font-semibold text-surface-500 uppercase tracking-wider mb-4">{title}</h3>}
    {children}
  </div>
)

const Skeleton = () => (
  <div className="p-6 max-w-7xl mx-auto animate-pulse space-y-6">
    <div className="h-8 w-48 bg-surface-200 rounded" />
    <div className="h-28 bg-surface-200 rounded-xl" />
    <div className="grid grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-surface-200 rounded-xl" />)}
    </div>
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2 h-64 bg-surface-200 rounded-xl" />
      <div className="h-64 bg-surface-200 rounded-xl" />
    </div>
  </div>
)

const TABS = [
  { id: 'overview',  label: 'Overview'       },
  { id: 'jobs',      label: 'Jobs'           },
  { id: 'contacts',  label: 'Contacts'       },
  { id: 'billing',   label: 'Billing & SLA'  },
]

// ── Main component ────────────────────────────────────────────────────────────
const ClientDetails = () => {
  const navigate = useNavigate()
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [client, setClient] = useState(null)
  const [jobs, setJobs] = useState([])
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => { load() }, [id])

  const load = async () => {
    try {
      setLoading(true)
      const clientRes = await clientService.getClient(id)
      setClient(clientRes.data)
    } catch {
      toast.error('Failed to load client')
      navigate('/clients')
      return
    } finally {
      setLoading(false)
    }
    try {
      const jobsRes = await jobService.getJobs({ client_id: id, page_size: 50 })
      setJobs(jobsRes.data || jobsRes.items || [])
    } catch { /* non-critical */ }
  }

  if (loading) return <Skeleton />
  if (!client) return (
    <div className="p-6 text-center py-24">
      <AlertCircle className="w-12 h-12 text-danger-400 mx-auto mb-3" />
      <p className="text-surface-500 font-medium">Client not found</p>
    </div>
  )

  const statusCfg   = CLIENT_STATUS[client.status] || CLIENT_STATUS.active
  const address     = [client.address, client.city, client.state, client.country].filter(Boolean).join(', ')
  const openJobs    = jobs.filter(j => j.status === 'open').length
  const filledJobs  = jobs.filter(j => j.status === 'filled').length
  const totalJobs   = jobs.length

  // ── Tab renderers ───────────────────────────────────────────────────────────
  const renderOverview = () => (
    <div className="space-y-5">
      {/* Contact details */}
      <SectionCard title="Contact Information">
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <InfoRow icon={Mail}     label="Email"    value={client.email}   href={`mailto:${client.email}`}      iconColor="text-accent-500" />
          <InfoRow icon={Phone}    label="Phone"    value={client.phone}   href={`tel:${client.phone}`}         iconColor="text-success-500" />
          <InfoRow icon={Globe}    label="Website"  value={client.website} href={client.website}                iconColor="text-blue-500" />
          <InfoRow icon={MapPin}   label="Address"  value={address}                                             iconColor="text-sky-600" />
          <InfoRow icon={Hash}     label="GSTIN"    value={client.gstin}                                        iconColor="text-surface-400" />
          <InfoRow icon={FileText} label="PAN"      value={client.pan}                                          iconColor="text-surface-400" />
        </div>
      </SectionCard>

      {/* Business info */}
      <SectionCard title="Business Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          {[
            { label: 'Client Type',    value: client.client_type },
            { label: 'Industry',       value: client.industry    },
            { label: 'Client Code',    value: client.code        },
            { label: 'Payment Terms',  value: client.payment_terms ? `${client.payment_terms} days` : null },
            { label: 'Commission',     value: client.commission_percentage ? `${client.commission_percentage}%` : null },
            { label: 'Added On',       value: formatDate(client.created_at) },
          ].filter(f => f.value).map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-2.5 border-b border-surface-100 last:border-0">
              <span className="text-sm text-surface-500">{label}</span>
              <span className="text-sm font-medium text-surface-900 capitalize">{value}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Notes */}
      {client.notes && (
        <SectionCard title="Notes">
          <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">{client.notes}</p>
        </SectionCard>
      )}
    </div>
  )

  const renderJobs = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Total Jobs" value={totalJobs}  icon={Briefcase}    color="text-surface-900"  bg="bg-surface-50"  iconBg="bg-surface-100" />
        <MetricCard label="Open"       value={openJobs}   icon={TrendingUp}   color="text-success-600"  bg="bg-success-50"  iconBg="bg-success-100" />
        <MetricCard label="Filled"     value={filledJobs} icon={CheckCircle}  color="text-accent-600"   bg="bg-accent-50"   iconBg="bg-accent-100"  />
      </div>

      {jobs.length === 0 ? (
        <div className="text-center py-16 bg-white border border-surface-200 rounded-xl">
          <Briefcase className="w-12 h-12 text-surface-300 mx-auto mb-3" />
          <p className="text-surface-500 font-medium">No jobs posted yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map(job => {
            const jCfg = JOB_STATUS[job.status] || JOB_STATUS.draft
            return (
              <Link
                key={job.id}
                to={`/jobs/view/${job.id}`}
                className="flex items-center gap-4 p-4 bg-white border border-surface-200 rounded-xl hover:border-accent-300 hover:shadow-sm transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-accent-100 flex items-center justify-center flex-shrink-0">
                  <Briefcase className="w-5 h-5 text-accent-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-surface-900 truncate">{job.title}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-surface-500">{job.job_code}</span>
                    {job.city && <span className="text-xs text-surface-400">{job.city}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-surface-500">{job.total_applications || 0} applicants</p>
                    <p className="text-xs text-surface-400">{formatDate(job.created_at)}</p>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${jCfg.bg} ${jCfg.text}`}>
                    {job.status?.replace(/_/g, ' ')}
                  </span>
                  <ChevronRight className="w-4 h-4 text-surface-300 group-hover:text-accent-500 transition-colors" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )

  const renderContacts = () => {
    const contacts = client.contact_persons || []
    return (
      <div className="space-y-4">
        {contacts.length === 0 ? (
          <div className="text-center py-16 bg-white border border-surface-200 rounded-xl">
            <Users className="w-12 h-12 text-surface-300 mx-auto mb-3" />
            <p className="text-surface-500 font-medium">No contact persons added</p>
          </div>
        ) : (
          <div className="space-y-3">
            {contacts.map((cp, i) => (
              <div key={i} className="bg-white border border-surface-200 rounded-xl p-5">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
                    {getInitials(cp.name || 'Contact')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-surface-900">{cp.name}</p>
                      {cp.is_primary && (
                        <span className="px-2 py-0.5 bg-accent-100 text-accent-700 rounded-full text-xs font-medium">Primary</span>
                      )}
                    </div>
                    {cp.designation && <p className="text-sm text-surface-500 mt-0.5">{cp.designation}</p>}
                    <div className="flex flex-wrap gap-4 mt-2">
                      {cp.email && (
                        <a href={`mailto:${cp.email}`} className="flex items-center gap-1.5 text-xs text-accent-600 hover:text-accent-700">
                          <Mail className="w-3.5 h-3.5" />{cp.email}
                        </a>
                      )}
                      {cp.mobile && (
                        <a href={`tel:${cp.mobile}`} className="flex items-center gap-1.5 text-xs text-surface-500">
                          <Phone className="w-3.5 h-3.5" />{cp.mobile}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderBilling = () => (
    <div className="space-y-5">
      <SectionCard title="Billing & Commercial">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          {[
            { label: 'Commission %',   value: client.commission_percentage ? `${client.commission_percentage}%` : null },
            { label: 'Payment Terms',  value: client.payment_terms ? `Net ${client.payment_terms} days` : null },
            { label: 'GSTIN',          value: client.gstin },
            { label: 'PAN',            value: client.pan   },
          ].filter(f => f.value).map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-2.5 border-b border-surface-100 last:border-0">
              <span className="text-sm text-surface-500">{label}</span>
              <span className="text-sm font-medium text-surface-900 font-mono">{value}</span>
            </div>
          ))}
        </div>
        {!client.commission_percentage && !client.payment_terms && !client.gstin && !client.pan && (
          <p className="text-sm text-surface-400 text-center py-4">No billing information configured</p>
        )}
      </SectionCard>

      <SectionCard title="Account Summary">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="text-center p-4 bg-surface-50 rounded-xl">
            <p className="text-2xl font-bold text-surface-900">{totalJobs}</p>
            <p className="text-xs text-surface-500 mt-0.5">Total Jobs</p>
          </div>
          <div className="text-center p-4 bg-success-50 rounded-xl">
            <p className="text-2xl font-bold text-success-600">{openJobs}</p>
            <p className="text-xs text-surface-500 mt-0.5">Open</p>
          </div>
          <div className="text-center p-4 bg-accent-50 rounded-xl">
            <p className="text-2xl font-bold text-accent-600">{filledJobs}</p>
            <p className="text-xs text-surface-500 mt-0.5">Filled</p>
          </div>
          <div className="text-center p-4 bg-teal-50 rounded-xl">
            <p className="text-2xl font-bold text-teal-600">{(client.contact_persons || []).length}</p>
            <p className="text-xs text-surface-500 mt-0.5">Contacts</p>
          </div>
        </div>
      </SectionCard>
    </div>
  )

  const tabContent = { overview: renderOverview, jobs: renderJobs, contacts: renderContacts, billing: renderBilling }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/clients')} className="p-2 hover:bg-surface-100 rounded-lg transition-colors text-surface-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-surface-400 font-medium">Clients</p>
          <h1 className="text-xl font-bold text-surface-900 truncate">{client.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 hover:bg-surface-100 rounded-lg text-surface-400">
            <RefreshCw className="w-4 h-4" />
          </button>
          <Link
            to={`/clients/${id}/edit`}
            className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </Link>
        </div>
      </div>

      {/* ── Client hero ───────────────────────────────────────────────────── */}
      <div className="bg-white border border-surface-200 rounded-xl p-6 mb-6">
        <div className="flex items-start gap-5 flex-wrap">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xl font-bold shadow-md flex-shrink-0">
            {getInitials(client.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-surface-900">{client.name}</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusCfg.bg} ${statusCfg.text}`}>
                {statusCfg.label}
              </span>
              {client.client_type && (
                <span className="px-2.5 py-0.5 bg-surface-100 text-surface-600 rounded-full text-xs font-medium capitalize">
                  {client.client_type}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2">
              {client.industry  && <span className="text-sm text-surface-500 flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{client.industry}</span>}
              {client.city      && <span className="text-sm text-surface-500 flex items-center gap-1"><MapPin    className="w-3.5 h-3.5" />{[client.city, client.state].filter(Boolean).join(', ')}</span>}
              {client.website   && <a href={client.website} target="_blank" rel="noopener noreferrer" className="text-sm text-accent-600 hover:text-accent-700 flex items-center gap-1"><Globe className="w-3.5 h-3.5" />{client.website}</a>}
              {client.code      && <span className="text-sm text-surface-400 font-mono flex items-center gap-1"><Hash className="w-3.5 h-3.5" />{client.code}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Total Jobs"  value={totalJobs}  icon={Briefcase}   color="text-surface-900"  bg="bg-surface-50"  iconBg="bg-surface-100" />
        <MetricCard label="Open Jobs"   value={openJobs}   icon={TrendingUp}  color="text-success-600"  bg="bg-success-50"  iconBg="bg-success-100" />
        <MetricCard label="Filled Jobs" value={filledJobs} icon={CheckCircle} color="text-accent-600"   bg="bg-accent-50"   iconBg="bg-accent-100"  />
        <MetricCard label="Contacts"    value={(client.contact_persons || []).length} icon={Users} color="text-teal-600" bg="bg-teal-50" iconBg="bg-teal-100" />
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-surface-200 rounded-xl mb-5 overflow-x-auto">
        <div className="flex min-w-max">
          {TABS.map((tab, i) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-accent-500 text-accent-600'
                  : 'border-transparent text-surface-500 hover:text-surface-700 hover:border-surface-300'
              } ${i === 0 ? 'rounded-tl-xl' : ''}`}
            >
              {tab.label}
              {tab.id === 'jobs' && totalJobs > 0 && (
                <span className="px-1.5 py-0.5 bg-surface-100 text-surface-600 rounded text-xs">{totalJobs}</span>
              )}
              {tab.id === 'contacts' && (client.contact_persons || []).length > 0 && (
                <span className="px-1.5 py-0.5 bg-surface-100 text-surface-600 rounded text-xs">{client.contact_persons.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────── */}
      {(tabContent[activeTab] || tabContent.overview)()}
    </div>
  )
}

export default ClientDetails
