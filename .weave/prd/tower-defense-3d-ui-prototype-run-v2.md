# PRD: 3D UI Prototype — Three Variants Behind `?ui=`

## Problem

The `tower-defense` repo currently renders gameplay as 2D top-down canvas. We need to migrate the renderer to 3D side-view (Three.js) and ship **three coherent visual identities side-by-side** behind `?ui=A|B|C` so a human reviewer can pick a direction. This run also stress-tests weave: full-3D migration + DESIGN.md tokens + 3-way variant fan-out.

The previous run blew the 120-turn ceiling on a single welded foundation issue. This v2 plan enforces tight slicing.

## Approach (locked)

- **Render**: Three.js, side-view 3D camera. Camera shared across variants.
- **Logic**: Stays 2D. Renderer maps `(x, y)` → `(x, 0, y)`. ECS, `level.ts`, `enemies.ts`, `towers.ts`, `waves.ts`, `save.ts` untouched.
- **Comparison axis**: three coherent visual identities (A holographic / B diegetic warm / C arcade pop). Camera, gameplay, mesh data shared; differentiate via materials, lighting, post, palette, particles.
- **Assets**: Kenney 3D Tower Defense Kit, pre-seeded into `assets/kenney3d/` by the human before the run (mirrors today's `assets/kenney/`).
- **Routing**: `?ui=A` (default A; `?ui=neutral` available during foundation). Reload to switch.
- **E2E**: state-based via `window.__td.testApi` (`clickSlot`, `buyTower`). Same spec runs against all 3 variants via Playwright project matrix.
- **Tokens**: DESIGN.md per variant in `tokens/{a-holographic,b-diegetic,c-arcade}.design.md`. `bunx @google/design.md lint tokens/*.design.md` added to feedback loops.
- **Postprocess**: `three/examples/jsm/postprocessing/*` only.

## Slicing rules (enforced)

- Each issue: ≤4 acceptance criteria, ≤30 turns of agent work.
- Foundation is split into 6 sequential issues. Game may be visibly broken at end of slice 1; smoke E2E is allowed to fail/skip until slice 4. Foundation merges in order.
- After foundation lands, variants A/B/C run in parallel as independent issues. Each variant ships its own `tokens/*.design.md` alongside.
- Playwright project matrix is its own issue (after variants).
- PLAYTEST rubric + per-variant screenshots is its own issue (last).

## Scope

- Three.js renderer with side-view camera, ground plane, raycast click pipeline, coord helpers.
- Kenney 3D asset loader, neutral mesh rendering for enemies/towers/path.
- `VariantModule` interface + `?ui=` router.
- Three variants A/B/C with distinct materials, lighting, postprocess, HUD, build menu, particles.
- Per-variant DESIGN.md tokens.
- Test API on `window.__td` + Playwright matrix across variants.
- PLAYTEST.md rubric (clarity / perf / delight, 1–5) + screenshots.

## Out of scope

- a11y / DOM mirror / keyboard nav
- Mobile / touch
- Picking a winner + deleting losers
- Per-variant audio
- Free-orbit camera or alternate angles

## Acceptance signals

Per slice: `bun run typecheck`, `bun run lint`, `bun run test:unit` green. After tokens land: `bunx @google/design.md lint tokens/*.design.md` green. UI slices: `bun run test:e2e` green against available variants.

Per variant (final eval): 60 fps mid-wave with 20 enemies + all slots built on mid-spec laptop; screenshot in PR; PLAYTEST rubric filled by human.

<!-- weave:progress -->
## Progress (11/11)

- [x] 001 — Remove 2D canvas renderer and obsolete render tests (closed)
- [x] 002 — Three.js bootstrap: renderer, camera, scene, ground plane (closed)
- [x] 003 — Coord helpers + raycast click pipeline (closed)
- [x] 004 — Kenney 3D asset loader + neutral variant rendering (closed)
- [x] 005 — VariantModule interface + `?ui=` router (closed)
- [x] 006 — `window.__td.testApi` + restored Playwright smoke (closed)
- [x] 007 — Variant A — Holographic (materials, lighting, postprocess, HUD, particles) (closed)
- [x] 008 — Variant B — Diegetic warm (materials, lighting, HUD, particles) (closed)
- [x] 009 — Variant C — Arcade pop (toon materials, outline, HUD, particles) (closed)
- [x] 010 — Playwright project matrix across A/B/C (closed)
- [x] 011 — PLAYTEST rubric + per-variant screenshots (closed)
<!-- /weave:progress -->
