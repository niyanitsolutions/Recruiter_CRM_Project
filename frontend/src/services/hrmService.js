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

const hrmService = {
  getDashboardStats, getAttendanceTrend,
  listEmployees, createEmployee, getEmployee, updateEmployee, deleteEmployee,
  checkIn, checkOut, getTodayAttendance, getMonthlyAttendance, getTeamToday, manualAttendance,
  applyLeave, listLeaves, getLeave, leaveAction, getLeaveBalance,
  generatePayroll, listPayslips, getPayslip, updatePayslipStatus, deletePayslip,
  createReview, listReviews, getReview, submitSelfReview, submitManagerReview, deleteReview,
  createAnnouncement, listAnnouncements, getAnnouncement, updateAnnouncement, deleteAnnouncement,
  createJob, listJobs, getJob, updateJob, deleteJob,
  createHiringCandidate, listHiringCandidates, getHiringCandidate, updateHiringCandidate,
  createInterview, listInterviews, submitInterviewFeedback,
  createOffer, listOffers, getOffer, respondOffer,
  createOnboarding, listOnboardings, getOnboarding, updateOnboarding, completeOnboarding,
}

export default hrmService
