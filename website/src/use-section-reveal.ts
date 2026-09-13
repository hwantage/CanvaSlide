import { useEffect } from 'react'

export function useSectionReveal() {
  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>('[data-reveal]')
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    if (motion.matches || !('IntersectionObserver' in window)) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.12 }
    )
    for (const section of sections) {
      if (section.getBoundingClientRect().top > window.innerHeight) {
        section.classList.add('will-reveal')
        observer.observe(section)
      }
    }
    return () => {
      observer.disconnect()
      sections.forEach((section) => section.classList.remove('will-reveal'))
    }
  }, [])
}
