import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeCtx = createContext(null);

const STORAGE_KEY = 'swachhlens-theme';
const VALID_MODES = ['light', 'dark', 'system'];

function getSystemTheme() {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredMode() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (VALID_MODES.includes(stored)) return stored;
  } catch {}
  return 'system';
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(getStoredMode);
  const [resolved, setResolved] = useState(() => mode === 'system' ? getSystemTheme() : mode);

  const applyTheme = useCallback((theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0B1220' : '#F5F7FA');
  }, []);

  useEffect(() => {
    const resolvedTheme = mode === 'system' ? getSystemTheme() : mode;
    setResolved(resolvedTheme);
    applyTheme(resolvedTheme);
    try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
  }, [mode, applyTheme]);

  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => {
      const next = e.matches ? 'dark' : 'light';
      setResolved(next);
      applyTheme(next);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode, applyTheme]);

  const setThemeMode = useCallback((newMode) => {
    if (VALID_MODES.includes(newMode)) setMode(newMode);
  }, []);

  return (
    <ThemeCtx.Provider value={{ mode, resolved, isDark: resolved === 'dark', setThemeMode }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) return { mode: 'dark', resolved: 'dark', isDark: true, setThemeMode: () => {} };
  return ctx;
}
