import React, { useState, useEffect } from 'react'
import { RefreshCw, AlertTriangle, CreditCard, Building2, Bell } from 'lucide-react'
import { Button, Card } from '../../components/common'
import sellerPortalService from '../../services/sellerPortalService'
import { formatDate } from '../../utils/format'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'

const TYPE_CONFIG = {
  expiry_warning: {
    icon: AlertTriangle,
    color: 'text-warning-600',
    bg: 'bg-warning-50 border-warning-200',
    iconBg: 'bg-warning-100',
  },
  payment_received: {
    icon: CreditCard,
    color: 'text-success-600',
    bg: 'bg-success-50 border-success-200',
    iconBg: 'bg-success-100',
  },
  new_tenant: {
    icon: Building2,
    color: 'text-accent-600',
    bg: 'bg-accent-50 border-accent-200',
    iconBg: 'bg-accent-100',
  },
}

const NotificationCard = ({ notification }) => {
  const config = TYPE_CONFIG[notification.type] || {
    icon: Bell,
    color: 'text-surface-600',
    bg: 'bg-surface-50 border-surface-200',
    iconBg: 'bg-surface-100',
  }
  const Icon = config.icon

  return (
    <div className={clsx('flex items-start gap-4 p-4 rounded-xl border', config.bg)}>
      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', config.iconBg)}>
        <Icon className={clsx('w-5 h-5', config.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-surface-900">{notification.title}</p>
        <p className="text-sm text-surface-600 mt-0.5">{notification.message}</p>
        <p className="text-xs text-surface-400 mt-1">{formatDate(notification.created_at)}</p>
      </div>
    </div>
  )
}

const SellerNotifications = () => {
  const [notifications, setNotifications] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchNotifications = async () => {
    setIsLoading(true)
    try {
      const res = await sellerPortalService.getNotifications()
      setNotifications(res.data.notifications || [])
    } catch {
      toast.error('Failed to load notifications')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchNotifications() }, [])

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Notifications</h1>
          <p className="text-surface-500">Recent alerts and activity for your tenants</p>
        </div>
        <Button variant="secondary" onClick={fetchNotifications} leftIcon={<RefreshCw className="w-4 h-4" />}>
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : notifications.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-surface-400">
            <Bell className="w-12 h-12 mb-4" />
            <p className="text-lg font-medium">No notifications</p>
            <p className="text-sm mt-1">You're all caught up. New alerts will appear here.</p>
          </div>
        </Card>
      ) : (
        <Card>
          <Card.Header>
            <Card.Title>{notifications.length} notification{notifications.length !== 1 ? 's' : ''}</Card.Title>
          </Card.Header>
          <Card.Content>
            <div className="space-y-3">
              {notifications.map((n, idx) => (
                <NotificationCard key={idx} notification={n} />
              ))}
            </div>
          </Card.Content>
        </Card>
      )}
    </div>
  )
}

export default SellerNotifications
