import { useEffect, useState } from 'react'

/**
 * Persists dark-mode preference in localStorage and syncs it with the
 * .dark class on <html>. Defaults to the OS preference on first visit.
 *
 * Works alongside Tailwind's class-based dark variant (@variant dark in index.css).
 */
export default function useDarkMode() {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false
    return (
      localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
    )
  })

  useEffect(() => {
    const root = document.documentElement
    if (dark) {
      root.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [dark])

  return [dark, setDark]
}
