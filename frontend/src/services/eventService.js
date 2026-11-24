import { api } from './api'

export const eventService = {
  list: (params) => api.get('/api/events', params),
  types: () => api.get('/api/events/types'),
  get: (id) => api.get(`/api/events/${id}`),
  create: (data) => api.post('/api/events', data),
  update: (id, data) => api.put(`/api/events/${id}`, data),
  setStatus: (id, status) => api.patch(`/api/events/${id}/status`, { status }),
  remove: (id) => api.del(`/api/events/${id}`),

  staff: (id) => api.get(`/api/events/${id}/staff`),
  assignStaff: (id, userId) => api.post(`/api/events/${id}/staff`, { user_id: userId }),
  unassignStaff: (id, userId) => api.del(`/api/events/${id}/staff/${userId}`),

  attendees: (id, params) => api.get(`/api/events/${id}/attendees`, params),
  addAttendee: (id, data) => api.post(`/api/events/${id}/attendees`, data),
  updateAttendee: (attendeeId, data) => api.put(`/api/attendees/${attendeeId}`, data),
  removeAttendee: (attendeeId) => api.del(`/api/attendees/${attendeeId}`),

  finance: (id) => api.get(`/api/events/${id}/finance`),
  revenue: (id) => api.get(`/api/events/${id}/revenue`),
  addRevenue: (id, data) => api.post(`/api/events/${id}/revenue`, data),
  removeRevenue: (revenueId) => api.del(`/api/revenue/${revenueId}`),
  expenses: (id) => api.get(`/api/events/${id}/expenses`),
  addExpense: (id, data) => api.post(`/api/events/${id}/expenses`, data),
  removeExpense: (expenseId) => api.del(`/api/expenses/${expenseId}`),
}

export const analyticsService = {
  dashboard: () => api.get('/api/analytics/dashboard'),
  event: (id) => api.get(`/api/analytics/events/${id}`),
  forecastVsActual: () => api.get('/api/analytics/forecast-vs-actual'),
  anomalies: (eventId) => api.get('/api/anomalies', { event_id: eventId }),
}

export const userService = {
  me: () => api.get('/api/auth/me'),
  list: (role) => api.get('/api/users', { role }),
  setRole: (id, role) => api.patch(`/api/users/${id}/role`, { role }),
  auditLogs: (limit = 100) => api.get('/api/audit-logs', { limit }),
}
