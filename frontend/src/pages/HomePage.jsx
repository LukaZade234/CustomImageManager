import { useStore } from '../store/useStore'

export default function HomePage() {
  const characters = useStore((s) => s.characters)
  const customImages = useStore((s) => s.customImages)
  const loading = useStore((s) => s.loading)

  const totalImages = Object.values(customImages).reduce((sum, arr) => sum + (arr?.length || 0), 0)
  const charsWithCustoms = Object.keys(customImages).filter((k) => (customImages[k]?.length || 0) > 0).length

  if (loading) return <div className="loading">Loading...</div>

  return (
    <div className="home-page">
      <h2>Welcome to ImgManager</h2>
      <p className="subtitle">
        Manage your character collection. Customize characters with images, organize, and generate bulk commands.
      </p>
      <div className="stats-dashboard">
        <div className="stat-card">
          <span className="stat-value">{totalImages}</span>
          <span className="stat-label">Custom Images</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{charsWithCustoms}</span>
          <span className="stat-label">Characters Customized</span>
        </div>
      </div>
      <div className="features-box">
        <h4>Key Features</h4>
        <ul>
          <li><strong>Search:</strong> Find characters by Name or Series</li>
          <li><strong>Custom Images:</strong> Upload, reorder, drag & drop</li>
          <li><strong>$ai Commands:</strong> Generate Mudae commands</li>
          <li><strong>Saved:</strong> Bookmark your favorites</li>
          <li><strong>Add Character:</strong> Add new characters to the database</li>
        </ul>
      </div>
    </div>
  )
}
