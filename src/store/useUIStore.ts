import { create } from 'zustand';

type ThemeMode = 'dark';

interface UIState {
  themeMode: ThemeMode;
  isOffline: boolean;
  setIsOffline: (isOffline: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  themeMode: 'dark',
  isOffline: false,
  setIsOffline: (isOffline) => set({ isOffline })
}));
