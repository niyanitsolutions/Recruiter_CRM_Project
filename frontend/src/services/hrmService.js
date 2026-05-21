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
const checkIn = (data) => api.post(`${BASE}/attendance/check-in`, data)
const checkOut = (data) => api.post(`${BASE}/attendance/check-out`, data)
const startBreak = (data) => api.post(`${BASE}/attendance/break/start`, data)
const endBreak = (data) => api.post(`${BASE}/attendance/break/end`, data)
const getTodayAttendance = (employeeId) => api.get(`${BASE}/attendance/today/${employeeId}`)
const getMonthlyAttendance = (employeeId, year, month) =>
  api.get(`${BASE}/attendance/monthly/${employeeId}`, { params: { year, month } })
const getTeamToday = () => api.get(`${BASE}/attendance/team/today`)
const manualAttendance = (data) => api.post(`${BASE}/attendance/manual`, data)

// ── Leaves ─────────────────────────────────────────────────────────────────
const applyLeave = (data) => api.post(`${BASE}/leaves`, data)
const listLeaves = (params) => api.get(`${BASE}/leaves`, { params })
const getLeave = (id) => api.get(`${BASE}/leaves/${id}`)
const leaveAction = (id, data) => api.post(`${BASE}/leaves/${id}/action`, data)
const getLeaveBalance = (employeeId, year) =>
  api.get(`${BASE}/leaves/balance/${employeeId}`, { params: { year } })

// ── Payroll ────────────────────────────────────────────────────────────────
const generatePayroll = (data) => api.post(`${BASE}/payroll/generate`, data)
const listPayslips = (params) => api.get(`${BASE}/payroll`, { params })
const getPayslip = (id) => api.get(`${BASE}/payroll/${id}`)
const updatePayslipStatus = (id, data) => api.patch(`${BASE}/payroll/${id}/status`, data)
const deletePayslip = (id) => api.delete(`${BASE}/payroll/${id}`)

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

// ── Hiring — Offers ────────────────────────────────────────────────────────
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

// ── Documents ──────────────────────────────────────────────────────────────
const uploadDocument = (employeeId, formData) =>
  api.post(`${BASE}/documents/upload/${employeeId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
const getDocuments = (employeeId) => api.get(`${BASE}/documents/${employeeId}`)
const deleteDocument = (employeeId, docIndex) =>
  api.delete(`${BASE}/documents/${employeeId}/${docIndex}`)

// ── Org Chart ──────────────────────────────────────────────────────────────
const getOrgChart = () => api.get(`${BASE}/employees/org-chart/tree`)

// ── Assets ─────────────────────────────────────────────────────────────────
const createAsset = (data) => api.post(`${BASE}/assets`, data)
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

// ── Sync ───────────────────────────────────────────────────────────────────
const getSyncStatus = () => api.get(`${BASE}/sync/status`)
const getSyncUnlinkedPreview = (limit = 5) => api.get(`${BASE}/sync/unlinked-preview`, { params: { limit } })
const getUnlinkedUsers = (params) => api.get(`${BASE}/sync/unlinked-users`, { params })
const getUnlinkedEmployees = (params) => api.get(`${BASE}/sync/unlinked-employees`, { params })
const syncEmployeeToUser = (employeeId, params) => api.post(`${BASE}/sync/employee-to-user/${employeeId}`, null, { params })
const syncUserToEmployee = (userId) => api.post(`${BASE}/sync/user-to-employee/${userId}`)
const linkUserEmployee = (userId, employeeId) => api.post(`${BASE}/sync/link`, null, { params: { user_id: userId, employee_id: employeeId } })
const unlinkUserEmployee = (userId) => api.delete(`${BASE}/sync/unlink/${userId}`)

// ── Offer Templates ────────────────────────────────────────────────────────
const createTemplate = (data) => api.post(`${BASE}/offer-templates`, data)
const listTemplates = (params) => api.get(`${BASE}/offer-templates`, { params })
const getTemplate = (id) => api.get(`${BASE}/offer-templates/${id}`)
const updateTemplate = (id, data) => api.put(`${BASE}/offer-templates/${id}`, data)
const deleteTemplate = (id) => api.delete(`${BASE}/offer-templates/${id}`)
const generateFromTemplate = (id, data) => api.post(`${BASE}/offer-templates/${id}/generate`, data)

const getAnnouncements = listAnnouncements

const hrmService = {
  getDashboardStats, getAttendanceTrend,
  listEmployees, createEmployee, getEmployee, updateEmployee, deleteEmployee,
  checkIn, checkOut, startBreak, endBreak, getTodayAttendance, getMonthlyAttendance, getTeamToday, manualAttendance,
  applyLeave, listLeaves, getLeave, leaveAction, getLeaveBalance,
  generatePayroll, listPayslips, getPayslip, updatePayslipStatus, deletePayslip,
  createReview, listReviews, getReview, submitSelfReview, submitManagerReview, deleteReview,
  createAnnouncement, listAnnouncements, getAnnouncement, updateAnnouncement, deleteAnnouncement,
  markAnnouncementRead, getAnnouncementReadStats,
  createJob, listJobs, getJob, updateJob, deleteJob,
  createHiringCandidate, listHiringCandidates, getHiringCandidate, updateHiringCandidate,
  createInterview, listInterviews, submitInterviewFeedback,
  createOffer, listOffers, getOffer, respondOffer,
  createOnboarding, listOnboardings, getOnboarding, updateOnboarding, completeOnboarding,
  uploadDocument, getDocuments, deleteDocument,
  getAnnouncements,
  getSyncStatus, getSyncUnlinkedPreview, getUnlinkedUsers, getUnlinkedEmployees,
  syncEmployeeToUser, syncUserToEmployee, linkUserEmployee, unlinkUserEmployee,
  createTemplate, listTemplates, getTemplate, updateTemplate, deleteTemplate, generateFromTemplate,
  getOrgChart,
  createAsset, listAssets, getAsset, updateAsset, deleteAsset, assignAsset, returnAsset,
  createExitRequest, listExitRequests, getExitRequest, updateExitRequest, updateExitStatus,
  toggleChecklistItem, cancelExitRequest,
}

export default hrmService
