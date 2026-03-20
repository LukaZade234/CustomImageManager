import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { getImageUrl } from '../api'

const PAGE_SIZE = 20
const PREVIEW_COUNT = 3

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
  const [searchMode, setSearchMode] = useState('name')
  const [sort, setSort] = useState('recent')
  const [page, setPage] = useState(1)

  const customsList = useMemo(() => {
    const entries = Object.entries(customImages).filter(([, urls]) => urls?.length > 0)
    const withChars = entries.map(([name, urls]) => {
      const char = characters.find((c) => c.name === name) || { name, series: '', rank: '' }
      return { ...char, customCount: urls.length, customUrls: urls }
    })
    let filtered = withChars
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      if (searchMode === 'name') {
        filtered = withChars.filter((c) => c.name.toLowerCase().includes(q))
      } else {
        filtered = withChars.filter((c) => (c.series || '').toLowerCase().includes(q))
      }
    }
    if (sort === 'recent') filtered.sort((a, b) => b.customCount - a.customCount)
    if (sort === 'rank_asc') filtered.sort((a, b) => (parseInt(a.rank) || 9999) - (parseInt(b.rank) || 9999))
    if (sort === 'name_asc') filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    if (sort === 'name_desc') filtered.sort((a, b) => (b.name || '').localeCompare(a.name || ''))
    if (sort === 'series_asc') filtered.sort((a, b) => (a.series || '').localeCompare(b.series || ''))
    if (sort === 'count_desc') filtered.sort((a, b) => b.customCount - a.customCount)
    if (sort === 'count_asc') filtered.sort((a, b) => a.customCount - b.customCount)
    return filtered
  }, [customImages, characters, search, searchMode, sort])

  const totalPages = Math.ceil(customsList.length / PAGE_SIZE) || 1
  const paginatedList = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return customsList.slice(start, start + PAGE_SIZE)
  }, [customsList, page])

  const resetToPage1 = () => setPage(1)

  return (
    <div id="customsPage" className="customs-page">
      <h2>Browse Customs</h2>
      <div className="customs-controls" style={{ marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-input-wrapper" style={{ flex: '1 1 280px', minWidth: 0 }}>
          <input
            type="text"
            className="char-search-input"
            placeholder={searchMode === 'name' ? 'Search by name...' : 'Search by series...'}
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetToPage1() }}
            autoComplete="off"
          />
          <div className="search-toggle-wrapper search-toggle-visible">
            <span
              className={`toggle-label toggle-option ${searchMode === 'name' ? 'active' : ''}`}
              onClick={() => { setSearchMode('name'); resetToPage1() }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setSearchMode('name')}
            >
              Name
            </span>
            <span
              className={`toggle-label toggle-option ${searchMode === 'series' ? 'active' : ''}`}
              onClick={() => { setSearchMode('series'); resetToPage1() }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setSearchMode('series')}
            >
              Series
            </span>
          </div>
        </div>
        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value); resetToPage1() }}
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <p id="customsCount" style={{ color: '#666', marginBottom: '20px' }}>
        {customsList.length} characters with custom images. Showing page {page} of {totalPages}.
      </p>
      <div id="customsList" className="search-result-list">
        {paginatedList.map((c) => (
          <Link key={c.name} to={`/character/${encodeURIComponent(c.name)}`} className="customs-item-with-preview">
            <div className="customs-item-top">
              <img src={getImageUrl(c.image)} alt="" className="search-result-img" />
              <div className="search-result-info" style={{ flex: 1 }}>
                <h3>{c.name}</h3>
                {c.series && <p>{c.series}</p>}
                <p>
                  <span className="badge" style={{ display: 'inline-block', marginLeft: '8px', padding: '2px 8px', background: '#e9ecef', borderRadius: '4px', fontSize: '0.8rem' }}>
                    {c.customCount} images
                  </span>
                </p>
              </div>
            </div>
            {c.customUrls?.length > 0 && (
              <div className="customs-preview-row">
                {c.customUrls.slice(0, PREVIEW_COUNT).map((url) => (
                  <img key={url} src={getImageUrl(url)} alt="" className="customs-preview-thumb" />
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="customs-pagination">
          <button
            type="button"
            className="action-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Previous
          </button>
          <span className="pagination-info">Page {page} of {totalPages}</span>
          <button
            type="button"
            className="action-btn"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
