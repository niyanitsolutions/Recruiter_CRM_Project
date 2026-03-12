import { useSelector } from 'react-redux'
import { selectUser, selectIsSuperAdmin, selectUserRole } from '../store/authSlice'

/**
 * Hook for checking user permissions throughout the app.
 * Owner bypasses all permission checks (company-level superuser).
 * Super admin is handled at the route level separately.
 */
export const usePermissions = () => {
  const user = useSelector(selectUser)
  const isSuperAdmin = useSelector(selectIsSuperAdmin)
  const userRole = useSelector(selectUserRole)

  const isOwner = user?.isOwner

  // Build a set for O(1) lookup
  const permissionSet = new Set(user?.permissions || [])

  /**
   * Check if user has a specific permission.
   * Owner and super admin always return true.
   */
  const has = (permission) => {
    if (!permission) return true
    if (isSuperAdmin || isOwner) return true
    return permissionSet.has(permission)
  }

  /**
   * Check if user has ANY of the listed permissions.
   */
  const hasAny = (...perms) => perms.some((p) => has(p))

  /**
   * Check if user has ALL of the listed permissions.
   */
  const hasAll = (...perms) => perms.every((p) => has(p))

  return {
    has,
    hasAny,
    hasAll,
    permissions: user?.permissions || [],
    isAdmin: userRole === 'admin',
    isSuperAdmin,
    role: userRole,
  }
}

export default usePermissions
