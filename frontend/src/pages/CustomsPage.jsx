import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { getImageUrl } from '../api'

export default function CustomsPage() {
  const characters = useStore((s) => s.characters)
  const customImages = useStore((s) => s.customImages)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('recent')

  const customsList = useMemo(() => {
    const entries = Object.entries(customImages).filter(([, urls]) => urls?.length > 0)
    const withChars = entries.map(([name, urls]) => {
      const char = characters.find((c) => c.name === name) || { name, series: '', rank: '' }
      return { ...char, customCount: urls.length }
    })
    let filtered = withChars
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      filtered = withChars.filter((c) => c.name.toLowerCase().includes(q) || (c.series || '').toLowerCase().includes(q))
    }
    if (sort === 'recent') filtered.sort((a, b) => b.customCount - a.customCount)
    if (sort === 'name_asc') filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    if (sort === 'count_desc') filtered.sort((a, b) => b.customCount - a.customCount)
    return filtered
  }, [customImages, characters, search, sort])

  return (
    <div className="customs-page">
      <h2>Browse Customs</h2>
      <div className="customs-controls">
        <input
          type="text"
          placeholder="Search customs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="recent">Most Recent</option>
          <option value="name_asc">Name (A-Z)</option>
          <option value="count_desc">Most Images</option>
        </select>
      </div>
      <p className="count">{customsList.length} characters with custom images</p>
      <div className="customs-list">
        {customsList.map((c) => (
          <Link key={c.name} to={`/character/${encodeURIComponent(c.name)}`} className="customs-item">
            <img src={getImageUrl(c.image)} alt="" />
            <div>
              <strong>{c.name}</strong>
              {c.series && <small>{c.series}</small>}
              <span className="badge">{c.customCount} images</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
