const API_BASE = ''

function getImageUrl(imagePath) {
  if (!imagePath) return ''
  if (imagePath.startsWith('http') || imagePath.startsWith('//')) return imagePath
  return `/character_images/${imagePath}`
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, { ...options, credentials: 'same-origin' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || err.message || res.statusText)
  }
  if (res.status === 204) return null
  return res.json()
}

export const apiClient = {
  getCharacters: () => api('/api/characters'),
  getSaved: () => api('/api/saved'),
  getLastUpdated: () => api('/api/last-updated'),
  saveCharacter: (data) => api('/api/saved', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  removeSaved: (name) => api(`/api/saved/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  getCustomImages: () => api('/custom_images.json'),
  getCustomImagesForChar: (name) => api(`/api/custom-image/${encodeURIComponent(name)}`),
  addCustomImage: (formData) =>
    fetch(`${API_BASE}/api/custom-image`, { method: 'POST', body: formData, credentials: 'same-origin' }).then(async (r) => {
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        const base = j.error || 'Upload failed'
        const details = Array.isArray(j.details) && j.details.length ? ` — ${j.details.join('; ')}` : ''
        throw new Error(base + details)
      }
      // Batch partial success: server returns 200 with `errors` for skipped/failed files (e.g. too large)
      if (Array.isArray(j.errors) && j.errors.length > 0) {
        return { ...j, _partialErrors: j.errors }
      }
      return j
    }),
  deleteCustomImage: (charName, imageUrl) => api('/api/delete-custom-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ character_name: charName, image_url: imageUrl }) }),
  deleteCustomImages: (charName, imageUrls) => api('/api/delete-custom-images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ character_name: charName, image_urls: imageUrls }) }),
  reorderCustomImages: (charName, newOrder) => api('/api/reorder-custom-images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ character_name: charName, new_order: newOrder }) }),
  setMainImage: (formData) => fetch(`${API_BASE}/api/set-main-image`, { method: 'POST', body: formData, credentials: 'same-origin' }).then(r => r.ok ? r.json() : r.json().then(j => { throw new Error(j.error || 'Upload failed') })),
  editCharacter: (data) => api('/api/edit-character', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  addCharacter: (formData) => fetch(`${API_BASE}/api/add-character`, { method: 'POST', body: formData, credentials: 'same-origin' }).then(r => r.ok ? r.json() : r.json().then(j => { throw new Error(j.error || 'Failed') })),
}

export { getImageUrl }
