// Subject colours live in TWO places: as design tokens (`--color-subject-1..8`
// in globals.css, which the light media query re-paints for free) and as
// per-row user data — a hex string on each materia/carrera applied via inline
// `style`. Inline styles never hear about a media query, so the stored dark
// hex would stay dark on a light canvas. This mapping is the runtime half of
// the light palette: the same eight dark→light pairs the CSS declares, applied
// at the render sites the CSS cannot reach.
//
// Keys are lowercase because stored rows are not case-normalized (the picker
// writes uppercase, older seeds are lowercase); values are the design's
// AA-verified light palette and must match globals.css exactly.
const DARK_TO_LIGHT: Record<string, string> = {
  '#4c8dff': '#2563EB',
  '#22d3ee': '#0891B2',
  '#fb923c': '#EA580C',
  '#a3e635': '#65A30D',
  '#f472b6': '#DB2777',
  '#e879f9': '#C026D3',
  '#34d399': '#059669',
  '#facc15': '#CA8A04'
}

/**
 * The stored subject colour, adapted to the active colour scheme. Dark is the
 * stored form, so it passes through; light maps the eight catalogued hues and
 * leaves any custom colour alone — a colour the user typed is theirs.
 */
export function subjectColorForScheme(hex: string, scheme: 'dark' | 'light'): string {
  if (scheme === 'dark') {
    return hex
  }
  return DARK_TO_LIGHT[hex.toLowerCase()] ?? hex
}
