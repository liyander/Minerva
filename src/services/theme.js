const THEME_KEY = 'incognitrix_theme'

export function getSavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') {
      return saved
    }
  } catch {
    // Ignore storage errors.
  }

  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }

  return 'light'
}

export function applyTheme(theme) {
  const safeTheme = theme === 'dark' ? 'dark' : 'light'
  document.documentElement.classList.toggle('dark', safeTheme === 'dark')
  document.documentElement.setAttribute('data-theme', safeTheme)

  try {
    localStorage.setItem(THEME_KEY, safeTheme)
  } catch {
    // Ignore storage errors.
  }

  return safeTheme
}

export function initializeTheme() {
  return applyTheme(getSavedTheme())
}

export function toggleTheme(currentTheme) {
  return applyTheme(currentTheme === 'dark' ? 'light' : 'dark')
}
