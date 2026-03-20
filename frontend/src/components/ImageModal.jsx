import { useEffect, useRef, useCallback } from 'react'

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function ImageModal({ images, currentIndex, onClose, onPrev, onNext }) {
  const dialogRef = useRef(null)
  const prevActiveRef = useRef(null)

  const getFocusables = useCallback(() => {
    const root = dialogRef.current
    if (!root) return []
    return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el.getClientRects().length > 0
    )
  }, [])

  useEffect(() => {
    prevActiveRef.current = document.activeElement
    const t = setTimeout(() => {
      const list = getFocusables()
      if (list.length) list[0].focus()
    }, 0)
    document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(t)
      document.body.style.overflow = ''
      const prev = prevActiveRef.current
      if (prev && typeof prev.focus === 'function') prev.focus()
    }
  }, [getFocusables])

  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose, onPrev, onNext])

  const onKeyDownTrap = useCallback(
    (e) => {
      if (e.key !== 'Tab') return
      const list = getFocusables()
      if (list.length === 0) return
      const first = list[0]
      const last = list[list.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else if (document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    },
    [getFocusables]
  )

  if (!images?.length) return null

  const img = images[currentIndex]
  const src = typeof img === 'string' ? img : img?.url
  if (!src) return null

  return (
    <div
      ref={dialogRef}
      className="image-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      tabIndex={-1}
      onKeyDown={onKeyDownTrap}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <button
        type="button"
        className="image-modal-close"
        onClick={onClose}
        aria-label="Close"
      >
        &times;
      </button>
      {currentIndex > 0 && (
        <button
          type="button"
          className="image-modal-nav image-modal-prev"
          onClick={onPrev}
          aria-label="Previous image"
        >
          &#10094;
        </button>
      )}
      <img src={src} alt="" tabIndex={-1} onClick={(e) => e.stopPropagation()} />
      {currentIndex < images.length - 1 && (
        <button
          type="button"
          className="image-modal-nav image-modal-next"
          onClick={onNext}
          aria-label="Next image"
        >
          &#10095;
        </button>
      )}
      <div className="image-modal-counter" aria-live="polite">
        {currentIndex + 1} / {images.length}
      </div>
    </div>
  )
}
