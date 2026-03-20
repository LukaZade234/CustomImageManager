import { create } from 'zustand'
import { apiClient } from '../api'

export const useStore = create((set, get) => ({
  characters: [],
  savedCharacters: [],
  lastUpdated: {},
  customImages: {},
  currentCharacter: null,
  loading: false,
  error: null,
  darkMode: typeof localStorage !== 'undefined' ? localStorage.getItem('darkMode') === 'true' : false,

  setDarkMode: (v) => {
    set({ darkMode: v })
    if (typeof document !== 'undefined') document.body.classList.toggle('dark-mode', v)
    if (typeof localStorage !== 'undefined') localStorage.setItem('darkMode', v ? 'true' : 'false')
  },
  toggleDarkMode: () => {
    const v = !get().darkMode
    get().setDarkMode(v)
  },

  loadCharacters: async () => {
    set({ loading: true, error: null })
    try {
      const data = await apiClient.getCharacters()
      set({ characters: data || [], loading: false })
      return data
    } catch (e) {
      set({ error: e.message, loading: false })
      return []
    }
  },

  loadSaved: async () => {
    try {
      const saved = await apiClient.getSaved()
      const lastUpd = await apiClient.getLastUpdated()
      set({ savedCharacters: saved || [], lastUpdated: lastUpd || {} })
      const sorted = [...(saved || [])].sort((a, b) => (lastUpd[b.name] || 0) - (lastUpd[a.name] || 0))
      set({ savedCharacters: sorted })
    } catch (e) {
      set({ savedCharacters: [] })
    }
  },

  loadCustomImages: async () => {
    try {
      const data = await apiClient.getCustomImages()
      set({ customImages: data || {} })
    } catch (e) {
      set({ customImages: {} })
    }
  },

  saveCharacter: async (char) => {
    await apiClient.saveCharacter(char)
    await get().loadSaved()
  },

  removeSaved: async (name) => {
    await apiClient.removeSaved(name)
    await get().loadSaved()
  },

  setCurrentCharacter: (char) => set({ currentCharacter: char }),
  clearCurrentCharacter: () => set({ currentCharacter: null }),

  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q || '' }),
  searchMode: 'name',
  searchSort: 'rank',
  setSearchMode: (m) => set({ searchMode: m }),
  setSearchSort: (s) => set({ searchSort: s }),

  toasts: [],
  /**
   * @param {string} msg
   * @param {'success'|'error'|'info'} [type]
   * @param {{ onUndo?: () => void | Promise<void>, undoLabel?: string, duration?: number }} [options]
   *   — when `onUndo` is set, default duration is longer so the user can tap Undo.
   */
  addToast: (msg, type = 'info', options = {}) => {
    const id = Date.now() + Math.random()
    const { onUndo, undoLabel = 'Undo', duration } = options
    const ms = typeof duration === 'number' ? duration : onUndo ? 8000 : 4000
    set((s) => ({ toasts: [...s.toasts, { id, msg, type, onUndo, undoLabel }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms)
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
