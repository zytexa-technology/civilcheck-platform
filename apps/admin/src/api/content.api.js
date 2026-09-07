import API from './axios'

// Content Control (PDF 5.4) — categories, service areas, disclaimers,
// banners. DELETE is always a soft delete (active: false) server-side —
// creating with the same business key revives an inactive row rather than
// colliding with its unique constraint.

// ─── Property Categories ───────────────────────────────────────────────────
export const listCategories = async (includeInactive = false) => {
  const response = await API.get('/admin/content/categories', { params: { includeInactive } })
  return response.data
}
export const createCategory = async (data) => {
  const response = await API.post('/admin/content/categories', data)
  return response.data
}
export const updateCategory = async (id, data) => {
  const response = await API.patch(`/admin/content/categories/${id}`, data)
  return response.data
}
export const deleteCategory = async (id) => {
  const response = await API.delete(`/admin/content/categories/${id}`)
  return response.data
}

// ─── Service Areas (city/tehsil) ────────────────────────────────────────────
export const listServiceAreas = async (includeInactive = false) => {
  const response = await API.get('/admin/content/service-areas', { params: { includeInactive } })
  return response.data
}
export const createServiceArea = async (data) => {
  const response = await API.post('/admin/content/service-areas', data)
  return response.data
}
export const updateServiceArea = async (id, data) => {
  const response = await API.patch(`/admin/content/service-areas/${id}`, data)
  return response.data
}
export const deleteServiceArea = async (id) => {
  const response = await API.delete(`/admin/content/service-areas/${id}`)
  return response.data
}

// ─── Disclaimers (versioned, PUT upserts by key) ───────────────────────────
export const listDisclaimers = async (includeInactive = false) => {
  const response = await API.get('/admin/content/disclaimers', { params: { includeInactive } })
  return response.data
}
export const upsertDisclaimer = async (data) => {
  const response = await API.put('/admin/content/disclaimers', data)
  return response.data
}

// ─── Banners ────────────────────────────────────────────────────────────────
export const listBanners = async (includeInactive = false) => {
  const response = await API.get('/admin/content/banners', { params: { includeInactive } })
  return response.data
}
export const createBanner = async (data) => {
  const response = await API.post('/admin/content/banners', data)
  return response.data
}
export const updateBanner = async (id, data) => {
  const response = await API.patch(`/admin/content/banners/${id}`, data)
  return response.data
}
export const deleteBanner = async (id) => {
  const response = await API.delete(`/admin/content/banners/${id}`)
  return response.data
}
