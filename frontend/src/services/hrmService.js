import api from './api'

const BASE = '/hrm'

// ── Dashboard ──────────────────────────────────────────────────────────────
const getDashboardStats = () => api.get(`${BASE}/dashboard/stats`)
const getAttendanceTrend = (days = 7) => api.get(`${BASE}/dashboard/attendance-trend`, { params: { days } })

// ── Employees ──────────────────────────────────────────────────────────────
const listEmployees = (params) => api.get(`${BASE}/employees`, { params })
const createEmployee = (data) => api.post(`${BASE}/employees`, data)
const getEmployee = (id) => api.get(`${BASE}/employees/${id}`)
const updateEmployee = (id, data) => api.put(`${BASE}/employees/${id}`, data)
const deleteEmployee = (id) => api.delete(`${BASE}/employees/${id}`)

// ── Attendance ─────────────────────────────────────────────────────────────
// History & export — date strings must be YYYY-MM-DD
const getTeamAttendanceHistory  = (params) => api.get(`${BASE}/attendance/history`,        { params })
const getMyAttendanceHistory    = (params) => api.get(`${BASE}/attendance/me/history`,     { params })
const getAttendanceRangeStats   = (params) => api.get(`${BASE}/attendance/stats/range`,    { params })
const exportTeamAttendanceCsv   = (params) => api.get(`${BASE}/attendance/export/csv`,     { params, responseType: 'blob' })
const exportMyAttendanceCsv     = (params) => api.get(`${BASE}/attendance/me/export/csv`,  { params, responseType: 'blob' })

const checkIn = (data) => api.post(`${BASE}/attendance/check-in`, data)
const checkOut = (data) => api.post(`${BASE}/attendance/check-out`, data)
const startBreak = (data) => api.post(`${BASE}/attendance/break/start`, data)
const endBreak = (data) => api.post(`${BASE}/attendance/break/end`, data)
// Self-service: returns { employee_id, ...record } or null (no employee profile)
const getMyTodayAttendance = () => api.get(`${BASE}/attendance/me/today`)
const getTodayAttendance = (employeeId) => api.get(`${BASE}/attendance/today/${employeeId}`)
const getMonthlyAttendance = (employeeId, year, month) =>
  api.get(`${BASE}/attendance/monthly/${employeeId}`, { params: { year, month } })
const getTeamToday = () => api.get(`${BASE}/attendance/team/today`)
const manualAttendance = (data) => api.post(`${BASE}/attendance/manual`, data)
const recoverAttendance = (attendanceId, data) => api.post(`${BASE}/attendance/${attendanceId}/recover`, data)
const getAttendanceTodayStats = (params) => api.get(`${BASE}/attendance/stats/today`, { params })
const getAttendanceSettings = () => api.get(`${BASE}/attendance/settings`)
const updateAttendanceSettings = (data) => api.put(`${BASE}/attendance/settings`, data)

// ── Leaves ─────────────────────────────────────────────────────────────────
const applyLeave = (data) => api.post(`${BASE}/leaves`, data)
const listLeaves = (params) => api.get(`${BASE}/leaves`, { params })
const listMyLeaves = (params) => api.get(`${BASE}/leaves/me`, { params })
const getLeave = (id) => api.get(`${BASE}/leaves/${id}`)
const leaveAction = (id, data) => api.post(`${BASE}/leaves/${id}/action`, data)
const cancelLeave = (id) => api.post(`${BASE}/leaves/${id}/cancel`)
const getLeaveBalance = (employeeId, year) =>
  api.get(`${BASE}/leaves/balance/${employeeId}`, { params: { year } })
const getMyLeaveBalance = (year) =>
  api.get(`${BASE}/leaves/balance/me`, { params: { year } })

