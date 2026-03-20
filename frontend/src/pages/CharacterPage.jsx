import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { apiClient, getImageUrl } from '../api'
import ImageModal from '../components/ImageModal'
import { useMediaQuery } from '../hooks/useMediaQuery'

/** Must match server MAX_FILE_SIZE in upload_imgchest.py (30 MiB) */
const MAX_CUSTOM_IMAGE_BYTES = 30 * 1024 * 1024

function adjustDropTarget(toIndex, pickedSet, len) {
  if (len <= 0) return 0
  let t = toIndex
  if (t < 0) t = 0
  if (t >= len) t = len - 1
  if (!pickedSet.has(t)) return t
  for (let i = t + 1; i < len; i++) if (!pickedSet.has(i)) return i
  for (let i = t - 1; i >= 0; i--) if (!pickedSet.has(i)) return i
  return 0
}

/** Move one contiguous group of indices to a drop target index (same visual order as `customs`). */
function moveGroupInArray(arr, fromIndices, toIndex) {
  const sorted = [...fromIndices].sort((a, b) => a - b)
  const pickedSet = new Set(sorted)
  const picked = sorted.map((i) => arr[i])
  let t = toIndex
  if (pickedSet.has(t)) {
    t = adjustDropTarget(t, pickedSet, arr.length)
  }
  if (t < 0) t = 0
  const without = arr.filter((_, i) => !pickedSet.has(i))
  let insertBefore = 0
  for (let i = 0; i < t && i < arr.length; i++) {
    if (!pickedSet.has(i)) insertBefore++
  }
  return [...without.slice(0, insertBefore), ...picked, ...without.slice(insertBefore)]
}

