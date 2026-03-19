import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { getImageUrl } from '../api'

const SORT_OPTIONS = [
  { value: 'rank', label: 'Rank (High-Low)' },
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'series', label: 'Series (A-Z)' },
]

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('name')
  const [sort, setSort] = useState('rank')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const dropdownRef = useRef(null)
  const navigate = useNavigate()
  const characters = useStore((s) => s.characters)

  const matches = useMemo(() => {
    if (!query.trim()) return []
    const q = query.trim().toLowerCase()
    const filtered = characters.filter((c) => {
      const field = mode === 'name' ? c.name : (c.series || '')
      return field.toLowerCase().includes(q)
    })
    const sorted = [...filtered].sort((a, b) => {
      if (sort === 'rank') return (parseInt(a.rank) || 9999) - (parseInt(b.rank) || 9999)
      if (sort === 'name') return (a.name || '').localeCompare(b.name || '')
      if (sort === 'series') return (a.series || '').localeCompare(b.series || '')
      return 0
    })
    return sorted.slice(0, 15)
  }, [query, mode, sort, characters])

  const sortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label || sort

  useEffect(() => {
    const h = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false)
    }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [])

  const handleSelect = (char) => {
    setQuery('')
    setSuggestionsOpen(false)
    navigate(`/character/${encodeURIComponent(char.name)}`)
  }

  return (
    <>
      <div className="search-input-wrapper">
        <input
          type="text"
          className="char-search-input"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSuggestionsOpen(true) }}
          onFocus={() => setSuggestionsOpen(true)}
          onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
          placeholder="Search characters..."
          autoComplete="off"
        />
        <div className={`search-toggle-wrapper ${suggestionsOpen || query ? 'expanded' : ''}`}>
          <span className={`toggle-label ${mode === 'name' ? 'active' : ''}`}>Name</span>
          <label className="switch">
            <input
              type="checkbox"
              checked={mode === 'series'}
              onChange={() => setMode(mode === 'name' ? 'series' : 'name')}
            />
            <span className="slider" />
          </label>
          <span className={`toggle-label ${mode === 'series' ? 'active' : ''}`}>Series</span>
        </div>
      </div>
      <div className={`custom-dropdown ${dropdownOpen ? 'active' : ''}`} ref={dropdownRef}>
        <div
          className="dropdown-selected"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setDropdownOpen(!dropdownOpen)}
        >
          <span className="selected-text">{sortLabel}</span>
          <svg className="dropdown-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <div className={`dropdown-options ${dropdownOpen ? 'show' : ''}`} style={{ display: dropdownOpen ? 'block' : 'none' }}>
          {SORT_OPTIONS.map((o) => (
            <div
              key={o.value}
              className={`dropdown-option ${sort === o.value ? 'selected' : ''}`}
              onClick={() => { setSort(o.value); setDropdownOpen(false) }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && (setSort(o.value), setDropdownOpen(false))}
            >
              {o.label}
            </div>
          ))}
        </div>
      </div>
      {suggestionsOpen && matches.length > 0 && (
        <div className="suggestions-box">
          {matches.map((c) => (
            <div
              key={c.name}
              className="suggestion-item"
              onClick={() => handleSelect(c)}
              onKeyDown={(e) => e.key === 'Enter' && handleSelect(c)}
              role="button"
              tabIndex={0}
            >
              <img src={getImageUrl(c.image)} alt="" />
              <div>
                <span>{c.name}</span>
                {c.series && <small>{c.series}</small>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
