---
name: A — Holographic Terminal
colors:
  primary: "#5ce1ff"
  secondary: "#2a8aa8"
  tertiary: "#ff5ce1"
  neutral: "#000814"
  surface: "#001423"
  on-surface: "#5ce1ff"
  error: "#ff5050"
typography:
  headline-lg:
    fontFamily: "Share Tech Mono"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: 0.06em
  headline-md:
    fontFamily: "Share Tech Mono"
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.08em
  body-md:
    fontFamily: "Share Tech Mono"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Share Tech Mono"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  label-caps:
    fontFamily: "Share Tech Mono"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.18em
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
rounded:
  none: 0px
  sm: 2px
  md: 4px
  lg: 8px
  full: 9999px
components:
  hud-panel:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 8px
  hud-value:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    typography: "{typography.headline-md}"
    padding: 0px
  build-menu-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 12px
    width: 220px
  tower-button:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: 8px
  tower-button-disabled:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.secondary}"
    rounded: "{rounded.sm}"
    padding: 8px
  hit-spark:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.tertiary}"
    rounded: "{rounded.sm}"
  modal-error:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.error}"
    rounded: "{rounded.md}"
    padding: 24px
---

# Variant A — Holographic Terminal

## Overview

Holographic Terminal is a sci-fi command-deck aesthetic: cyan glyphs floating
on a near-black void, suggesting a Tron grid, Dead Space rig diagnostics, or
Mass Effect omni-tool. Every interactive surface emits its own light. The
chrome should feel projected — translucent, additive, slightly volatile — not
painted onto the screen.

## Colors

The palette is a single saturated accent (cyan) on a deep void neutral. Magenta
is used sparingly as a glitch accent for hit feedback so the player still
reads at-a-glance which signal is structural and which is incidental.

- **Primary (#5ce1ff):** Holographic cyan. The dominant signal — used for HUD
  numerals, build-menu chrome, slot rings, tower silhouettes, and projectile
  cores. Always emissive, never a flat fill.
- **Secondary (#2a8aa8):** Dim cyan for grid lines, sub-labels, and disabled
  affordances. A literal "off-state" of the primary.
- **Tertiary (#ff5ce1):** Magenta glitch spark. Reserved for hit / death
  particles where the engine wants to cut through cyan dominance.
- **Neutral (#000814):** Void blue-black. The renderer clear color, scene
  background, and behind-glass surface for HUD/menu panels.
- **Surface (#001423):** Slightly elevated translucent surface for cards.
- **On-surface (#5ce1ff):** Text and iconography on surfaces — same as primary
  to maintain the single-light-source illusion.

## Typography

A single monospace family carries every level. Real holographic terminals
show one font; varying weight + tracking — not family — does the work. Share
Tech Mono is the canonical face; system monospace is a guaranteed fallback.

- **Headlines:** Used sparingly for modal titles. Slight letter-spacing
  reinforces the broadcast feel.
- **Body:** Read everywhere — tower stats, descriptions.
- **Label caps:** All-caps with generous tracking for HUD labels (`GOLD`,
  `LIVES`, `WAVE`).
- **HUD numerals:** Use `headline-md` — large, monospaced, glowing.

## Layout

The HUD is an orthographic overlay anchored to the canvas's top-left, on top
of the WebGL surface. It does not participate in the 3D scene transform — it
floats in front. The build menu is a 3D card that flies in ~200px from the
selected slot when the player clicks it; that "200px from the slot" is the
diegetic affordance that links the menu to the slot it controls.

Spacing follows an 8px scale (4px half-step for HUD insets). Cards have 12px
internal padding to keep the chrome thin.

## Elevation & Depth

Depth is conveyed by **emission and bloom**, not shadows. Important elements
are *brighter*, not "higher". The composer pipeline contributes:

- **Bloom** (UnrealBloomPass: strength 1.2, radius 0.7, threshold 0.18) — every
  emissive surface glows.
- **Scanlines / film grain** (FilmShader, intensity 0.45) — implies a CRT.
- **Chromatic aberration** (RGBShiftShader, amount 0.0025) — implies a lens.

When `prefers-reduced-motion` is set, the entire postprocess chain is skipped
so users sensitive to flicker get a flat, scan-free render.

## Shapes

Sharp 2-4px corners. Holograms are projected onto rectangles, never pills.

## Components

The core components above (`hud-panel`, `hud-value`, `build-menu-card`,
`tower-button`, `tower-button-disabled`) compose the entire UI. All inherit
the cyan-on-void contract from primary + neutral.

## Do's and Don'ts

- Do keep every interactive surface emissive. A flat-shaded surface in this
  variant reads as broken.
- Do reserve magenta for incidental glitch sparks; never use it for primary
  affordances or HUD chrome.
- Don't introduce a second font family. One monospace family carries the look.
- Don't add drop shadows — depth comes from bloom, not from cast light.
- Don't paint the ground as a solid color. The grid is the ground.
- Do disable the postprocess chain under `prefers-reduced-motion`.