function ordersEqual(a, b) {
  if (a.length !== b.length) return false
  return a.every((u, i) => u === b[i])
}

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
  const dragIndicesRef = useRef(null)
  /** Snapshot of custom image URLs when reorder session started (Cancel restores this order) */
  const reorderSessionBaselineRef = useRef(null)
  /** Drop target & dragged indices for reorder UI (refs alone don't re-render) */
  const [reorderDropTargetIndex, setReorderDropTargetIndex] = useState(null)
  const [reorderDragIndices, setReorderDragIndices] = useState(null)
  /** Last pointer Y during reorder drag — drives continuous edge auto-scroll */
  const reorderEdgePointerYRef = useRef(null)

  const narrowToolbar = useMediaQuery('(max-width: 768px)')
  const [charToolbarOpen, setCharToolbarOpen] = useState(false)
  useEffect(() => {
    if (!narrowToolbar) setCharToolbarOpen(false)
  }, [narrowToolbar])

  useEffect(() => {
    setCharToolbarOpen(false)
  }, [aiMode, deleteMode, reorderMode])

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

  useEffect(() => {
    if (!reorderMode) {
      setReorderDropTargetIndex(null)
      setReorderDragIndices(null)
    }
  }, [reorderMode])

  /**
   * Continuous edge scroll while reorder-dragging: dragover only fires when the pointer moves,
   * so we run a rAF loop and read the last known Y — scrolling keeps going while the pointer
   * stays in the top/bottom bands.
   */
  useEffect(() => {
    if (!reorderDragIndices) return
    const edge = 100
    const maxStep = 28
    const minStep = 5
    let rafId = 0

    const onPointerMove = (e) => {
      if (typeof e.clientY === 'number') reorderEdgePointerYRef.current = e.clientY
    }

    const tick = () => {
      const y = reorderEdgePointerYRef.current
      if (y != null) {
        const h = window.innerHeight
        if (y < edge) {
          const d = edge - y
          const step = Math.round(Math.min(maxStep, Math.max(minStep, 4 + d * 0.22)))
          window.scrollBy(0, -step)
        } else if (y > h - edge) {
          const d = y - (h - edge)
          const step = Math.round(Math.min(maxStep, Math.max(minStep, 4 + d * 0.22)))
          window.scrollBy(0, step)
        }
      }
      rafId = requestAnimationFrame(tick)
    }

    reorderEdgePointerYRef.current = null
    document.addEventListener('dragover', onPointerMove, { passive: true })
    document.addEventListener('drag', onPointerMove, { passive: true })
    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
      document.removeEventListener('dragover', onPointerMove)
      document.removeEventListener('drag', onPointerMove)
      reorderEdgePointerYRef.current = null
    }
  }, [reorderDragIndices])

  const resetModes = useCallback(() => {
    setAiMode(false)
    setDeleteMode(false)
    setReorderMode(false)
    setSelectedUrls([])
    reorderSessionBaselineRef.current = null
  }, [])

  const enterReorderMode = useCallback(() => {
    setAiMode(false)
    setDeleteMode(false)
    setSelectedUrls([])
    reorderSessionBaselineRef.current = [...customs]
    setReorderMode(true)
  }, [customs])

  const cancelReorder = useCallback(async () => {
    const baseline = reorderSessionBaselineRef.current
    try {
      if (baseline) {
        await apiClient.reorderCustomImages(name, baseline)
        await loadCustomImages()
      }
      reorderSessionBaselineRef.current = null
      setReorderMode(false)
      setSelectedUrls([])
      setReorderDropTargetIndex(null)
      setReorderDragIndices(null)
      addToast('Order reverted to before you started reordering.', 'info')
    } catch (e) {
      addToast(e.message || 'Could not revert order', 'error')
    }
  }, [name, loadCustomImages, addToast])

  const doneReorder = useCallback(() => {
    reorderSessionBaselineRef.current = null
    setReorderMode(false)
    setSelectedUrls([])
    setReorderDropTargetIndex(null)
    setReorderDragIndices(null)
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
        const file = list[i]
        setCustomUploadProgress({ phase: 'uploading', current: i + 1, total, fileName: file.name })
        if (file.size > MAX_CUSTOM_IMAGE_BYTES) {
          const msg = `File too large (max ${MAX_CUSTOM_IMAGE_BYTES / (1024 * 1024)}MB)`
          addToast(`Skipped ${i + 1}/${total} — ${file.name}: ${msg}`, 'error')
          errors.push({ name: file.name, message: msg })
          continue
        }
        try {
          const fd = new FormData()
          fd.append('character_name', name)
          fd.append('files', file)
          const res = await apiClient.addCustomImage(fd)
          await loadCustomImages()
          // Server can return 200 with `errors` when a batch had partial failures (e.g. multi-file request)
          if (res && Array.isArray(res._partialErrors) && res._partialErrors.length) {
            res._partialErrors.forEach((msg) => {
              addToast(`Skipped: ${msg}`, 'error')
              errors.push({ name: file.name, message: msg })
            })
          }
        } catch (err) {
          const msg = err.message || 'Upload failed'
          addToast(`Failed ${i + 1}/${total} (${file.name}): ${msg}`, 'error')
          errors.push({ name: file.name, message: msg })
        }
      }

      const ok = total - errors.length
      if (ok === total) {
        addToast(`${ok} image${ok !== 1 ? 's' : ''} uploaded successfully.`, 'success')
      } else if (ok > 0) {
        addToast(`${ok} of ${total} image${ok !== 1 ? 's' : ''} uploaded. ${errors.length} skipped or failed — see alert.`, 'error')
      } else {
        addToast(`No images uploaded — see alert for details.`, 'error')
      }
      if (errors.length > 0) {
        const detail = errors.map((e) => (e.name ? `${e.name}\n  ${e.message}` : e.message)).join('\n\n')
        window.alert(`Some images were skipped or failed (${errors.length} of ${total}):\n\n${detail}`)
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
    const orderBeforeDelete = [...customs]
    try {
      await apiClient.deleteCustomImages(name, selectedUrls)
      await loadCustomImages()
      const n = selectedUrls.length
      addToast(`${n} custom image${n === 1 ? '' : 's'} removed`, 'success', {
        onUndo: async () => {
          await apiClient.reorderCustomImages(name, orderBeforeDelete)
          await loadCustomImages()
          resetModes()
          addToast('Images restored', 'info')
        },
      })
      resetModes()
    } catch (err) {
      addToast(err.message, 'error')
    }
  }

  const toggleSelect = (url) => {
    if (aiMode || deleteMode || reorderMode) {
      setSelectedUrls((prev) => (prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]))
    }
  }

  const getIndicesToMove = useCallback(
    (startIndex) => {
      const indices = customs
        .map((u, i) => (selectedUrls.includes(u) ? i : -1))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b)
      if (indices.length === 0) return [startIndex]
      if (indices.includes(startIndex)) return indices
      return [startIndex]
    },
    [customs, selectedUrls]
  )

  const selectAllImages = () => {
    setSelectedUrls([...customs])
  }

  const generateAiCommand = () => {
    const urls = selectedUrls.length ? selectedUrls : customs
    const charName = editMode ? editName : char.name
    const cmd = `$ai ${charName} ${urls.map((u) => '$' + u).join(' ')}`
    navigator.clipboard.writeText(cmd).then(() => addToast('Command copied to clipboard', 'success')).catch(() => addToast('Failed to copy', 'error'))
  }

  const applyReorder = useCallback(
    (newOrder) => {
      apiClient
        .reorderCustomImages(name, newOrder)
        .then(() => {
          loadCustomImages()
          addToast('Order updated', 'success')
        })
        .catch((err) => addToast(err.message, 'error'))
    },
    [name, loadCustomImages, addToast]
  )

  const onDragStart = (e, index) => {
    if (!reorderMode) return
    const indices = getIndicesToMove(index)
    dragIndicesRef.current = indices
    dragItemRef.current = index
    setReorderDragIndices(indices)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }

  const onDragOver = (e, index) => {
    if (!reorderMode) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    dragOverRef.current = index
    setReorderDropTargetIndex(index)
  }

  const onDragEnd = () => {
    const to = dragOverRef.current
    const from = dragItemRef.current
    const indices = dragIndicesRef.current
    dragItemRef.current = null
    dragOverRef.current = null
    dragIndicesRef.current = null
    setReorderDropTargetIndex(null)
    setReorderDragIndices(null)
    if (from == null || to == null || !indices?.length) return
    const next = moveGroupInArray(customs, indices, to)
    if (ordersEqual(next, customs)) return
    applyReorder(next)
  }

  const onGalleryDragLeave = (e) => {
    if (!reorderMode || !reorderDragIndices) return
    const next = e.relatedTarget
    if (next && e.currentTarget.contains(next)) return
    setReorderDropTargetIndex(null)
    dragOverRef.current = null
  }

  const onGalleryDragOver = (e) => {
    if (!reorderMode || !reorderDragIndices) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
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
            <h3 id="charNameDisplay" className="display-title">{char.name}</h3>
            <p id="charSeriesDisplay" className="text-body">{char.series || '—'}</p>
            <p id="charRankDisplay" className="text-meta">Rank: {char.rank || '—'}</p>
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
        <div className="custom-images-header-row">
          <h3 className="section-heading custom-images-heading">Custom Images</h3>
          <div className={`char-custom-toolbar ${narrowToolbar ? 'char-custom-toolbar--narrow' : ''}`}>
            {narrowToolbar && (
              <button
                type="button"
                className="action-btn char-custom-toolbar-toggle"
                aria-expanded={charToolbarOpen}
                onClick={() => setCharToolbarOpen((o) => !o)}
              >
                {charToolbarOpen ? 'Close' : 'More'}
              </button>
            )}
            <div
              className={`char-custom-toolbar-actions ${!narrowToolbar || charToolbarOpen ? 'char-custom-toolbar-actions--visible' : ''}`}
              id="char-custom-toolbar-actions"
            >
              {aiMode && (
                <>
                  <button type="button" className="action-btn" onClick={generateAiCommand} style={{ padding: '6px 12px', fontSize: '0.9em', backgroundColor: '#28a745', color: 'white', borderColor: '#28a745' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '5px', verticalAlign: 'text-bottom' }}>
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy Command ({selectedUrls.length || customs.length})
                  </button>
                  <button type="button" className="action-btn" onClick={selectAllImages} style={{ padding: '6px 12px', fontSize: '0.9em' }}>Select All</button>
                  <button type="button" className="action-btn" onClick={resetModes} style={{ padding: '6px 12px', fontSize: '0.9em' }}>Cancel</button>
                </>
              )}
              {deleteMode && (
                <>
                  <button type="button" className="action-btn" onClick={handleDeleteSelected} style={{ padding: '6px 12px', fontSize: '0.9em', backgroundColor: '#dc3545', color: 'white', borderColor: '#dc3545' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '5px', verticalAlign: 'text-bottom' }}>
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    Delete Selected ({selectedUrls.length})
                  </button>
                  <button type="button" className="action-btn" onClick={resetModes} style={{ padding: '6px 12px', fontSize: '0.9em' }}>Cancel</button>
                </>
              )}
              {reorderMode && !aiMode && !deleteMode && (
                <>
                  <button type="button" className="action-btn" onClick={() => setSelectedUrls([])} style={{ padding: '6px 12px', fontSize: '0.9em' }}>
                    Clear selection
                  </button>
                  <button type="button" className="action-btn secondary" onClick={cancelReorder} style={{ padding: '6px 12px', fontSize: '0.9em' }}>
                    Cancel
                  </button>
                  <button type="button" className="action-btn primary" onClick={doneReorder} style={{ padding: '6px 12px', fontSize: '0.9em' }}>
                    Done
                  </button>
                </>
              )}
              {!aiMode && !deleteMode && !reorderMode && (
                <>
                  <button type="button" className="action-btn" onClick={() => { resetModes(); setDeleteMode(true) }} style={{ padding: '6px 12px', fontSize: '0.9em' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '5px', verticalAlign: 'text-bottom' }}>
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    Delete
                  </button>
                  <button type="button" className="action-btn" onClick={enterReorderMode} style={{ padding: '6px 12px', fontSize: '0.9em' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '5px', verticalAlign: 'text-bottom' }}>
                      <polyline points="5 9 2 12 5 15" />
                      <polyline points="9 5 12 2 15 5" />
                      <polyline points="19 9 22 12 19 15" />
                      <polyline points="9 19 12 22 15 19" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <line x1="12" y1="2" x2="12" y2="22" />
                    </svg>
                    Reorder
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
        </div>
        {reorderMode && (
          <details className="reorder-mode-hint-details">
            <summary className="reorder-mode-hint-summary">How reorder works</summary>
            <div className="reorder-mode-hint-body">
              <p>
                <strong>Drag one image</strong> to move it to a new position. The page scrolls automatically when you drag near the top or bottom of the screen.
              </p>
              <p>
                <strong>To move several at once:</strong> click images to select them (or use Clear selection), then drag any selected image — the whole group moves together.
              </p>
            </div>
          </details>
        )}
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
        <div
          id="customImagesGallery"
          className={reorderDragIndices ? 'reorder-drag-active' : ''}
          onDragOver={onGalleryDragOver}
          onDragLeave={onGalleryDragLeave}
        >
          {customs.map((url, idx) => {
            const isDropTarget = reorderMode && reorderDropTargetIndex === idx
            const isDragSource = reorderMode && reorderDragIndices?.includes(idx)
            return (
            <div
              key={url}
              className={`gallery-item-wrapper ${aiMode ? 'ai-mode' : ''} ${deleteMode ? 'delete-mode' : ''} ${reorderMode ? 'reorder-mode' : ''} ${selectedUrls.includes(url) ? 'selected' : ''} ${isDropTarget ? 'reorder-drop-target' : ''} ${isDragSource ? 'reorder-drag-source' : ''}`}
              onClick={() => (aiMode || deleteMode || reorderMode) && toggleSelect(url)}
              onDragStart={(e) => onDragStart(e, idx)}
              onDragOver={(e) => onDragOver(e, idx)}
              onDragEnd={onDragEnd}
              draggable={reorderMode}
              role={reorderMode ? 'button' : undefined}
              tabIndex={reorderMode ? 0 : undefined}
            >
              <img
                src={getImageUrl(url)}
                alt=""
                className="custom-image-full"
                onClick={() => !aiMode && !deleteMode && !reorderMode && openModal(idx + 1)}
              />
              {isDropTarget && (
                <span className="reorder-drop-label" aria-hidden>
                  Drop here
                </span>
              )}
            </div>
            )
          })}
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
