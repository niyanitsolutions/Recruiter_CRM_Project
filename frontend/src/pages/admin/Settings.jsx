import React from 'react'
import { Link } from 'react-router-dom'
import { Users, Shield, Building, Award, History, Bell, CreditCard, ChevronRight } from 'lucide-react'

const Settings = () => {
  const settingsGroups = [
    {
      title: 'User Management',
      items: [
        { icon: Users, label: 'Users', description: 'Manage user accounts and access', path: '/users' },
        { icon: Shield, label: 'Roles & Permissions', description: 'Configure roles and their permissions', path: '/roles' },
      ]
    },
    {
      title: 'Organization',
      items: [
        { icon: Building, label: 'Departments', description: 'Manage organization departments', path: '/departments' },
        { icon: Award, label: 'Designations', description: 'Manage job titles and positions', path: '/designations' },
      ]
    },
    {
      title: 'System',
      items: [
        { icon: History, label: 'Audit Logs', description: 'View system activity and changes', path: '/audit-logs' },
        { icon: Bell, label: 'Notifications', description: 'Configure notification preferences', path: '#', disabled: true, badge: 'Coming Soon' },
        { icon: CreditCard, label: 'Billing', description: 'Manage subscription and billing', path: '/billing' },
      ]
    }
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-900">Settings</h1>
        <p className="text-surface-500 mt-1">Manage your organization settings</p>
      </div>

      <div className="space-y-6">
        {settingsGroups.map(group => (
          <div key={group.title} className="bg-white rounded-xl shadow-sm border border-surface-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-100">
              <h2 className="font-semibold text-surface-900">{group.title}</h2>
            </div>
            <div className="divide-y divide-surface-100">
              {group.items.map(item => (
                <Link
                  key={item.label}
                  to={item.disabled ? '#' : item.path}
                  className={`flex items-center gap-4 px-6 py-4 transition-colors ${
                    item.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface-50'
                  }`}
                  onClick={item.disabled ? (e) => e.preventDefault() : undefined}
                >
                  <div className="p-2 bg-surface-100 rounded-lg">
                    <item.icon className="w-5 h-5 text-surface-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-surface-900">{item.label}</p>
                      {item.badge && (
                        <span className="px-2 py-0.5 bg-accent-100 text-accent-700 text-xs rounded-full">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-surface-500">{item.description}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-surface-400" />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Settings