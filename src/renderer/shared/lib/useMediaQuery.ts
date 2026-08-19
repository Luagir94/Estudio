// Window-size awareness for an app that is NOT a website: the window is a
// desktop window the user resizes freely, so "responsive" here means the
// layout answers the window, not a device catalogue.
//
// Tailwind's `lg:`/`xl:` prefixes cover everything that is purely visual.
// This hook exists for the one case a class cannot express: the sidebar has
// to KNOW it is collapsed, because the rail renders different markup (labels
// become tooltips), not just different styles.
import { useEffect, useState } from 'react'

function matches(query: string): boolean {
  // jsdom has no `matchMedia`, and neither does the first render of any
  // environment that ever pre-renders. Answering `false` there means "the
  // window is not narrow", which is the correct default for a 1280x800
  // desktop window.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia(query).matches
}

/** Live answer to a CSS media query. Re-renders when the window crosses it. */
export function useMediaQuery(query: string): boolean {
  const [isMatch, setIsMatch] = useState(() => matches(query))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const mediaQueryList = window.matchMedia(query)
    // Re-read on subscribe: the window can have been resized between the
    // initial state and this effect.
    setIsMatch(mediaQueryList.matches)

    const handleChange = (event: MediaQueryListEvent): void => setIsMatch(event.matches)
    mediaQueryList.addEventListener('change', handleChange)
    return () => mediaQueryList.removeEventListener('change', handleChange)
  }, [query])

  return isMatch
}
