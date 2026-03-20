import { useState, useEffect } from 'react'

/** @param {string} query e.g. '(max-width: 768px)' */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    try {
      return window.matchMedia(query).matches
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    let m
    try {
      m = window.matchMedia(query)
    } catch {
      return
    }
    const onChange = () => setMatches(m.matches)
    // Safari ≤13 / older WebKit: addEventListener on MediaQueryList is missing — use addListener
    if (typeof m.addEventListener === 'function') {
      m.addEventListener('change', onChange)
    } else if (typeof m.addListener === 'function') {
      m.addListener(onChange)
    }
    setMatches(m.matches)
    return () => {
      if (typeof m.removeEventListener === 'function') {
        m.removeEventListener('change', onChange)
      } else if (typeof m.removeListener === 'function') {
        m.removeListener(onChange)
      }
    }
  }, [query])

  return matches
}