// ── Payroll ────────────────────────────────────────────────────────────────
const generatePayroll = (data) => api.post(`${BASE}/payroll/generate`, data)
const listPayslips = (params) => api.get(`${BASE}/payroll`, { params })
const listOwnPayslips = (params) => api.get(`${BASE}/payroll/self`, { params })
const getPayslip = (id) => api.get(`${BASE}/payroll/${id}`)
const updatePayslipStatus = (id, data) => api.patch(`${BASE}/payroll/${id}/status`, data)
const updatePayslip = (id, data) => api.patch(`${BASE}/payroll/${id}`, data)
const deletePayslip = (id) => api.delete(`${BASE}/payroll/${id}`)
const getPayrollStructure = () => api.get(`${BASE}/payroll/structure`)
const updatePayrollStructure = (data) => api.put(`${BASE}/payroll/structure`, data)

// ── Performance ────────────────────────────────────────────────────────────
const createReview = (data) => api.post(`${BASE}/performance`, data)
const listReviews = (params) => api.get(`${BASE}/performance`, { params })
const getReview = (id) => api.get(`${BASE}/performance/${id}`)
const submitSelfReview = (id, data) => api.post(`${BASE}/performance/${id}/self-review`, data)
const submitManagerReview = (id, data) => api.post(`${BASE}/performance/${id}/manager-review`, data)
const deleteReview = (id) => api.delete(`${BASE}/performance/${id}`)

// ── Announcements ──────────────────────────────────────────────────────────
const createAnnouncement = (data) => api.post(`${BASE}/announcements`, data)
const listAnnouncements = (params) => api.get(`${BASE}/announcements`, { params })
const getAnnouncement = (id) => api.get(`${BASE}/announcements/${id}`)
const updateAnnouncement = (id, data) => api.put(`${BASE}/announcements/${id}`, data)
const deleteAnnouncement = (id) => api.delete(`${BASE}/announcements/${id}`)
const markAnnouncementRead = (id) => api.post(`${BASE}/announcements/${id}/read`)
const getAnnouncementReadStats = (id) => api.get(`${BASE}/announcements/${id}/read-stats`)

// ── Hiring — Jobs ──────────────────────────────────────────────────────────
const createJob = (data) => api.post(`${BASE}/hiring/jobs`, data)
const listJobs = (params) => api.get(`${BASE}/hiring/jobs`, { params })
const getJob = (id) => api.get(`${BASE}/hiring/jobs/${id}`)
const updateJob = (id, data) => api.put(`${BASE}/hiring/jobs/${id}`, data)
const deleteJob = (id) => api.delete(`${BASE}/hiring/jobs/${id}`)

// ── Hiring — Candidates ────────────────────────────────────────────────────
const createHiringCandidate = (data) => api.post(`${BASE}/hiring/candidates`, data)
const listHiringCandidates = (params) => api.get(`${BASE}/hiring/candidates`, { params })
const getHiringCandidate = (id) => api.get(`${BASE}/hiring/candidates/${id}`)
const updateHiringCandidate = (id, data) => api.put(`${BASE}/hiring/candidates/${id}`, data)

// ── Hiring — Interviews ────────────────────────────────────────────────────
const createInterview = (data) => api.post(`${BASE}/hiring/interviews`, data)
const listInterviews = (params) => api.get(`${BASE}/hiring/interviews`, { params })
const submitInterviewFeedback = (id, data) => api.post(`${BASE}/hiring/interviews/${id}/feedback`, data)

// ── Hiring — Offers ──────────────────────────────────────────────────────────
const createOffer = (data) => api.post(`${BASE}/hiring/offers`, data)
const listOffers = (params) => api.get(`${BASE}/hiring/offers`, { params })
const getOffer = (id) => api.get(`${BASE}/hiring/offers/${id}`)
const respondOffer = (id, data) => api.post(`${BASE}/hiring/offers/${id}/respond`, data)

// ── Hiring — Onboarding ────────────────────────────────────────────────────
const createOnboarding = (data) => api.post(`${BASE}/hiring/onboarding`, data)
const listOnboardings = (params) => api.get(`${BASE}/hiring/onboarding`, { params })
const getOnboarding = (id) => api.get(`${BASE}/hiring/onboarding/${id}`)
const updateOnboarding = (id, data) => api.put(`${BASE}/hiring/onboarding/${id}`, data)
const completeOnboarding = (id) => api.post(`${BASE}/hiring/onboarding/${id}/complete`)

