import { useState, useEffect } from 'react'

/** @param {string} query e.g. '(max-width: 768px)' */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    const m = window.matchMedia(query)
    const onChange = () => setMatches(m.matches)
    m.addEventListener('change', onChange)
    setMatches(m.matches)
    return () => m.removeEventListener('change', onChange)
  }, [query])

  return matches
}
