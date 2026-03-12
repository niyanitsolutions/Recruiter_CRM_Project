import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Edit, Mail, Phone, Building, Award, Calendar, Clock, User, Shield } from 'lucide-react'
import userService from '../../services/userService'
import auditService from '../../services/auditService'

const UserDetails = () => {
  const navigate = useNavigate()
  const { id } = useParams()
  const [user, setUser] = useState(null)
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [userRes, activityRes] = await Promise.all([
          userService.getUser(id),
          auditService.getEntityHistory('user', id, { page_size: 5 })
        ])
        setUser(userRes.data)
        setActivity(activityRes.data || [])
      } catch (err) { console.error(err) }
      finally { setLoading(false) }
    }
    fetchData()
  }, [id])

  if (loading) return <div className="p-6"><div className="animate-pulse h-64 bg-surface-200 rounded-xl"></div></div>
  if (!user) return <div className="p-6"><p className="text-red-600">User not found</p></div>

  const InfoItem = ({ icon: Icon, label, value }) => (
    <div className="flex items-start gap-3 py-3 border-b border-surface-100 last:border-0">
      <Icon className="w-5 h-5 text-surface-400 mt-0.5" />
      <div>
        <p className="text-sm text-surface-500">{label}</p>
        <p className="font-medium text-surface-900">{value || '-'}</p>
      </div>
    </div>
  )

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button onClick={() => navigate('/users')} className="flex items-center gap-2 text-surface-600 hover:text-surface-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Users
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-accent-100 flex items-center justify-center text-accent-700 text-2xl font-bold">
              {user.full_name?.charAt(0)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-surface-900">{user.full_name}</h1>
              <p className="text-surface-500 capitalize">{user.role?.replace('_', ' ')}</p>
              <span className={`inline-block mt-2 px-2 py-1 rounded-full text-xs font-medium ${
                user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-surface-100 text-surface-600'
              }`}>{user.status}</span>
            </div>
          </div>
          <Link to={`/users/${id}/edit`} className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white rounded-lg">
            <Edit className="w-4 h-4" /> Edit
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
          <h2 className="text-lg font-semibold mb-4">Contact Information</h2>
          <InfoItem icon={Mail} label="Email" value={user.email} />
          <InfoItem icon={Phone} label="Mobile" value={user.mobile} />
          <InfoItem icon={User} label="Username" value={user.username} />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
          <h2 className="text-lg font-semibold mb-4">Organization</h2>
          <InfoItem icon={Shield} label="Role" value={user.role_name || user.role?.replace('_', ' ')} />
          <InfoItem icon={Building} label="Department" value={user.department} />
          <InfoItem icon={Award} label="Designation" value={user.designation} />
          <InfoItem icon={User} label="Reports To" value={user.reporting_to_name} />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
          <h2 className="text-lg font-semibold mb-4">Employment</h2>
          <InfoItem icon={Calendar} label="Joining Date" value={user.joining_date ? new Date(user.joining_date).toLocaleDateString() : '-'} />
          <InfoItem icon={User} label="Employee ID" value={user.employee_id} />
          <InfoItem icon={Clock} label="Last Login" value={user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'} />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          {activity.length > 0 ? (
            <div className="space-y-3">
              {activity.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2 py-2 border-b border-surface-100 last:border-0">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    item.action === 'create' ? 'bg-green-100 text-green-700' :
                    item.action === 'update' ? 'bg-blue-100 text-blue-700' : 'bg-surface-100'
                  }`}>{item.action_display}</span>
                  <div>
                    <p className="text-sm text-surface-700">{item.description}</p>
                    <p className="text-xs text-surface-500">{new Date(item.created_at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-surface-500 text-sm">No recent activity</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default UserDetails