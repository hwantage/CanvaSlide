;(() => {
  let theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  let language = 'en'
  try {
    const saved = localStorage.getItem('canvaslide-site-theme')
    if (saved === 'light' || saved === 'dark') {
      theme = saved
    }
    if (localStorage.getItem('canvaslide-site-language') === 'ko') {
      language = 'ko'
    }
  } catch {
    /* Preferences are optional when storage is unavailable. */
  }
  const requested = new URLSearchParams(location.search).get('lang')
  if (requested === 'en' || requested === 'ko') {
    language = requested
  }
  document.documentElement.dataset.theme = theme
  document.documentElement.lang = language
  document.documentElement.style.colorScheme = theme
})()