// ── Hiring — Public Apply Link & Invitations ────────────────────────────────
const getJobPublicLink = (jobId, frontendBaseUrl) =>
  api.post(`${BASE}/hiring/jobs/${jobId}/public-link`, { frontend_base_url: frontendBaseUrl })
const sendApplicationInvitation = (data) => api.post(`${BASE}/hiring/invitations`, data)
const listInvitations = (params) => api.get(`${BASE}/hiring/invitations`, { params })

// ── Documents ──────────────────────────────────────────────────────────────
const uploadDocument = (employeeId, formData) =>
  api.post(`${BASE}/documents/upload/${employeeId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
const multiUploadDocuments = (employeeId, formData) =>
  api.post(`${BASE}/documents/multi-upload/${employeeId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  })
const getDocuments = (employeeId) => api.get(`${BASE}/documents/${employeeId}`)
const getMyDocuments = () => api.get(`${BASE}/documents/me`)
const getAllDocuments = (params) => api.get(`${BASE}/documents/all`, { params })
const getEmployeeDocumentCounts = (params) => api.get(`${BASE}/documents/employee-counts`, { params })
const deleteDocument = (employeeId, docId) =>
  api.delete(`${BASE}/documents/${employeeId}/${docId}`)
const updateDocumentMeta = (employeeId, docId, data) =>
  api.patch(`${BASE}/documents/${employeeId}/${docId}/meta`, data)
const updateDocumentStatus = (employeeId, docId, data) =>
  api.patch(`${BASE}/documents/${employeeId}/${docId}/status`, data)
const getDocumentServeUrl = (employeeId, docId, download = false) => {
  const base = `${import.meta.env.VITE_API_URL || '/api/v1'}/hrm/documents/serve/${employeeId}/${docId}`
  const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || ''
  const params = new URLSearchParams()
  if (token) params.set('token', token)
  if (download) params.set('download', 'true')
  return params.toString() ? `${base}?${params}` : base
}

