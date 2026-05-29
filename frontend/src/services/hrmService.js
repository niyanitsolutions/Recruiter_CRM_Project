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
const getAttendanceTodayStats = () => api.get(`${BASE}/attendance/stats/today`)
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
const getMyDocuments = () => api.get(`${BASE}/documents/me`)
const getAllDocuments = (params) => api.get(`${BASE}/documents/all`, { params })
const deleteDocument = (employeeId, docIndex) =>
  api.delete(`${BASE}/documents/${employeeId}/${docIndex}`)
const updateDocumentMeta = (employeeId, docIndex, data) =>
  api.patch(`${BASE}/documents/${employeeId}/${docIndex}`, data)

// ── Org Chart ──────────────────────────────────────────────────────────────
const getOrgChart = () => api.get(`${BASE}/employees/org-chart/tree`)

// ── Assets ─────────────────────────────────────────────────────────────────
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

// ── Sync ───────────────────────────────────────────────────────────────────
const getSyncStatus = () => api.get(`${BASE}/sync/status`)
const getSyncUnlinkedPreview = (limit = 5) => api.get(`${BASE}/sync/unlinked-preview`, { params: { limit } })
const getUnlinkedUsers = (params) => api.get(`${BASE}/sync/unlinked-users`, { params })
const getUnlinkedEmployees = (params) => api.get(`${BASE}/sync/unlinked-employees`, { params })
const syncEmployeeToUser = (employeeId, params) => api.post(`${BASE}/sync/employee-to-user/${employeeId}`, null, { params })
const syncUserToEmployee = (userId, data = null) => api.post(`${BASE}/sync/user-to-employee/${userId}`, data)
const linkUserEmployee = (userId, employeeId) => api.post(`${BASE}/sync/link`, null, { params: { user_id: userId, employee_id: employeeId } })
const unlinkUserEmployee = (userId) => api.delete(`${BASE}/sync/unlink/${userId}`)

// ── Holidays ───────────────────────────────────────────────────────────────
const listHolidays = (params) => api.get(`${BASE}/holidays`, { params })
const createHoliday = (data) => api.post(`${BASE}/holidays`, data)
const updateHoliday = (id, data) => api.put(`${BASE}/holidays/${id}`, data)
const deleteHoliday = (id) => api.delete(`${BASE}/holidays/${id}`)
const checkHoliday = (dt, dept) => api.get(`${BASE}/holidays/check/${dt}`, { params: { department: dept } })
const exportHolidaysCsv = (year) => api.get(`${BASE}/holidays/export/csv`, { params: { year }, responseType: 'blob' })
const copyHolidaysToNextYear = () => api.post(`${BASE}/holidays/copy-next-year`)
const importHolidaysCsv = (formData) => api.post(`${BASE}/holidays/import`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })

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

// ── Offer Templates ────────────────────────────────────────────────────────
const createTemplate = (data) => api.post(`${BASE}/offer-templates`, data)
const listTemplates = (params) => api.get(`${BASE}/offer-templates`, { params })
const getTemplate = (id) => api.get(`${BASE}/offer-templates/${id}`)
const updateTemplate = (id, data) => api.put(`${BASE}/offer-templates/${id}`, data)
const deleteTemplate = (id) => api.delete(`${BASE}/offer-templates/${id}`)
const generateFromTemplate = (id, data) => api.post(`${BASE}/offer-templates/${id}/generate`, data)

// ── Document Templates ─────────────────────────────────────────────────────
const DOC_TMPL = `${BASE}/document-templates`

const listDocumentTemplates   = (params) => api.get(DOC_TMPL, { params })
const createDocumentTemplate  = (data) => api.post(DOC_TMPL, data)
const getDocumentTemplate     = (id) => api.get(`${DOC_TMPL}/${id}`)
const updateDocumentTemplate  = (id, data) => api.put(`${DOC_TMPL}/${id}`, data)
const deleteDocumentTemplate  = (id) => api.delete(`${DOC_TMPL}/${id}`)
const cloneDocumentTemplate   = (id, data) => api.post(`${DOC_TMPL}/${id}/clone`, data)

const getDocumentTemplateFormFields  = (docType) =>
  api.get(`${DOC_TMPL}/schema/fields`, { params: { doc_type: docType } })
const getDocumentTemplatePlaceholders = () => api.get(`${DOC_TMPL}/schema/placeholders`)
const getDocumentTypeLabels           = () => api.get(`${DOC_TMPL}/schema/doc-types`)
const getDocumentTemplateSchema       = () => api.get(`${DOC_TMPL}/schema/all`)

// Generation
const generateFromDocumentTemplate = (id, req) => api.post(`${DOC_TMPL}/${id}/generate`, req)
const exportDocumentTemplatePDF  = (id, req) =>
  api.post(`${DOC_TMPL}/${id}/export/pdf`, req, { responseType: 'blob' })
