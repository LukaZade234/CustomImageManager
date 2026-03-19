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
      setStatus({ type: 'success', message: `Added "${name}"` })
      setName('')
      setSeries('')
      setRank('')
      setImageFile(null)
      setTimeout(() => navigate(`/character/${encodeURIComponent(name.trim())}`), 500)
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="add-page">
      <h2>Add New Character</h2>
      <form onSubmit={handleSubmit} className="add-form">
        <div className="form-group">
          <label>Character Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Saber" required />
        </div>
        <div className="form-group">
          <label>Series</label>
          <input type="text" value={series} onChange={(e) => setSeries(e.target.value)} placeholder="Series Name" />
        </div>
        <div className="form-group">
          <label>Rank (Optional)</label>
          <input type="text" value={rank} onChange={(e) => setRank(e.target.value)} placeholder="Leave blank to skip" />
        </div>
        <div className="form-group">
          <label>Main Photo (Optional)</label>
          <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
        </div>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Adding...' : 'Add Character'}
        </button>
        {status && (
          <p className={status.type === 'success' ? 'status-success' : 'status-error'}>{status.message}</p>
        )}
      </form>
    </div>
  )
}
