import { Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import { useStore } from './store/useStore'
import Navbar from './components/Navbar'
import HomePage from './pages/HomePage'
import SavedPage from './pages/SavedPage'
import AddPage from './pages/AddPage'
import CustomsPage from './pages/CustomsPage'
import CharacterPage from './pages/CharacterPage'
import './App.css'

function App() {
  const loadCharacters = useStore((s) => s.loadCharacters)
  const loadSaved = useStore((s) => s.loadSaved)
  const loadCustomImages = useStore((s) => s.loadCustomImages)

  useEffect(() => {
    loadCharacters()
    loadSaved()
    loadCustomImages()
  }, [loadCharacters, loadSaved, loadCustomImages])

  return (
    <>
      <Navbar />
      <main className="container">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/saved" element={<SavedPage />} />
          <Route path="/add" element={<AddPage />} />
          <Route path="/customs" element={<CustomsPage />} />
          <Route path="/character/:name" element={<CharacterPage />} />
        </Routes>
      </main>
    </>
  )
}

export default App