const exportDocumentTemplateDOCX = (id, req) =>
  api.post(`${DOC_TMPL}/${id}/export/docx`, req, { responseType: 'blob' })

// Auto-fill (template-agnostic — derives fields from employee/candidate record)
const autoFillFromEmployee  = (employeeId) =>
  api.get(`${DOC_TMPL}/auto-fill/employee/${employeeId}`)
const autoFillFromCandidate = (candidateId) =>
  api.get(`${DOC_TMPL}/auto-fill/candidate/${candidateId}`)

// Version control
const getDocumentTemplateVersions       = (id) => api.get(`${DOC_TMPL}/${id}/versions`)
const restoreDocumentTemplateVersion    = (id, req) => api.post(`${DOC_TMPL}/${id}/versions/restore`, req)

// Generation history
const listDocumentGenerations = (params) => api.get(`${DOC_TMPL}/generations/history`, { params })
const getDocumentGeneration   = (genId) => api.get(`${DOC_TMPL}/generations/${genId}`)

// Content blocks
const listContentBlocks   = (category) => api.get(`${DOC_TMPL}/content-blocks`, { params: { category } })
const createContentBlock  = (data) => api.post(`${DOC_TMPL}/content-blocks`, data)
const deleteContentBlock  = (blockId) => api.delete(`${DOC_TMPL}/content-blocks/${blockId}`)

const getAnnouncements = listAnnouncements

const hrmService = {
  getDashboardStats, getAttendanceTrend,
  listEmployees, createEmployee, getEmployee, updateEmployee, deleteEmployee,
  getTeamAttendanceHistory, getMyAttendanceHistory, getAttendanceRangeStats, exportTeamAttendanceCsv, exportMyAttendanceCsv,
  checkIn, checkOut, startBreak, endBreak, getMyTodayAttendance, getTodayAttendance, getMonthlyAttendance, getTeamToday, manualAttendance,
  getAttendanceTodayStats, getAttendanceSettings, updateAttendanceSettings,
  applyLeave, listLeaves, listMyLeaves, getLeave, leaveAction, cancelLeave, getLeaveBalance, getMyLeaveBalance,
  generatePayroll, listPayslips, listOwnPayslips, getPayslip, updatePayslipStatus, deletePayslip,
  createReview, listReviews, getReview, submitSelfReview, submitManagerReview, deleteReview,
  createAnnouncement, listAnnouncements, getAnnouncement, updateAnnouncement, deleteAnnouncement,
  markAnnouncementRead, getAnnouncementReadStats,
  createJob, listJobs, getJob, updateJob, deleteJob,
  createHiringCandidate, listHiringCandidates, getHiringCandidate, updateHiringCandidate,
  createInterview, listInterviews, submitInterviewFeedback,
  createOffer, listOffers, getOffer, respondOffer,
  createOnboarding, listOnboardings, getOnboarding, updateOnboarding, completeOnboarding,
  uploadDocument, getDocuments, getMyDocuments, getAllDocuments, deleteDocument, updateDocumentMeta,
  getAnnouncements,
  getSyncStatus, getSyncUnlinkedPreview, getUnlinkedUsers, getUnlinkedEmployees,
  syncEmployeeToUser, syncUserToEmployee, linkUserEmployee, unlinkUserEmployee,
  createTemplate, listTemplates, getTemplate, updateTemplate, deleteTemplate, generateFromTemplate,
  getOrgChart,
  createAsset, getMyAssets, listAssets, getAsset, updateAsset, deleteAsset, assignAsset, returnAsset,
  createExitRequest, listExitRequests, getExitRequest, updateExitRequest, updateExitStatus,
  toggleChecklistItem, cancelExitRequest,
  listHolidays, createHoliday, updateHoliday, deleteHoliday,
  checkHoliday, exportHolidaysCsv, copyHolidaysToNextYear, importHolidaysCsv,
  listLeavePolicies, createLeavePolicy, getLeavePolicy, updateLeavePolicy, deleteLeavePolicy, seedDefaultLeavePolicies,
  listShifts, createShift, updateShift, deleteShift, seedDefaultShifts, assignShift,
  listDocumentTemplates, createDocumentTemplate, getDocumentTemplate, updateDocumentTemplate,
  deleteDocumentTemplate, cloneDocumentTemplate,
  getDocumentTemplateFormFields, getDocumentTemplatePlaceholders, getDocumentTypeLabels, getDocumentTemplateSchema,
  generateFromDocumentTemplate, exportDocumentTemplatePDF, exportDocumentTemplateDOCX,
  autoFillFromEmployee, autoFillFromCandidate,
  getDocumentTemplateVersions, restoreDocumentTemplateVersion,
  listDocumentGenerations, getDocumentGeneration,
  listContentBlocks, createContentBlock, deleteContentBlock,
}

export default hrmService
