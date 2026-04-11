import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/useStore'
import { DISCORD_LIMIT_REGULAR, DISCORD_LIMIT_NITRO } from '../utils/aiCommandDiscord'

async function copyWithFallback(text, addToast) {
  if (!text) {
    addToast('Nothing to copy', 'info')
    return
  }
  const fallback = () => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    try {
      return document.execCommand('copy')
    } finally {
      document.body.removeChild(ta)
    }
  }
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      addToast('Copied to clipboard', 'success')
      return
    } catch {
      /* fall through */
    }
  }
  if (fallback()) addToast('Copied to clipboard', 'success')
  else addToast('Could not copy — select text manually (Ctrl+C / Cmd+C)', 'error')
}

/**
 * Shown when $ai command length >= 2000. Two columns: non-Nitro (≤2000 per message) and Nitro (≤4000 per message).
 */
export default function AiCommandLimitDialog({ charCount, nonNitroParts, nitroParts, onClose }) {
  const closeBtnRef = useRef(null)
  const addToast = useStore((s) => s.addToast)

  const copyPart = useCallback(
    (text) => {
      copyWithFallback(text, addToast)
    },
    [addToast]
  )

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const t = setTimeout(() => closeBtnRef.current?.focus(), 0)
    return () => {
      clearTimeout(t)
      document.body.style.overflow = ''
    }
  }, [])

  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div
      className="upload-error-dialog-backdrop ai-command-limit-dialog-backdrop"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="upload-error-dialog ai-command-limit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-command-limit-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="ai-command-limit-title" className="upload-error-dialog__title">
          $ai command exceeds Discord length
        </h2>
        <p className="upload-error-dialog__hint ai-command-limit-dialog__summary">
          This command is <strong>{charCount.toLocaleString()}</strong> characters. Regular Discord accounts can send{' '}
          <strong>{DISCORD_LIMIT_REGULAR.toLocaleString()}</strong> characters per message; Nitro allows{' '}
          <strong>{DISCORD_LIMIT_NITRO.toLocaleString()}</strong>. Copy the parts below and paste each as its own message
          in Discord.
        </p>

        <div className="ai-command-limit-dialog__columns">
          <section className="ai-command-limit-dialog__column" aria-label="Without Nitro">
            <h3 className="ai-command-limit-dialog__column-title">Without Nitro (≤{DISCORD_LIMIT_REGULAR.toLocaleString()} each)</h3>
            <ul className="ai-command-limit-dialog__part-list">
              {nonNitroParts.map((text, idx) => (
                <li key={`n-${idx}`}>
                  <button
                    type="button"
                    className="action-btn primary ai-command-limit-dialog__copy-btn"
                    onClick={() => copyPart(text, idx)}
                  >
                    Copy command part {idx + 1}
                    <span className="ai-command-limit-dialog__meta"> ({text.length.toLocaleString()} chars)</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="ai-command-limit-dialog__column" aria-label="With Nitro">
            <h3 className="ai-command-limit-dialog__column-title">With Nitro (≤{DISCORD_LIMIT_NITRO.toLocaleString()} each)</h3>
            <ul className="ai-command-limit-dialog__part-list">
              {nitroParts.map((text, idx) => (
                <li key={`t-${idx}`}>
                  <button
                    type="button"
                    className="action-btn primary ai-command-limit-dialog__copy-btn"
                    onClick={() => copyPart(text, idx)}
                  >
                    {nitroParts.length === 1 ? 'Copy full command' : `Copy command part ${idx + 1}`}
                    <span className="ai-command-limit-dialog__meta"> ({text.length.toLocaleString()} chars)</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="upload-error-dialog__actions">
          <button ref={closeBtnRef} type="button" className="action-btn secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
