import { api } from './api'

export const predictionService = {
  forecast: (input) => api.post('/api/predictions/forecast', input),
  attendance: (input) => api.post('/api/predictions/attendance', input),
  revenue: (input) => api.post('/api/predictions/revenue', input),
  success: (input) => api.post('/api/predictions/success', input),
  inputsForEvent: (eventId) => api.get(`/api/predictions/events/${eventId}/inputs`),
  history: (params) => api.get('/api/predictions', params),

  venue: (input) => api.post('/api/recommendations/venue', input),
  equipment: (input) => api.post('/api/recommendations/equipment', input),

  models: () => api.get('/api/models'),
  retrain: () => api.post('/api/models/retrain'),
}
