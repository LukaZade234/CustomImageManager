import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { apiClient, getImageUrl } from '../api'

export default function CharacterPage() {
  const { name } = useParams()
  const navigate = useNavigate()
  const characters = useStore((s) => s.characters)
  const savedCharacters = useStore((s) => s.savedCharacters)
  const customImages = useStore((s) => s.customImages)
  const loadCustomImages = useStore((s) => s.loadCustomImages)
  const saveCharacter = useStore((s) => s.saveCharacter)
  const removeSaved = useStore((s) => s.removeSaved)

  const char = characters.find((c) => c.name === name) || savedCharacters.find((c) => c.name === name)
  const customs = customImages[name] || []
  const isSaved = savedCharacters.some((s) => s.name === name)

  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState('')
  const [editSeries, setEditSeries] = useState('')
  const [editRank, setEditRank] = useState('')
  const [mainImage, setMainImage] = useState('')
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (char) {
      setEditName(char.name)
      setEditSeries(char.series || '')
      setEditRank(char.rank || '')
      setMainImage(char.image || '')
    }
  }, [char])

  useEffect(() => {
    loadCustomImages()
  }, [name, loadCustomImages])

  if (!char) return <div className="loading">Character not found</div>

  const handleSave = async () => {
    setLoading(true)
    try {
      await apiClient.editCharacter({ original_name: name, new_name: editName, series: editSeries, rank: editRank })
      setStatus({ type: 'success', message: 'Updated' })
      setEditMode(false)
      navigate(`/character/${encodeURIComponent(editName)}`, { replace: true })
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setLoading(false)
    }
  }

  const handleToggleSave = async () => {
    try {
      if (isSaved) await removeSaved(name)
      else await saveCharacter(char)
    } catch (err) {
      alert(err.message)
    }
  }

  const handleMainImageChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('character_name', name)
    try {
      const res = await apiClient.setMainImage(fd)
      setMainImage(res.image_url)
      setStatus({ type: 'success', message: 'Main image updated' })
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    }
  }

  const handleAddCustomImage = async (e) => {
    const files = e.target.files
    if (!files?.length) return
    const fd = new FormData()
    fd.append('character_name', name)
    for (let i = 0; i < files.length; i++) fd.append('files', files[i])
    try {
      await apiClient.addCustomImage(fd)
      await loadCustomImages()
      setStatus({ type: 'success', message: 'Images added' })
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    }
  }

  const handleDeleteCustom = async (url) => {
    try {
      await apiClient.deleteCustomImage(name, url)
      await loadCustomImages()
      setStatus({ type: 'success', message: 'Image deleted' })
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    }
  }

  return (
    <div className="character-page">
      <div className="char-info">
        {!editMode ? (
          <div>
            <h3>{char.name}</h3>
            <p>{char.series || '—'}</p>
            <p>Rank: {char.rank || '—'}</p>
            <button onClick={() => setEditMode(true)} className="btn-secondary">Edit</button>
          </div>
        ) : (
          <div className="edit-form">
            <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" />
            <input value={editSeries} onChange={(e) => setEditSeries(e.target.value)} placeholder="Series" />
            <input value={editRank} onChange={(e) => setEditRank(e.target.value)} placeholder="Rank" />
            <button onClick={handleSave} disabled={loading}>Save</button>
            <button onClick={() => setEditMode(false)}>Cancel</button>
          </div>
        )}
      </div>
      <div className="char-image-section">
        <label className="main-image-upload">
          <input type="file" accept="image/*" onChange={handleMainImageChange} style={{ display: 'none' }} />
          {mainImage ? (
            <img src={getImageUrl(mainImage)} alt={char.name} />
          ) : (
            <div className="no-image">Click or drop to set main image</div>
          )}
        </label>
        <button onClick={handleToggleSave} className={`save-btn ${isSaved ? 'saved' : ''}`} title={isSaved ? 'Unsave' : 'Save'}>
          {isSaved ? 'Saved' : 'Save'}
        </button>
      </div>
      {status && <p className={status.type === 'success' ? 'status-success' : 'status-error'}>{status.message}</p>}
      <div className="custom-images-section">
        <h4>Custom Images</h4>
        <label className="add-image-btn">
          <input type="file" accept="image/*" multiple onChange={handleAddCustomImage} style={{ display: 'none' }} />
          Add Image
        </label>
        <div className="customs-gallery">
          {customs.map((url) => (
            <div key={url} className="custom-thumb">
              <img src={url} alt="" />
              <button onClick={() => handleDeleteCustom(url)} className="delete-btn">×</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
