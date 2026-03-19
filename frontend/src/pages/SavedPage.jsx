import { Link } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { getImageUrl } from '../api'

export default function SavedPage() {
  const savedCharacters = useStore((s) => s.savedCharacters)
  const characters = useStore((s) => s.characters)
  const removeSaved = useStore((s) => s.removeSaved)

  const getCharImage = (name) => {
    const c = characters.find((x) => x.name === name)
    return c ? getImageUrl(c.image) : ''
  }

  const handleUnsave = async (e, name) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await removeSaved(name)
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="saved-page">
      <h2>Saved Characters</h2>
      <p className="subtitle">Your bookmarked characters.</p>
      {savedCharacters.length === 0 ? (
        <p className="empty">No saved characters yet.</p>
      ) : (
        <div className="saved-grid">
          {savedCharacters.map((char) => (
            <Link key={char.name} to={`/character/${encodeURIComponent(char.name)}`} className="saved-card">
              <div className="saved-card-image">
                {getCharImage(char.name) ? (
                  <img src={getCharImage(char.name)} alt={char.name} />
                ) : (
                  <div className="no-image">No Image</div>
                )}
                <button
                  className="unsave-btn"
                  onClick={(e) => handleUnsave(e, char.name)}
                  title="Unsave"
                >
                  ×
                </button>
              </div>
              <h4>{char.name}</h4>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
