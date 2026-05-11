---
name: C — Arcade Pop
colors:
  primary: "#ff3df5"
  secondary: "#7cff5c"
  tertiary: "#5ce1ff"
  neutral: "#1a0d2a"
  surface: "#fff8e8"
  on-surface: "#1a0d2a"
  error: "#ff5c5c"
typography:
  headline-lg:
    fontFamily: "Fredoka"
    fontSize: 28px
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: 0.04em
  headline-md:
    fontFamily: "Fredoka"
    fontSize: 18px
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: 0.04em
  body-md:
    fontFamily: "Fredoka"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.4
  body-sm:
    fontFamily: "Fredoka"
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.35
  label-caps:
    fontFamily: "Fredoka"
    fontSize: 10px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: 0.08em
spacing:
  xs: 4px
  sm: 8px
  md: 14px
  lg: 22px
  xl: 36px
rounded:
  none: 0px
  sm: 8px
  md: 16px
  lg: 22px
  full: 9999px
components:
  hud-bubble:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 10px
  hud-value:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.headline-md}"
    padding: 0px
  build-wheel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 14px
  tower-button:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 8px
  tower-button-disabled:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.neutral}"
    rounded: "{rounded.md}"
    padding: 8px
  hit-spark:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
  modal-error:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.error}"
    rounded: "{rounded.lg}"
    padding: 22px
---

# Variant C — Arcade Pop

## Overview

Arcade Pop is a cartoon battlefield / slot-machine aesthetic: bouncy
speech-bubble HUD over a saturated indigo board, candy-orange path,
arcade-gold slot tokens, and toon-banded enemies and towers ringed by a
crisp black outline. Every interactive surface is a chunky paper bubble
with a bold ink stroke and a 2-4px shadow offset — the chrome is meant to
look like stickers stuck onto the screen. Hits explode in confetti and
comic-book stars.

## Colors

A neon trio (magenta / lime / cyan) anchored on a deep grape neutral and
laid against a paper-white surface. Arcade gold is the accent on coin-drop
elements (slot rims, HUD numerals). Errors use a soft red so a "lose" state
still reads warm rather than threatening.

- **Primary (#ff3df5):** Magenta. The dominant signal — header chips, hit
  confetti accent, build-cost badges. Reads as bubblegum.
- **Secondary (#7cff5c):** Lime. Used on lime-tower silhouettes, "go"
  states, and the second HUD bubble.
- **Tertiary (#5ce1ff):** Cyan. Cyan-tower silhouettes, the third HUD
  bubble, and the close-button background.
- **Neutral (#1a0d2a):** Deep grape. The clear color and the ink color for
  every border and label — every chrome element has a 2-3px stroke of this.
- **Surface (#fff8e8):** Warm paper. Background of every HUD bubble,
  build wheel, and tower button — the "sticker" base.
- **On-surface (#1a0d2a):** Same as neutral; ink-on-paper text.
- **Error (#ff5c5c):** Soft red for the lose modal. Saturated but not
  harsh — Saturday morning, not 3am.

## Typography

A single rounded-display family carries every level. Fredoka (or any
rounded sans) keeps the cartoon read consistent; Comic Sans MS is the
guaranteed fallback so the variant still works without webfonts.

- **Headlines:** Used on modal titles and the build-wheel header.
- **Body:** Tower stats and descriptions.
- **Label caps:** All-caps with light tracking for HUD labels (`GOLD`,
  `LIVES`, `WAVE`).
- **HUD numerals:** `headline-md` — chunky bold digits inside each bubble.

## Layout

The HUD is a row of three bouncy speech-bubble counters anchored to the
top-left of the canvas. Each bubble pops in with a squash/stretch easeOut,
60ms apart, so the eye reads `gold → lives → wave`. When a value updates
the numeral does a single squash-thump (220ms) to call attention.

The build menu is a radial wheel that bounces in around the selected
slot — the open animation rotates ~180° while scaling from 0.3 to 1, then
overshoots once and settles. `transform-origin` is anchored at the
slot-side corner so the rotation pivots from the slot itself, not from the
menu's center. Closing reverses the wheel.

Spacing follows an 8px scale (4px half-step for bubble insets). Border
radii are deliberately large (16-22px) so every surface reads as a sticker.

## Elevation & Depth

Depth is conveyed by **bold black outline + offset drop-shadow**, not by
emission or cast light. Every chrome element has a 2-3px ink border and a
2-5px solid black shadow offset to the lower-right — the comic-book
"floating sticker" effect. On the canvas, the outline pass traces the
silhouette of every dynamic object (towers, enemies, projectiles) in 2px
black so the shapes pop against the saturated background.

The outline pass is the only postprocess. No bloom, no scanlines, no
aberration — those would muddy the flat toon-banded read. Lighting is
flat: a strong ambient + a dim top-down directional, no shadows cast.

When `prefers-reduced-motion` is set, the outline pass still runs (it's
visual, not motion) but the HUD pop and wheel rotation collapse to a
fade-only state so motion-sensitive users get a static read.

## Shapes

Large rounded rectangles (16-22px radius) for HUD bubbles and the build
wheel — pill-leaning shapes everywhere. Sharp corners are reserved for the
ink outlines on dynamic objects. Hit confetti uses thin rectangles; star
sparks use 5-point flat polygons.

## Components

- **hud-bubble:** Paper-white background, ink border, offset shadow.
  Houses one HUD stat each (gold/lives/wave). Three of these per HUD;
  background tint cycles gold → lime → cyan.
- **hud-value:** Bold ink digits inside each bubble; squashes on update.
- **build-wheel:** Paper-white radial frame, ink border, offset shadow.
  Rotates in around the selected slot.
- **tower-button / tower-button-disabled:** Paper buttons with ink
  borders and a hover lift; disabled state dims the shadow.
- **hit-spark:** Confetti rectangles + 5-point stars (rendered in 3D, not
  CSS — included here so the token system records the palette).
- **modal-error:** Paper frame with soft red title.

## Do's and Don'ts

- Do keep every chrome element on a paper-white sticker with an ink
  border — that contract carries the look.
- Do let the outline pass do the work for dynamic objects; flat-shaded
  meshes without an outline read as broken.
- Do reserve magenta/lime/cyan for the saturated accents and arcade gold
  for coin-drop elements (slots, HUD bubbles).
- Don't add bloom, scanlines, or chromatic aberration — the outline pass
  is the only postprocess.
- Don't introduce a second font family; one rounded display carries the
  look.
- Don't paint the ground in a desaturated hue — the indigo board is the
  contrast surface that lets the neon dynamic objects pop.
- Do respect `prefers-reduced-motion`: HUD pop and wheel spin collapse to
  a fade; the outline pass stays on.
