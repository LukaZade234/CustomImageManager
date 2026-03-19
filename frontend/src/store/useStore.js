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
}))
