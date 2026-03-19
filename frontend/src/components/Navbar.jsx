import { Link } from 'react-router-dom'
import SearchBar from './SearchBar'

export default function Navbar() {
  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span>ImgManager</span>
      </Link>
      <div className="navbar-center">
        <SearchBar />
      </div>
      <div className="navbar-right">
        <Link to="/add" className="btn-add-char">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Add Character</span>
        </Link>
        <Link to="/customs" className="btn-saved">Customs</Link>
        <Link to="/saved" className="btn-saved">Saved</Link>
      </div>
    </nav>
  )
}
