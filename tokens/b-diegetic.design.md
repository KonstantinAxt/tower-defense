---
name: B — Diegetic Warm
colors:
  primary: "#ffb454"
  secondary: "#a06a2a"
  tertiary: "#6d4a2a"
  neutral: "#2a1f15"
  surface: "#3a2a1c"
  on-surface: "#f3e3c2"
  error: "#c04030"
typography:
  headline-lg:
    fontFamily: "IM Fell English SC"
    fontSize: 26px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: 0.04em
  headline-md:
    fontFamily: "IM Fell English SC"
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.06em
  body-md:
    fontFamily: "Cormorant Garamond"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
  body-sm:
    fontFamily: "Cormorant Garamond"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.35
  label-caps:
    fontFamily: "IM Fell English SC"
    fontSize: 10px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.16em
spacing:
  xs: 4px
  sm: 8px
  md: 14px
  lg: 22px
  xl: 36px
rounded:
  none: 0px
  sm: 3px
  md: 6px
  lg: 10px
  full: 9999px
components:
  hud-plaque:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 10px
  hud-value:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-surface}"
    typography: "{typography.headline-md}"
    padding: 0px
  build-cog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.full}"
    padding: 14px
  tower-button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    padding: 8px
  tower-button-disabled:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.secondary}"
    rounded: "{rounded.sm}"
    padding: 8px
  hit-spark:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
  modal-error:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.error}"
    rounded: "{rounded.md}"
    padding: 22px
---

# Variant B — Diegetic Warm

## Overview

Diegetic Warm is a tabletop diorama / miniature aesthetic: hand-painted
figures on a varnished wood board lit by a warm bulb above. Where Variant A
emits its own light, Variant B is *lit* — every surface picks up a warm sun
from the upper-left and casts a soft contact shadow on the ground. The
chrome is mounted *into* the world: a small brass plaque tacked to the
upper-left of the board, a build menu that flips open as a brass cogwheel
out of the slot the player just clicked. No postprocess; lighting alone
carries the look.

## Colors

A single warm-amber accent over wood and aged brass. Dark green is avoided —
the diorama is varnished pine, not a forest.

- **Primary (#ffb454):** Warm amber. The dominant signal — HUD numerals,
  brass rims, cogwheel teeth, projectile cores. Reads as polished metal
  catching the sun.
- **Secondary (#a06a2a):** Aged brass / dim amber for sub-labels, off-state
  buttons, and bevelled rims that aren't catching direct light.
- **Tertiary (#6d4a2a):** Stained walnut. Used for the HUD plaque
  background, modal frames, and any surface meant to read as wood.
- **Neutral (#2a1f15):** Burnt umber. The renderer clear color — a deep,
  dim shade so the warm sun is what the eye notices, not the background.
- **Surface (#3a2a1c):** Slightly elevated wood — used for the build cog
  body and tower button backgrounds.
- **On-surface (#f3e3c2):** Parchment / aged paper for body copy.
- **Error (#c04030):** Faded red — sealing-wax, not warning-light.

## Typography

A serif/small-caps pairing evoking a hand-stamped board-game manual. The
small-caps face carries headlines and the HUD; the serif body text fills
descriptions. System serif is a guaranteed fallback.

- **Headlines:** IM Fell English SC (or any small-caps serif). Used on
  modals and the build-cog header.
- **Body:** Cormorant Garamond (or system serif). Tower descriptions and
  modal copy.
- **Label caps:** Small-caps with generous tracking for HUD labels (`GOLD`,
  `LIVES`, `WAVE`).
- **HUD numerals:** `headline-md` — amber digits on stained walnut.

## Layout

The HUD is a brass plaque mounted at the upper-left of the canvas, anchored
inside the stage so it reads as part of the diorama, not as overlay chrome.
Internal padding is 10px; the plaque has a 1px brass bevel and a soft
ground-shadow underneath.

The build menu is a circular brass cogwheel. When the player clicks a slot
the cog rotates into view (~280ms) and reveals the tower options arranged
inside its body; closing reverses the rotation. The "rotate out of the
slot" affordance is the diegetic link between the slot and its menu.

Spacing follows an 8px scale (4px half-step for plaque insets).

## Elevation & Depth

Depth is conveyed by **warm directional sun + soft contact shadow**, not by
emission. A directional light positioned upper-left at ~50° elevation sets
the dominant cast, with a low-intensity ambient fill from the opposite side
so the unlit faces don't go fully black. Each tower and enemy gets a
soft-edged disc shadow underneath (a flat circular plane with a radial
gradient texture) — the diorama equivalent of a contact shadow without
paying for a real shadow map.

No postprocess. No bloom, no scanlines, no aberration. The look comes from
the lighting, the materials, and the model silhouettes.

## Shapes

Soft rounded rectangles (3-6px radius) for plaque and modal frames. The
cogwheel is the only fully-circular form and reserved for the build menu.

## Components

- **hud-plaque:** Wood-stained background, parchment text, soft shadow
  beneath. Mounted at the upper-left of the canvas.
- **hud-value:** Amber digits on stained walnut, IM Fell English SC.
- **build-cog:** Circular brass body with stained-wood interior. Houses the
  tower options when open.
- **tower-button / tower-button-disabled:** Wood plaques with parchment
  copy; disabled state dims the text to aged brass.
- **hit-spark:** Small smoke + brass-shell motif used for impact and death
  bursts (rendered in 3D, not as a CSS component — included here so the
  token system records its palette).
- **modal-error:** Wood frame with sealing-wax red text for win/lose
  modals.

## Do's and Don'ts

- Do let the warm sun do the work. A flat-shaded surface in this variant
  reads as broken.
- Do mount the HUD into the scene (anchored to the stage, not floated
  free). The plaque should feel *attached*.
- Do reserve the cogwheel form for the build menu — circles are loud here.
- Don't introduce neon or saturated cyan; the palette is wood and brass.
- Don't add postprocess (bloom, scanlines, aberration). Lighting carries
  this variant.
- Don't paint the ground as solid green. The board is varnished pine.
- Do respect `prefers-reduced-motion`: the cogwheel rotation collapses to a
  fade.
