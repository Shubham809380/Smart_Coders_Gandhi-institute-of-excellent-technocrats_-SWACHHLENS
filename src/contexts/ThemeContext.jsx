import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeCtx = createContext(null);

const STORAGE_KEY = 'swachhlens-theme';
const VALID_MODES = ['light', 'dark'];
const DEFAULT_MODE = 'dark';

function getStoredMode() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (VALID_MODES.includes(stored)) return stored;
  } catch {}
  // First visit: follow the OS preference instead of forcing dark.
  try {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  } catch {}
  return DEFAULT_MODE;
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(getStoredMode);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#0B1220' : '#F5F7FA');
    try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
  }, [mode]);

  const setThemeMode = useCallback((newMode) => {
    if (VALID_MODES.includes(newMode)) setMode(newMode);
  }, []);

  return (
    <ThemeCtx.Provider value={{ mode, resolved: mode, isDark: mode === 'dark', setThemeMode }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) return { mode: DEFAULT_MODE, resolved: DEFAULT_MODE, isDark: true, setThemeMode: () => {} };
  return ctx;
}
