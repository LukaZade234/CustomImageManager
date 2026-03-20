import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { apiClient, getImageUrl } from '../api'
import ImageModal from '../components/ImageModal'

export default function CharacterPage() {
  const { name } = useParams()
  const navigate = useNavigate()
  const characters = useStore((s) => s.characters)
  const savedCharacters = useStore((s) => s.savedCharacters)
  const customImages = useStore((s) => s.customImages)
  const loadCustomImages = useStore((s) => s.loadCustomImages)
  const loadCharacters = useStore((s) => s.loadCharacters)
  const saveCharacter = useStore((s) => s.saveCharacter)
  const removeSaved = useStore((s) => s.removeSaved)
  const addToast = useStore((s) => s.addToast)

  const char = characters.find((c) => c.name === name) || savedCharacters.find((c) => c.name === name)
  const customs = customImages[name] || []
  const isSaved = savedCharacters.some((s) => s.name === name)

  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState('')
  const [editSeries, setEditSeries] = useState('')
  const [editRank, setEditRank] = useState('')
  const [mainImage, setMainImage] = useState('')
  const [loading, setLoading] = useState(false)
  const [aiMode, setAiMode] = useState(false)
  const [deleteMode, setDeleteMode] = useState(false)
  const [reorderMode, setReorderMode] = useState(false)
  const [selectedUrls, setSelectedUrls] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [modalIndex, setModalIndex] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [customDragOver, setCustomDragOver] = useState(false)
  const [customUploadProgress, setCustomUploadProgress] = useState(null)
  const customUploadLockRef = useRef(false)
  const mainInputRef = useRef(null)
  const customInputRef = useRef(null)
  const dragItemRef = useRef(null)
  const dragOverRef = useRef(null)

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

  const resetModes = useCallback(() => {
    setAiMode(false)
    setDeleteMode(false)
    setReorderMode(false)
    setSelectedUrls([])
  }, [])

  if (!char) return <div className="loading">Character not found</div>

  const handleSaveEdit = async () => {
    setLoading(true)
    try {
      await apiClient.editCharacter({ original_name: name, new_name: editName, series: editSeries, rank: editRank })
      await loadCharacters()
      addToast('Character updated', 'success')
      setEditMode(false)
      navigate(`/character/${encodeURIComponent(editName)}`, { replace: true })
    } catch (err) {
      addToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleSave = async () => {
    try {
      if (isSaved) {
        await removeSaved(name)
        addToast('Removed from saved', 'success')
      } else {
        await saveCharacter(char)
        addToast('Saved character', 'success')
      }
    } catch (err) {
      addToast(err.message, 'error')
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
      addToast('Main image updated', 'success')
    } catch (err) {
      addToast(err.message, 'error')
    }
  }

  const handleMainImageDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file?.type.startsWith('image/')) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('character_name', name)
    apiClient.setMainImage(fd).then((res) => {
      setMainImage(res.image_url)
      addToast('Main image updated', 'success')
    }).catch((err) => addToast(err.message, 'error'))
  }

  const runCustomUpload = async (fileList) => {
    const list = Array.from(fileList).filter((f) => f.type.startsWith('image/'))
    if (!list.length) {
      addToast('No image files to upload', 'error')
      return
    }
    if (customUploadLockRef.current) {
      addToast('An upload is already in progress', 'info')
      return
    }
    customUploadLockRef.current = true
    const total = list.length
    setCustomUploadProgress({ phase: 'starting', current: 0, total })
    addToast(`Starting upload of ${total} image${total !== 1 ? 's' : ''}…`, 'info')

    const errors = []
    try {
      for (let i = 0; i < list.length; i++) {
        setCustomUploadProgress({ phase: 'uploading', current: i + 1, total, fileName: list[i].name })
        try {
          const fd = new FormData()
          fd.append('character_name', name)
          fd.append('files', list[i])
          await apiClient.addCustomImage(fd)
          await loadCustomImages()
        } catch (err) {
          errors.push({ name: list[i].name, message: err.message || 'Upload failed' })
        }
      }

      const ok = total - errors.length
      if (ok === total) {
        addToast(`${ok} image${ok !== 1 ? 's' : ''} uploaded successfully.`, 'success')
      } else if (ok > 0) {
        addToast(
          `Uploaded ${ok} of ${total}. Failed: ${errors.map((e) => `${e.name} (${e.message})`).join('; ')}`,
          'error'
        )
      } else {
        addToast(
          `Upload failed for all ${total} image${total !== 1 ? 's' : ''}: ${errors.map((e) => `${e.name}: ${e.message}`).join('; ')}`,
          'error'
        )
      }
    } catch (err) {
      addToast(`Upload stopped: ${err.message || 'Unknown error'}`, 'error')
    } finally {
      customUploadLockRef.current = false
      setCustomUploadProgress(null)
    }
  }

  const handleAddCustomImage = async (e) => {
    const files = e.target.files
    if (!files?.length) return
    await runCustomUpload(files)
    if (customInputRef.current) customInputRef.current.value = ''
  }

  const handleCustomDrop = async (e) => {
    e.preventDefault()
    setCustomDragOver(false)
    if (customUploadLockRef.current) {
      addToast('An upload is already in progress', 'info')
      return
    }
    const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    await runCustomUpload(files)
  }

  const handleDeleteSelected = async () => {
    if (!selectedUrls.length) return
    try {
      await apiClient.deleteCustomImages(name, selectedUrls)
      await loadCustomImages()
      addToast('Images deleted', 'success')
      resetModes()
    } catch (err) {
      addToast(err.message, 'error')
    }
  }

  const toggleSelect = (url) => {
    if (aiMode || deleteMode) {
      setSelectedUrls((prev) => (prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]))
    }
  }

  const selectAllImages = () => {
    setSelectedUrls([...customs])
  }

  const generateAiCommand = () => {
    const urls = selectedUrls.length ? selectedUrls : customs
    const charName = editMode ? editName : char.name
    const cmd = `$ai ${charName} ${urls.map((u) => '$' + u).join(' ')}`
    navigator.clipboard.writeText(cmd).then(() => addToast('Command copied to clipboard', 'success')).catch(() => addToast('Failed to copy', 'error'))
  }

  const handleReorder = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    const arr = [...customs]
    const [removed] = arr.splice(fromIndex, 1)
    arr.splice(toIndex, 0, removed)
    apiClient.reorderCustomImages(name, arr).then(() => {
      loadCustomImages()
      addToast('Order updated', 'success')
    }).catch((err) => addToast(err.message, 'error'))
  }

  const onDragStart = (e, index) => {
    if (!reorderMode) return
    dragItemRef.current = index
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index)
  }

  const onDragOver = (e, index) => {
    if (!reorderMode) return
    e.preventDefault()
    dragOverRef.current = index
  }

  const onDragEnd = () => {
    if (dragItemRef.current != null && dragOverRef.current != null && dragItemRef.current !== dragOverRef.current) {
      handleReorder(dragItemRef.current, dragOverRef.current)
    }
    dragItemRef.current = null
    dragOverRef.current = null
  }

  const openModal = (index) => {
    if (aiMode || deleteMode || reorderMode) return
    setModalIndex(index)
    setModalOpen(true)
  }

  const allImages = [mainImage && getImageUrl(mainImage), ...customs.map((u) => getImageUrl(u) || u)].filter(Boolean)

  return (
    <div id="selectedCharacter" className="character-page">
      <div className="character-top-section">
      <div id="charInfo" className="char-info-section">
        {!editMode ? (
          <div id="charDisplayMode">
            <h3 id="charNameDisplay">{char.name}</h3>
            <p id="charSeriesDisplay">{char.series || '—'}</p>
            <p id="charRankDisplay">Rank: {char.rank || '—'}</p>
            <div className="bottom-controls" style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button type="button" className="action-btn" onClick={() => setEditMode(true)} title="Edit name, series, rank, and main image">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '5px' }}>
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit Character
              </button>
              <button type="button" className="action-btn" onClick={() => { resetModes(); setAiMode(true) }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '5px' }}>
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Get $ai Command
              </button>
            </div>
          </div>
        ) : (
          <div id="charEditMode">
            <div className="edit-form-container">
              <div className="edit-group full-width">
                <label htmlFor="editCharName">Name</label>
                <input id="editCharName" type="text" className="modern-input" placeholder="Character Name" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="edit-group full-width">
                <label htmlFor="editCharSeries">Series</label>
                <input id="editCharSeries" type="text" className="modern-input" placeholder="Series Name" value={editSeries} onChange={(e) => setEditSeries(e.target.value)} autoComplete="off" />
              </div>
              <div className="edit-group full-width">
                <label htmlFor="editCharRank">Rank</label>
                <input id="editCharRank" type="number" className="modern-input" placeholder="#" value={editRank} onChange={(e) => setEditRank(e.target.value)} />
              </div>
              <div className="edit-actions">
                <button type="button" className="action-btn primary" onClick={handleSaveEdit} disabled={loading}>Save Changes</button>
                <button type="button" className="action-btn secondary" onClick={() => setEditMode(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div id="charImageContainer" className="char-image-section">
        <div
          className={`image-wrapper ${editMode ? 'edit-mode' : ''} ${dragOver ? 'drag-over-main' : ''}`}
          onClick={() => editMode && mainInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); editMode && setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={editMode ? handleMainImageDrop : undefined}
          role={editMode ? 'button' : undefined}
          tabIndex={editMode ? 0 : undefined}
          onKeyDown={(e) => editMode && e.key === 'Enter' && mainInputRef.current?.click()}
        >
          <input ref={mainInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleMainImageChange} />
          {mainImage ? (
            <img id="charImageDisplay" src={getImageUrl(mainImage)} alt={char.name} className="char-main-image-full" />
          ) : (
            <div style={{ width: 200, height: 200, background: '#e9ecef', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6c757d' }}>No image</div>
          )}
          {editMode && <div className="image-overlay"><span>Click or Drop to Change</span></div>}
        </div>
        <button
          type="button"
          className={`save-button ${isSaved ? 'saved' : ''}`}
          onClick={handleToggleSave}
          title={isSaved ? 'Unsave' : 'Save'}
          aria-label={isSaved ? 'Unsave' : 'Save'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>
      </div>

      <div
        id="customImagesSection"
        className={customDragOver ? 'drag-over' : ''}
        onDragOver={(e) => { e.preventDefault(); setCustomDragOver(true) }}
        onDragLeave={() => setCustomDragOver(false)}
        onDrop={handleCustomDrop}
        style={{ display: 'block' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, color: '#212529' }}>Custom Images</h3>
          <div>
            {aiMode && (
              <>
                <button type="button" className="action-btn" onClick={generateAiCommand} style={{ padding: '6px 12px', fontSize: '0.9em', marginRight: '5px', backgroundColor: '#28a745', color: 'white', borderColor: '#28a745' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '5px', verticalAlign: 'text-bottom' }}>
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy Command ({selectedUrls.length || customs.length})
                </button>
                <button type="button" className="action-btn" onClick={selectAllImages} style={{ padding: '6px 12px', fontSize: '0.9em', marginRight: '5px' }}>Select All</button>
                <button type="button" className="action-btn" onClick={resetModes} style={{ padding: '6px 12px', fontSize: '0.9em', marginRight: '5px' }}>Cancel</button>
              </>
            )}
            {deleteMode && (
              <>
                <button type="button" className="action-btn" onClick={handleDeleteSelected} style={{ padding: '6px 12px', fontSize: '0.9em', marginRight: '5px', backgroundColor: '#dc3545', color: 'white', borderColor: '#dc3545' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '5px', verticalAlign: 'text-bottom' }}>
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  Delete Selected ({selectedUrls.length})
                </button>
                <button type="button" className="action-btn" onClick={resetModes} style={{ padding: '6px 12px', fontSize: '0.9em', marginRight: '5px' }}>Cancel</button>
              </>
            )}
            {!aiMode && !deleteMode && (
              <>
                <button type="button" className="action-btn" onClick={() => { resetModes(); setDeleteMode(true) }} style={{ padding: '6px 12px', fontSize: '0.9em', marginRight: '5px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '5px', verticalAlign: 'text-bottom' }}>
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  Delete
                </button>
                <button type="button" className="action-btn" onClick={() => { resetModes(); setReorderMode(!reorderMode) }} style={{ padding: '6px 12px', fontSize: '0.9em', marginRight: '5px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '5px', verticalAlign: 'text-bottom' }}>
                    <polyline points="5 9 2 12 5 15" />
                    <polyline points="9 5 12 2 15 5" />
                    <polyline points="19 9 22 12 19 15" />
                    <polyline points="9 19 12 22 15 19" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <line x1="12" y1="2" x2="12" y2="22" />
                  </svg>
                  {reorderMode ? 'Done' : 'Reorder'}
                </button>
                <button
                  type="button"
                  className="action-btn"
                  disabled={!!customUploadProgress}
                  onClick={() => customInputRef.current?.click()}
                  style={{ padding: '6px 12px', fontSize: '0.9em', opacity: customUploadProgress ? 0.6 : 1 }}
                  title="Add Custom Image"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '5px', verticalAlign: 'text-bottom' }}>
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add Image
                </button>
              </>
            )}
          </div>
        </div>
        <input ref={customInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleAddCustomImage} disabled={!!customUploadProgress} />
        <p style={{ textAlign: 'center', color: '#6c757d', margin: '10px 0', fontSize: '0.9em', border: '1px dashed #ccc', padding: '10px', borderRadius: '5px' }}>
          Drag &amp; Drop images here or click &quot;Add Image&quot;
        </p>
        {customUploadProgress && (
          <div className="custom-upload-progress" role="status" aria-live="polite">
            <span className="custom-upload-progress-spinner" aria-hidden />
            <span className="custom-upload-progress-text">
              {customUploadProgress.phase === 'starting'
                ? `Preparing ${customUploadProgress.total} image${customUploadProgress.total !== 1 ? 's' : ''}…`
                : `Uploading ${customUploadProgress.current}/${customUploadProgress.total}${customUploadProgress.fileName ? ` — ${customUploadProgress.fileName}` : ''}`}
            </span>
          </div>
        )}
        <div id="customImagesGallery">
          {customs.map((url, idx) => (
            <div
              key={url}
              className={`gallery-item-wrapper ${aiMode ? 'ai-mode' : ''} ${deleteMode ? 'delete-mode' : ''} ${reorderMode ? 'reorder-mode' : ''} ${selectedUrls.includes(url) ? 'selected' : ''}`}
              onClick={() => (aiMode || deleteMode) && toggleSelect(url)}
              onDragStart={(e) => onDragStart(e, idx)}
              onDragOver={(e) => onDragOver(e, idx)}
              onDragEnd={onDragEnd}
              draggable={reorderMode}
              role={reorderMode ? 'button' : undefined}
              tabIndex={reorderMode ? 0 : undefined}
            >
              <img src={getImageUrl(url)} alt="" className="custom-image-full" onClick={() => !aiMode && !deleteMode && !reorderMode && openModal(idx + 1)} />
            </div>
          ))}
        </div>
      </div>

      {modalOpen && (
        <ImageModal
          images={allImages}
          currentIndex={modalIndex}
          onClose={() => setModalOpen(false)}
          onPrev={() => setModalIndex((i) => Math.max(0, i - 1))}
          onNext={() => setModalIndex((i) => Math.min(allImages.length - 1, i + 1))}
        />
      )}
    </div>
  )
}
