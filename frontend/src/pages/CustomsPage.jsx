import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { getImageUrl } from '../api'

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'rank_asc', label: 'Rank (High-Low)' },
  { value: 'name_asc', label: 'Name (A-Z)' },
  { value: 'name_desc', label: 'Name (Z-A)' },
  { value: 'series_asc', label: 'Series (A-Z)' },
  { value: 'count_desc', label: 'Most Images' },
  { value: 'count_asc', label: 'Fewest Images' },
]

export default function CustomsPage() {
  const characters = useStore((s) => s.characters)
  const customImages = useStore((s) => s.customImages)
  const [search, setSearch] = useState('')
  const [seriesFilter, setSeriesFilter] = useState('all')
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
      filtered = withChars.filter((c) =>
        c.name.toLowerCase().includes(q) || (c.series || '').toLowerCase().includes(q)
      )
    }
    if (seriesFilter !== 'all') {
      filtered = filtered.filter((c) => (c.series || '').toLowerCase() === seriesFilter.toLowerCase())
    }
    if (sort === 'recent') filtered.sort((a, b) => b.customCount - a.customCount)
    if (sort === 'rank_asc') filtered.sort((a, b) => (parseInt(a.rank) || 9999) - (parseInt(b.rank) || 9999))
    if (sort === 'name_asc') filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    if (sort === 'name_desc') filtered.sort((a, b) => (b.name || '').localeCompare(a.name || ''))
    if (sort === 'series_asc') filtered.sort((a, b) => (a.series || '').localeCompare(b.series || ''))
    if (sort === 'count_desc') filtered.sort((a, b) => b.customCount - a.customCount)
    if (sort === 'count_asc') filtered.sort((a, b) => a.customCount - b.customCount)
    return filtered
  }, [customImages, characters, search, seriesFilter, sort])

  const seriesOptions = useMemo(() => {
    const set = new Set()
    Object.keys(customImages).forEach((name) => {
      const c = characters.find((x) => x.name === name)
      if (c?.series) set.add(c.series)
    })
    return Array.from(set).sort()
  }, [customImages, characters])

  return (
    <div id="customsPage" className="customs-page">
      <h2>Browse Customs</h2>
      <div className="customs-controls" style={{ marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search customs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd', flex: 1 }}
        />
        <select
          value={seriesFilter}
          onChange={(e) => setSeriesFilter(e.target.value)}
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd', maxWidth: '200px' }}
        >
          <option value="all">All Series</option>
          {seriesOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <p id="customsCount" style={{ color: '#666', marginBottom: '20px' }}>
        {customsList.length} characters with custom images uploaded.
      </p>
      <div id="customsList" className="search-result-list">
        {customsList.map((c) => (
          <Link key={c.name} to={`/character/${encodeURIComponent(c.name)}`} className="search-result-item">
            <img src={getImageUrl(c.image)} alt="" className="search-result-img" />
            <div className="search-result-info">
              <h3>{c.name}</h3>
              {c.series && <p>{c.series}</p>}
              <p><span className="badge" style={{ display: 'inline-block', marginLeft: '8px', padding: '2px 8px', background: '#e9ecef', borderRadius: '4px', fontSize: '0.8rem' }}>{c.customCount} images</span></p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
