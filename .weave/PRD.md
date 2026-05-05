# Tower Defense — Stretch Scope PRD

## Problem
Exercise weave end-to-end by turning a pre-seeded Vite+TS scaffold into a playable side-view tower defense game using Kenney assets. No human code edits mid-run.

## Approach
**Canvas2D + lightweight ECS core.** Single `<canvas>` renderer driven by a fixed-timestep game loop (`requestAnimationFrame` + accumulator). A small ECS (entities as numeric IDs, plain-object components, pure-function systems) lives in `src/ecs/`. A centralized `World` holds entities, components, wave state, economy, lives, and run status. DOM overlay handles HUD (money/lives/wave), pause button, build menu, Save/Load buttons, and win/lose modals. Hand-rolled Web Audio and procedural particle modules. Wave definitions and the level layout live in data modules.

## Scope
- Side-view rendering with Kenney tower-defense sprites from `assets/kenney/`.
- Single fixed polyline path hardcoded in a level module; towers placed on fixed ground build slots.
- 10 waves, linear scaling in enemy count and HP; final wave is a denser mixed wave (no boss).
- 2 enemy types (e.g., fast light + slow heavy) with path-following, HP, and death particles.
- 3 tower types: Cannon (single-target high-damage), MG (fast low-damage), Mortar (slow AoE splash). Each has 2 upgrade tiers.
- Economy (gold from kills, tower cost + upgrade cost), lives (drain on leak), win (all waves cleared) / lose (lives ≤ 0) states.
- Pause toggle (freezes fixed-step update but keeps render).
- Save/Load between-wave checkpoints via localStorage: auto-save after each wave; manual Save/Load buttons.
- Hand-rolled Web Audio SFX (shot, hit, build, upgrade, enemy death, wave start, win, lose).
- Procedural particle effects (muzzle flash, impact, explosion, enemy death).
- Playwright gameplay E2E as the final slice, plus smoke staying green throughout.

## Out of Scope
- Multiple levels / branching paths / free-placement towers.
- Boss enemies, enemy abilities, status effects.
- Networking, leaderboards, achievements.
- Mobile touch polish beyond what falls out naturally.
- Art beyond the Kenney pack.
- Mid-wave save slots, multiple save profiles.

## Reference
Approved approach: Canvas2D + lightweight ECS core. Answers locked: single hardcoded polyline with fixed build slots; 10 linearly-scaling waves with a dense mixed final wave; Cannon/MG/Mortar with 2 upgrade tiers; between-wave auto-save + manual Save/Load.
