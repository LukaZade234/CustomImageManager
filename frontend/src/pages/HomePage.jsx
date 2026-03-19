import { useStore } from '../store/useStore'

export default function HomePage() {
  const characters = useStore((s) => s.characters)
  const customImages = useStore((s) => s.customImages)
  const loading = useStore((s) => s.loading)
  const error = useStore((s) => s.error)

  const totalImages = Object.values(customImages).reduce((sum, arr) => sum + (arr?.length || 0), 0)
  const charsWithCustoms = Object.keys(customImages).filter((k) => (customImages[k]?.length || 0) > 0).length

  if (loading) return <div className="loading">Loading...</div>
  if (error) return <div className="loading" style={{ color: '#dc3545' }}>Failed to load: {error}</div>

  return (
    <div id="uploadSection" className="home-page">
      <h2>Welcome to ImgManager</h2>
      <p style={{ color: '#666', marginBottom: '30px', fontSize: '1.1em', lineHeight: 1.6 }}>
        The ultimate tool for managing your character collection. Customize your favorite characters with ease,
        organize unlimited custom images, and generate bulk commands instantly.
      </p>
      <div className="stats-dashboard">
        <div className="stat-card">
          <div className="stat-icon image-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <div className="stat-info">
            <span className="stat-value">{totalImages}</span>
            <span className="stat-label">Custom Images</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon char-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div className="stat-info">
            <span className="stat-value">{charsWithCustoms}</span>
            <span className="stat-label">Characters Customized</span>
          </div>
        </div>
      </div>
      <div className="features-box" style={{ textAlign: 'left', maxWidth: '700px', margin: '0 auto', background: '#f8f9fa', padding: '25px', borderRadius: '12px', border: '1px solid #e9ecef' }}>
        <h4 style={{ marginTop: 0, color: '#212529', fontSize: '1.2em', borderBottom: '1px solid #dee2e6', paddingBottom: '10px', marginBottom: '15px' }}>Key Features & Guide:</h4>
        <ul style={{ color: '#555', lineHeight: 1.8, paddingLeft: '20px' }}>
          <li><strong>Search & Discover:</strong> Find characters instantly by Name or Series using the smart search bar.</li>
          <li><strong>Full Customization:</strong> Upload unlimited custom images (all formats supported, including GIFs). Drag & drop images in, reorder your gallery, or remove images.</li>
          <li><strong>Bot Commands:</strong> Use the <strong>&quot;Get $ai Command&quot;</strong> tool to select images and generate bulk <code>$ai</code> strings for Mudae automatically.</li>
          <li><strong>Personal Collection:</strong> Bookmark characters to your <strong>Saved</strong> list for quick access and management.</li>
          <li><strong>Expand Database:</strong> Missing a character? Use the <strong>Add Character</strong> feature to register them immediately.</li>
        </ul>
      </div>
    </div>
  )
}
