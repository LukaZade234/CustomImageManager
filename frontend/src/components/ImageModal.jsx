import { useEffect } from 'react'

export default function ImageModal({ images, currentIndex, onClose, onPrev, onNext }) {
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    document.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', h)
      document.body.style.overflow = ''
    }
  }, [onClose, onPrev, onNext])

  if (!images?.length) return null

  const img = images[currentIndex]
  const src = typeof img === 'string' ? img : img?.url

  return (
    <div className="image-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <span className="image-modal-close" onClick={onClose} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClose()}>&times;</span>
      {currentIndex > 0 && (
        <span className="image-modal-nav image-modal-prev" onClick={onPrev} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onPrev()}>&#10094;</span>
      )}
      <img src={src} alt="" onClick={(e) => e.stopPropagation()} />
      {currentIndex < images.length - 1 && (
        <span className="image-modal-nav image-modal-next" onClick={onNext} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onNext()}>&#10095;</span>
      )}
      <div className="image-modal-counter">{currentIndex + 1} / {images.length}</div>
    </div>
  )
}
