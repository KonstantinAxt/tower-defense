# PLAYTEST.md

Manual playtest checklist for the weave tower-defense end-to-end test. After
weave finishes the run and you've read the PR diff, go through this list in a
browser (`bun run dev`).

Every box below must be tickable in ≤ 3 minutes of play. If not, the run
failed the playability bar — write the failure in the box instead of ticking
it.

---

## Rubric

Score each axis 1–5 (1 = poor, 5 = excellent) while playing each variant.
Run `bun run dev` and cycle through `?ui=A`, `?ui=B`, `?ui=C`.

| Variant | Visual Clarity | Perf | Delight | Notes |
|---------|:--------------:|:----:|:-------:|-------|
| A — Holographic | | | | |
| B — Diegetic | | | | |
| C — Arcade | | | | |

**Visual Clarity** — can you read gold / lives / wave / threats at a glance
without squinting? Does the HUD compete with the game scene?

**Perf** — does it feel smooth and responsive? Any stutter, hitching, or
jank during wave spawning or particle bursts?

**Delight** — is the visual style enjoyable and motivating to keep playing?
Do the particles, animations, and UI chrome add to the experience?

---

## Screenshots

Captured mid–wave 1 by `bun run test:screenshots`
(writes to `test-results/variant-{a,b,c}.png`).

| Variant A — Holographic | Variant B — Diegetic | Variant C — Arcade |
|:-----------------------:|:--------------------:|:-----------------:|
| ![Variant A](test-results/variant-a.png) | ![Variant B](test-results/variant-b.png) | ![Variant C](test-results/variant-c.png) |

---

## First boot

- [ ] `bun run dev` prints a localhost URL within 2 s
- [ ] Page loads without a pageerror / console.error
- [ ] Canvas is visible, not blank (background visibly differs from the page
      background)
- [ ] Some HUD text or UI is drawn (money / lives / wave counter visible)

## Core loop — wave 1

- [ ] A start-wave button / key exists and does something
- [ ] After starting wave 1, enemies appear and walk along a path
- [ ] I can place at least one tower within 10 s of wave start
- [ ] Placed tower visibly attacks enemies
- [ ] Enemies die and award money
- [ ] Money display updates when enemies die and when I place a tower
- [ ] Wave 1 ends (either enemies run out OR all reach the goal)

## Mid-game — wave 3

- [ ] Wave 3 starts without a page reload
- [ ] Difficulty visibly increased between wave 1 and wave 3 (more enemies,
      or tougher, or both)
- [ ] At least one second tower type is purchasable
- [ ] Economy is tight — I can lose if I buy nothing (test this: buy nothing
      on wave 3 and see if lives drop)

## Lose condition

- [ ] Letting enemies through reduces lives on the HUD
- [ ] Lives hitting zero triggers a game-over state (text, overlay, reload
      prompt — anything that communicates "you lost")
- [ ] Game-over state is recoverable (restart button / reload loads a fresh
      run)

## Win condition

- [ ] A win state is reachable (even if by inspection of the code — note
      the wave count required here): _____

## Polish pass (nice to have, not blocking)

- [ ] Sound plays on tower fire or enemy death
- [ ] Particles or animation on hit
- [ ] Pause works
- [ ] Save/load persists across reloads

## AI-slop red flags (the PR must not do these)

- [ ] No commented-out code blocks
- [ ] No TODO / FIXME scattered through the diff
- [ ] No dead exports or unused modules
- [ ] No trivia tests (`expect(true).toBe(true)`, render-tests of empty
      components, etc.)
- [ ] No giant docstring blocks restating what the code does

## Notes / failures

_Write observations here while playing. Dated entries are fine — this is
scratch, not a report._
