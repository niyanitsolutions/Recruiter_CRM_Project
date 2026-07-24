import api from './api'

const telephonyService = {
  /** Quick status check: is telephony enabled for this tenant and which provider */
  getStatus() {
    return api.get('/telephony/status')
  },

  /** Click-to-call */
  makeCall({ to, fromNumber, candidateId, employeeId, clientId }) {
    return api.post('/telephony/calls', {
      to,
      from_number: fromNumber,
      candidate_id: candidateId,
      employee_id: employeeId,
      client_id: clientId,
    })
  },

  hangup(callId, extra) {
    return api.post(`/telephony/calls/${callId}/hangup`, { extra })
  },

  hold(callId, extra) {
    return api.post(`/telephony/calls/${callId}/hold`, { extra })
  },

  resume(callId, extra) {
    return api.post(`/telephony/calls/${callId}/resume`, { extra })
  },

  mute(callId, extra) {
    return api.post(`/telephony/calls/${callId}/mute`, { extra })
  },

  unmute(callId, extra) {
    return api.post(`/telephony/calls/${callId}/unmute`, { extra })
  },

  transfer(callId, target, extra) {
    return api.post(`/telephony/calls/${callId}/transfer`, { target, extra })
  },

  /** Capability truth table for the tenant's active provider */
  getCapabilities() {
    return api.get('/telephony/capabilities')
  },

  /** List call logs, optionally filtered by candidate/employee/client */
  listCalls({ candidateId, employeeId, clientId, limit = 50 } = {}) {
    const params = { limit }
    if (candidateId) params.candidate_id = candidateId
    if (employeeId) params.employee_id = employeeId
    if (clientId) params.client_id = clientId
    return api.get('/telephony/calls', { params })
  },

  getRecording(callId) {
    return api.get(`/telephony/calls/${callId}/recording`)
  },

  /** Calls still 'live' — used to recover in-progress call state on mount */
  getActiveCalls() {
    return api.get('/telephony/calls/active')
  },

  updateNotes(callId, notes) {
    return api.patch(`/telephony/calls/${callId}/notes`, { notes })
  },

  getDashboardStats() {
    return api.get('/telephony/dashboard/stats')
  },

  /** Read-only candidate/employee identity lookup by phone number */
  lookupCaller(phone) {
    return api.get('/telephony/lookup', { params: { phone } })
  },

  getFavorites() {
    return api.get('/telephony/favorites')
  },

  addFavorite({ phone, name, candidateId, employeeId, group }) {
    return api.post('/telephony/favorites', {
      phone, name, candidate_id: candidateId, employee_id: employeeId, group,
    })
  },

  removeFavorite(favoriteId) {
    return api.delete(`/telephony/favorites/${favoriteId}`)
  },

  getFrequentlyCalled() {
    return api.get('/telephony/favorites/frequently-called')
  },

  // ── Phase 3: dispositions ──────────────────────────────────────────────────

  getDispositions() {
    return api.get('/telephony/dispositions')
  },

  addDisposition(label) {
    return api.post('/telephony/dispositions', { label })
  },

  removeDisposition(optionId) {
    return api.delete(`/telephony/dispositions/${optionId}`)
  },

  setDisposition(callId, disposition) {
    return api.patch(`/telephony/calls/${callId}/disposition`, { disposition })
  },

  // ── Phase 3: missed calls / callback tracking ──────────────────────────────

  getMissedCalls(callbackStatus) {
    const params = callbackStatus ? { callback_status: callbackStatus } : {}
    return api.get('/telephony/calls/missed', { params })
  },

  setCallbackStatus(callId, status) {
    return api.patch(`/telephony/calls/${callId}/callback-status`, { status })
  },

  // ── Phase 3: recordings ─────────────────────────────────────────────────────

  getRecordingsLibrary(search) {
    const params = search ? { search } : {}
    return api.get('/telephony/recordings', { params })
  },

  // ── Phase 3: supervisor / analytics / agent performance ────────────────────

  getSupervisorSummary() {
    return api.get('/telephony/supervisor/summary')
  },

  getAnalytics(period = 'daily') {
    return api.get('/telephony/analytics', { params: { period } })
  },

  getAgentPerformance() {
    return api.get('/telephony/agents/performance')
  },

  // ── Phase 4: live agent presence ────────────────────────────────────────────

  getTeamPresence() {
    return api.get('/telephony/presence/team')
  },

  getOwnPresence() {
    return api.get('/telephony/presence/me')
  },

  setPresence(status) {
    return api.patch('/telephony/presence/me', { status })
  },

  // ── Phase 4: SLA / department analytics ─────────────────────────────────────

  getSlaMetrics() {
    return api.get('/telephony/sla')
  },

  getDepartmentAnalytics() {
    return api.get('/telephony/analytics/departments')
  },

  // ── Phase 4: wallboard / capability center ──────────────────────────────────

  getWallboard() {
    return api.get('/telephony/wallboard')
  },

  getCapabilityCenter() {
    return api.get('/telephony/capability-center')
  },

  // ── Phase 4: advanced telephony-only search ─────────────────────────────────

  search(q) {
    return api.get('/telephony/search', { params: { q } })
  },

  // ── Phase 4: callback queue reassignment ────────────────────────────────────

  reassignCall(callId, assignedTo) {
    return api.patch(`/telephony/calls/${callId}/reassign`, { assigned_to: assignedTo })
  },

  // ── Phase 4: recording review metadata ──────────────────────────────────────

  setRecordingReview(callId, { favorited, bookmarked, tags, comment } = {}) {
    return api.patch(`/telephony/calls/${callId}/review`, { favorited, bookmarked, tags, comment })
  },

  // ── Phase 4: queue management (capability-gated; hidden when unsupported) ──

  getQueues() {
    return api.get('/telephony/queues')
  },

  getQueueMembers(queueId) {
    return api.get(`/telephony/queues/${queueId}/members`)
  },

  // ── Phase 4: live call monitoring (capability-gated) ────────────────────────

  listenToCall(callId, extra) {
    return api.post(`/telephony/calls/${callId}/listen`, { extra })
  },

  whisperToCall(callId, extra) {
    return api.post(`/telephony/calls/${callId}/whisper`, { extra })
  },

  bargeIntoCall(callId, extra) {
    return api.post(`/telephony/calls/${callId}/barge`, { extra })
  },

  // ── Phase 4: export (blob responses — auth header only travels via the
  // shared axios instance, so these return promises, not raw URLs) ──────────

  /** CSV/PDF via the shared export module (exports:create permission) */
  exportCalls(format, { fromDate, toDate, search, status } = {}) {
    const params = { format }
    if (fromDate) params.from_date = fromDate
    if (toDate) params.to_date = toDate
    if (search) params.search = search
    if (status) params.status = status
    return api.get('/export/telephony/calls', { params, responseType: 'blob' })
  },

  exportAgentPerformance(format) {
    return api.get('/export/telephony/agent-performance', { params: { format }, responseType: 'blob' })
  },

  /** Excel export lives on the telephony router (see telephony/api/telephony.py) */
  exportCallsExcel({ fromDate, toDate, status } = {}) {
    const params = {}
    if (fromDate) params.from_date = fromDate
    if (toDate) params.to_date = toDate
    if (status) params.status = status
    return api.get('/telephony/export/calls.xlsx', { params, responseType: 'blob' })
  },
}

export default telephonyService
