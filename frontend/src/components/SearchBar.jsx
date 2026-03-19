import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { getImageUrl } from '../api'

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('name') // 'name' | 'series'
  const [sort, setSort] = useState('rank')
  const [open, setOpen] = useState(false)
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

  const handleSelect = (char) => {
    setQuery('')
    setOpen(false)
    navigate(`/character/${encodeURIComponent(char.name)}`)
  }

  return (
    <div className="search-container">
      <div className="search-input-wrapper">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search characters..."
          autoComplete="off"
        />
        <div className="search-toggle">
          <span className={mode === 'name' ? 'active' : ''} onClick={() => setMode('name')}>Name</span>
          <label className="switch">
            <input type="checkbox" checked={mode === 'series'} onChange={() => setMode(mode === 'name' ? 'series' : 'name')} />
            <span className="slider" />
          </label>
          <span className={mode === 'series' ? 'active' : ''} onClick={() => setMode('series')}>Series</span>
        </div>
      </div>
      <select value={sort} onChange={(e) => setSort(e.target.value)} className="sort-select">
        <option value="rank">Rank</option>
        <option value="name">Name (A-Z)</option>
        <option value="series">Series (A-Z)</option>
      </select>
      {open && matches.length > 0 && (
        <div className="suggestions-box">
          {matches.map((c) => (
            <div key={c.name} className="suggestion-item" onClick={() => handleSelect(c)}>
              <img src={getImageUrl(c.image)} alt="" />
              <span>{c.name}</span>
              {c.series && <small>{c.series}</small>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