// ── Employee Photo ─────────────────────────────────────────────────────────
const uploadEmployeePhoto = (employeeId, formData) =>
  api.post(`${BASE}/employees/${employeeId}/photo`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
const deleteEmployeePhoto = (employeeId) =>
  api.delete(`${BASE}/employees/${employeeId}/photo`)

// ── Org Chart ──────────────────────────────────────────────────────────────
const getOrgChart = () => api.get(`${BASE}/employees/org-chart/tree`)

// ── Doc Upload Tokens ──────────────────────────────────────────────────────
const generateDocUploadToken = (data) => api.post(`${BASE}/doc-upload-tokens`, data)
const listDocUploadTokens = (params) => api.get(`${BASE}/doc-upload-tokens`, { params })
const reactivateDocUploadToken = (id, data) => api.post(`${BASE}/doc-upload-tokens/${id}/reactivate`, data)
const revokeDocUploadToken = (id) => api.delete(`${BASE}/doc-upload-tokens/${id}`)
const validateDocUploadToken = (token) => api.get(`${BASE}/doc-upload-tokens/validate/${token}`)
const uploadViaToken = (token, formData) =>
  api.post(`${BASE}/doc-upload-tokens/upload/${token}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  })

// ── Assets ─────────────────────────────────────────────────────────────────
const getAssetByPublicToken = (token) => api.get(`${BASE}/assets/public/${token}`)
const createAsset = (data) => api.post(`${BASE}/assets`, data)
const getMyAssets = () => api.get(`${BASE}/assets/me`)
const listAssets = (params) => api.get(`${BASE}/assets`, { params })
const getAsset = (id) => api.get(`${BASE}/assets/${id}`)
const updateAsset = (id, data) => api.put(`${BASE}/assets/${id}`, data)
const deleteAsset = (id) => api.delete(`${BASE}/assets/${id}`)
const assignAsset = (id, data) => api.post(`${BASE}/assets/${id}/assign`, data)
const returnAsset = (id, data) => api.post(`${BASE}/assets/${id}/return`, data)

// ── Exit Management ────────────────────────────────────────────────────────
const createExitRequest = (data) => api.post(`${BASE}/exit`, data)
const listExitRequests = (params) => api.get(`${BASE}/exit`, { params })
const getExitRequest = (id) => api.get(`${BASE}/exit/${id}`)
const updateExitRequest = (id, data) => api.put(`${BASE}/exit/${id}`, data)
const updateExitStatus = (id, data) => api.post(`${BASE}/exit/${id}/status`, data)
const toggleChecklistItem = (id, index) => api.post(`${BASE}/exit/${id}/checklist/${index}`)
const cancelExitRequest = (id) => api.delete(`${BASE}/exit/${id}`)

// ── Work Mode Requests ─────────────────────────────────────────────────────
const submitWorkModeRequest    = (data) => api.post(`${BASE}/work-mode/requests`, data)
const listMyWorkModeRequests   = (params) => api.get(`${BASE}/work-mode/requests/me`, { params })
const cancelWorkModeRequest    = (id) => api.post(`${BASE}/work-mode/requests/${id}/cancel`)
const getMyActiveWorkMode      = () => api.get(`${BASE}/work-mode/me/active`)
const listWorkModeRequests     = (params) => api.get(`${BASE}/work-mode/requests`, { params })
const approveWorkModeRequest   = (id) => api.post(`${BASE}/work-mode/requests/${id}/approve`)
const rejectWorkModeRequest    = (id, data) => api.post(`${BASE}/work-mode/requests/${id}/reject`, data)

// ── Attendance Exceptions ──────────────────────────────────────────────────
const createAttendanceException  = (data) => api.post(`${BASE}/attendance/exceptions`, data)
const listAttendanceExceptions   = (params) => api.get(`${BASE}/attendance/exceptions`, { params })
const updateAttendanceException  = (id, data) => api.put(`${BASE}/attendance/exceptions/${id}`, data)
const deleteAttendanceException  = (id) => api.delete(`${BASE}/attendance/exceptions/${id}`)
const checkActiveException       = (employeeId) => api.get(`${BASE}/attendance/exceptions/check/${employeeId}`)

// ── Sync ───────────────────────────────────────────────────────────────────
const getSyncStatus = () => api.get(`${BASE}/sync/status`)
const getSyncUnlinkedPreview = (limit = 5) => api.get(`${BASE}/sync/unlinked-preview`, { params: { limit } })
const getUnlinkedUsers = (params) => api.get(`${BASE}/sync/unlinked-users`, { params })
const getUnlinkedEmployees = (params) => api.get(`${BASE}/sync/unlinked-employees`, { params })
const syncEmployeeToUser = (employeeId, params) => api.post(`${BASE}/sync/employee-to-user/${employeeId}`, null, { params })
const syncUserToEmployee = (userId, data = null) => api.post(`${BASE}/sync/user-to-employee/${userId}`, data)
const linkUserEmployee = (userId, employeeId) => api.post(`${BASE}/sync/link`, null, { params: { user_id: userId, employee_id: employeeId } })
const unlinkUserEmployee = (userId) => api.delete(`${BASE}/sync/unlink/${userId}`)
const runMigration = () => api.post(`${BASE}/sync/migrate`)

// ── Holidays ───────────────────────────────────────────────────────────────
const listHolidays = (params) => api.get(`${BASE}/holidays`, { params })
const createHoliday = (data) => api.post(`${BASE}/holidays`, data)
const updateHoliday = (id, data) => api.put(`${BASE}/holidays/${id}`, data)
const deleteHoliday = (id) => api.delete(`${BASE}/holidays/${id}`)
const checkHoliday = (dt, dept) => api.get(`${BASE}/holidays/check/${dt}`, { params: { department: dept } })
const exportHolidaysCsv = (year) => api.get(`${BASE}/holidays/export/csv`, { params: { year }, responseType: 'blob' })
const copyHolidaysToNextYear = () => api.post(`${BASE}/holidays/copy-next-year`)
const importHolidaysCsv = (formData) => api.post(`${BASE}/holidays/import`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })

// ── Company Calendar ─────────────────────────────────────────────────────────
const getCalendarEvents = (from, to) => api.get(`${BASE}/calendar/events`, { params: { from, to } })

// ── Leave Policies ─────────────────────────────────────────────────────────
const listLeavePolicies = (params) => api.get(`${BASE}/leave-policies`, { params })
const createLeavePolicy = (data) => api.post(`${BASE}/leave-policies`, data)
const getLeavePolicy = (id) => api.get(`${BASE}/leave-policies/${id}`)
const updateLeavePolicy = (id, data) => api.put(`${BASE}/leave-policies/${id}`, data)
const deleteLeavePolicy = (id) => api.delete(`${BASE}/leave-policies/${id}`)
const seedDefaultLeavePolicies = () => api.post(`${BASE}/leave-policies/seed-defaults`)

// ── Shifts ─────────────────────────────────────────────────────────────────
const listShifts = (params) => api.get(`${BASE}/shifts`, { params })
const createShift = (data) => api.post(`${BASE}/shifts`, data)
const updateShift = (id, data) => api.put(`${BASE}/shifts/${id}`, data)
const deleteShift = (id) => api.delete(`${BASE}/shifts/${id}`)
const seedDefaultShifts = () => api.post(`${BASE}/shifts/seed-defaults`)
const assignShift = (data) => api.post(`${BASE}/shifts/assign`, data)

// ── Shift Assignments (Phase 5) ────────────────────────────────────────────────
const createShiftAssignment      = (data) => api.post(`${BASE}/shifts/assignments`, data)
const listShiftAssignments       = (params) => api.get(`${BASE}/shifts/assignments`, { params })
const listMyShiftAssignments     = (params) => api.get(`${BASE}/shifts/assignments/me`, { params })
const updateShiftAssignment      = (id, data) => api.put(`${BASE}/shifts/assignments/${id}`, data)
const deleteShiftAssignment      = (id) => api.delete(`${BASE}/shifts/assignments/${id}`)
const getActiveShiftAssignment   = (employeeId, params) => api.get(`${BASE}/shifts/assignments/active/${employeeId}`, { params })

// ── Shift Change Requests (Phase 7) ───────────────────────────────────────────
const submitShiftChangeRequest   = (data) => api.post(`${BASE}/shifts/change-requests`, data)
const listMyShiftChangeRequests  = (params) => api.get(`${BASE}/shifts/change-requests/me`, { params })
const cancelShiftChangeRequest   = (id) => api.post(`${BASE}/shifts/change-requests/${id}/cancel`)
const listShiftChangeRequests    = (params) => api.get(`${BASE}/shifts/change-requests`, { params })
const approveShiftChangeRequest  = (id) => api.post(`${BASE}/shifts/change-requests/${id}/approve`)
const rejectShiftChangeRequest   = (id, data) => api.post(`${BASE}/shifts/change-requests/${id}/reject`, data)

// ── Comp Off Credits (Phase 4) ────────────────────────────────────────────────
const getMyCompOff               = () => api.get(`${BASE}/attendance/comp-off/me`)
const getEmployeeCompOff         = (employeeId) => api.get(`${BASE}/attendance/comp-off/${employeeId}`)

// ── Employee Onboarding Links ──────────────────────────────────────────────────
const generateOnboardingLink = (data) => api.post(`${BASE}/employees/generate-onboarding-link`, data)

// ── Employee Export ────────────────────────────────────────────────────────────
const exportEmployees = (params) => api.get(`${BASE}/employees/export`, { params, responseType: 'blob' })

const getAnnouncements = listAnnouncements

const hrmService = {
  getDashboardStats, getAttendanceTrend,
  listEmployees, createEmployee, getEmployee, updateEmployee, deleteEmployee, uploadEmployeePhoto, deleteEmployeePhoto,
  getTeamAttendanceHistory, getMyAttendanceHistory, getAttendanceRangeStats, exportTeamAttendanceCsv, exportMyAttendanceCsv,
  checkIn, checkOut, startBreak, endBreak, getMyTodayAttendance, getTodayAttendance, getMonthlyAttendance, getTeamToday, manualAttendance, recoverAttendance,
  getAttendanceTodayStats, getAttendanceSettings, updateAttendanceSettings,
  submitWorkModeRequest, listMyWorkModeRequests, cancelWorkModeRequest, getMyActiveWorkMode,
  listWorkModeRequests, approveWorkModeRequest, rejectWorkModeRequest,
  createAttendanceException, listAttendanceExceptions, updateAttendanceException,
  deleteAttendanceException, checkActiveException,
  applyLeave, listLeaves, listMyLeaves, getLeave, leaveAction, cancelLeave, getLeaveBalance, getMyLeaveBalance,
  generatePayroll, listPayslips, listOwnPayslips, getPayslip, updatePayslipStatus, updatePayslip, deletePayslip, getPayrollStructure, updatePayrollStructure,
  createReview, listReviews, getReview, submitSelfReview, submitManagerReview, deleteReview,
  createAnnouncement, listAnnouncements, getAnnouncement, updateAnnouncement, deleteAnnouncement,
  markAnnouncementRead, getAnnouncementReadStats,
  createJob, listJobs, getJob, updateJob, deleteJob,
  createHiringCandidate, listHiringCandidates, getHiringCandidate, updateHiringCandidate,
  createInterview, listInterviews, submitInterviewFeedback,
  createOffer, listOffers, getOffer, respondOffer,
  createOnboarding, listOnboardings, getOnboarding, updateOnboarding, completeOnboarding,
  getJobPublicLink, sendApplicationInvitation, listInvitations,
  uploadDocument, multiUploadDocuments, getDocuments, getMyDocuments, getAllDocuments,
  getEmployeeDocumentCounts, deleteDocument, updateDocumentMeta, updateDocumentStatus, getDocumentServeUrl,
  getAnnouncements,
  getSyncStatus, getSyncUnlinkedPreview, getUnlinkedUsers, getUnlinkedEmployees,
  syncEmployeeToUser, syncUserToEmployee, linkUserEmployee, unlinkUserEmployee, runMigration,
  getOrgChart,
  generateDocUploadToken, listDocUploadTokens, reactivateDocUploadToken, revokeDocUploadToken,
  validateDocUploadToken, uploadViaToken,
  getAssetByPublicToken,
  createAsset, getMyAssets, listAssets, getAsset, updateAsset, deleteAsset, assignAsset, returnAsset,
  createExitRequest, listExitRequests, getExitRequest, updateExitRequest, updateExitStatus,
  toggleChecklistItem, cancelExitRequest,
  listHolidays, createHoliday, updateHoliday, deleteHoliday,
  checkHoliday, exportHolidaysCsv, copyHolidaysToNextYear, importHolidaysCsv,
  getCalendarEvents,
  listLeavePolicies, createLeavePolicy, getLeavePolicy, updateLeavePolicy, deleteLeavePolicy, seedDefaultLeavePolicies,
  listShifts, createShift, updateShift, deleteShift, seedDefaultShifts, assignShift,
  createShiftAssignment, listShiftAssignments, listMyShiftAssignments,
  updateShiftAssignment, deleteShiftAssignment, getActiveShiftAssignment,
  submitShiftChangeRequest, listMyShiftChangeRequests, cancelShiftChangeRequest,
  listShiftChangeRequests, approveShiftChangeRequest, rejectShiftChangeRequest,
  getMyCompOff, getEmployeeCompOff,
  generateOnboardingLink, exportEmployees,
}

export default hrmService
