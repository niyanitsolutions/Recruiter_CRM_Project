import { useSelector } from 'react-redux'
import { useMemo, useCallback } from 'react'
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
  const permissions = user?.permissions || []

  // Build a set for O(1) lookup — only rebuilt when the permissions array
  // reference actually changes, not on every render of every caller.
  const permissionSet = useMemo(() => new Set(permissions), [permissions])

  /**
   * Check if user has a specific permission.
   * Owner and super admin always return true.
   */
  const has = useCallback((permission) => {
    if (!permission) return true
    if (isSuperAdmin || isOwner) return true
    return permissionSet.has(permission)
  }, [isSuperAdmin, isOwner, permissionSet])

  /**
   * Check if user has ANY of the listed permissions.
   */
  const hasAny = useCallback((...perms) => perms.some((p) => has(p)), [has])

  /**
   * Check if user has ALL of the listed permissions.
   */
  const hasAll = useCallback((...perms) => perms.every((p) => has(p)), [has])

  return useMemo(() => ({
    has,
    hasAny,
    hasAll,
    permissions,
    isAdmin: userRole === 'admin',
    isSuperAdmin,
    role: userRole,
  }), [has, hasAny, hasAll, permissions, userRole, isSuperAdmin])
}

export default usePermissions
