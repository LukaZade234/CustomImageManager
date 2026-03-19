import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../api'
import { useStore } from '../store/useStore'

export default function AddPage() {
  const [name, setName] = useState('')
  const [series, setSeries] = useState('')
  const [rank, setRank] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const loadCharacters = useStore((s) => s.loadCharacters)
  const addToast = useStore((s) => s.addToast)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setStatus(null)
    try {
      const formData = new FormData()
      formData.append('name', name.trim())
      formData.append('series', series.trim())
      formData.append('rank', rank.trim())
      if (imageFile) formData.append('image', imageFile)
      await apiClient.addCharacter(formData)
      await loadCharacters()
      addToast(`Added "${name}"`, 'success')
      setName('')
      setSeries('')
      setRank('')
      setImageFile(null)
      setTimeout(() => navigate(`/character/${encodeURIComponent(name.trim())}`), 500)
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
      addToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div id="addPage" className="add-page">
      <h2>Add New Character</h2>
      <div className="edit-form-container" style={{ maxWidth: '500px', margin: 0 }}>
        <form onSubmit={handleSubmit} className="add-char-form" style={{ maxWidth: '100%' }}>
          <div className="edit-group full-width">
            <label htmlFor="addCharName">Character Name</label>
            <input
              id="addCharName"
              type="text"
              className="modern-input"
              placeholder="e.g. Saber"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="edit-group full-width">
            <label htmlFor="addCharSeries">Series</label>
            <input
              id="addCharSeries"
              type="text"
              className="modern-input"
              placeholder="Series Name"
              value={series}
              onChange={(e) => setSeries(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="edit-group full-width">
            <label htmlFor="addCharRank">Rank (Optional)</label>
            <input
              id="addCharRank"
              type="number"
              className="modern-input"
              placeholder="Leave blank to skip"
              value={rank}
              onChange={(e) => setRank(e.target.value)}
            />
          </div>
          <div className="edit-group full-width" style={{ marginTop: '10px' }}>
            <label>Main Photo (Optional)</label>
            <div
              className="file-upload-box"
              onClick={() => document.getElementById('addCharImage')?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && document.getElementById('addCharImage')?.click()}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6c757d" strokeWidth="2" style={{ marginBottom: '8px', display: 'block' }}>
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span id="addCharImageLabel" style={{ color: '#6c757d', fontSize: '0.9em' }}>
                {imageFile ? imageFile.name : 'Click to select image (can be added later)'}
              </span>
              <input
                id="addCharImage"
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <div className="edit-actions" style={{ justifyContent: 'flex-start', marginTop: '25px' }}>
            <button type="submit" disabled={loading} className="action-btn primary">
              {loading ? 'Adding...' : 'Add Character'}
            </button>
          </div>
          {status?.type === 'error' && (
            <div id="addCharStatus" style={{ marginTop: '15px', color: '#dc3545' }}>{status.message}</div>
          )}
        </form>
      </div>
    </div>
  )
}
