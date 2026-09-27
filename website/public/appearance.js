;(() => {
  let theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  try {
    const saved = localStorage.getItem('canvaslide-site-theme')
    if (saved === 'light' || saved === 'dark') {
      theme = saved
    }
  } catch {
    /* Preferences are optional when storage is unavailable. */
  }
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
})()
