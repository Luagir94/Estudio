// The interaction layer of the design system.
//
// `globals.css` owns the design's STATIC language (color, type, radius);
// this file owns its BEHAVIOUR — how a clickable surface answers the mouse
// and the keyboard. Before it existed, "does this react to hover?" was a
// per-component decision, so 27 files rendered something clickable and only
// 5 of them reacted. Every clickable now imports its state story from here.
//
// Two things deliberately do NOT live in this file:
//
// 1. The cursor. Tailwind v4's preflight dropped the `cursor: pointer` that
//    v3 put on `<button>`, so it is restored once as a base rule in
//    `globals.css` for every clickable element in the app — including the
//    ones written after this pass, which is the whole point. A call site
//    that has to remember `cursor-pointer` will eventually forget it.
//
// 2. Motion opt-out. `prefers-reduced-motion` is also handled globally in
//    `globals.css`, so no class below has to guard its own transition.
//
// Focus uses `outline` rather than shadcn's `ring` + `ring-offset-*`. A ring
// offset paints an OPAQUE band in a colour it has to be told, and the same
// Button renders on the canvas, on a card and inside a dialog footer — one
// of those three would always be wrong. `outline-offset` leaves that band
// transparent, so a single declaration is correct on every background.
export const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

/**
 * The same ring, drawn by a COMPOSED field's wrapper instead of by the
 * control itself.
 *
 * Three fields in the app are a frame holding an icon or a suffix beside a
 * bare `<input>` — the parcial's `#` nota, the materia's `%` asistencia, the
 * Ask composer. The inner control cannot own the ring there: outlining the
 * input alone would draw a box INSIDE the box the user already reads as the
 * field. So all three killed the outline — and none of them replaced it,
 * which is how the keyboard lost every trace of where it was standing on the
 * three fields the app hand-builds instead of using the `Input` primitive.
 *
 * `focus-within` is the fix and the whole reason this is a second constant:
 * it fires on the wrapper when anything inside it takes focus, so the ring
 * lands on the perceived field. Not `:focus-visible`-gated, because the
 * wrapper is never itself focusable — the gate belongs to the control, and
 * the control is the one thing here that is always reached by keyboard or by
 * a click that lands in a text field, where a ring is wanted either way.
 */
export const focusRingWithin = 'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring'

/**
 * Base for every class below: one 150ms transition plus the focus ring.
 *
 * The animated properties are listed explicitly rather than via
 * `transition-all`, which would also animate layout properties (width,
 * padding, ...) and make any reflow visibly crawl. `box-shadow` is in the
 * list because that is what Tailwind's `ring-*` compiles to.
 *
 * Compose this directly when a call site needs a hover rule the named
 * classes below do not cover.
 */
export const interactive =
  'transition-[color,background-color,border-color,text-decoration-color,box-shadow,opacity] ' +
  `duration-150 ease-out ${focusRing}`

/**
 * Clickable card, list row or grid tile — the whole box is the target, so the
 * whole box lifts one step up the surface scale on hover (`bg-card` →
 * `bg-muted`, i.e. the design's `$surface` → `$surface-sunken`) and settles
 * back down on press.
 *
 * Only for surfaces that NAVIGATE. Anything carrying a selected state uses
 * `interactiveChip`, because a hover fill would paint over that state.
 */
export const interactiveSurface = `${interactive} hover:bg-muted active:bg-muted/60`

/**
 * Toggle chip, segmented option, radio-style card — anything whose SELECTED
 * state is already painted with a fill, a border and an ink colour.
 *
 * Hover is a ring, and that is the whole point: a ring is ADDITIVE. Every
 * other channel is already spoken for, so a `hover:bg-*` or `hover:text-*`
 * here would repaint the selection and make the chosen option read as
 * unchosen for as long as the mouse rested on it. A ring stacks on top of
 * either state and reads as "more prominent" from both. It is drawn as a
 * box-shadow, so it also costs no layout.
 */
export const interactiveChip = `${interactive} hover:ring-1 hover:ring-primary/60 active:opacity-80`

/** Icon button or bare text button: no box to fill, so only the ink reacts. */
export const interactiveGhost = `${interactive} hover:text-foreground active:text-foreground/70`

/** Same shape as `interactiveGhost`, for the destructive icon buttons (delete). */
export const interactiveGhostDestructive = `${interactive} hover:text-destructive active:text-destructive/70`

/** Text that leaves the app (campus URL). Underline is the web's own affordance for it. */
export const interactiveLink = `${interactive} hover:underline hover:underline-offset-2 active:opacity-80`

/**
 * Colour swatch. It has no text and no border to react with — the only
 * channels left are transform and opacity, which are also the only two
 * properties worth animating (compositor-only, no layout work).
 */
export const interactiveSwatch = `transition-transform duration-150 ease-out hover:scale-110 active:scale-95 ${focusRing}`
