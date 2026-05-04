# tower-defense

Stretch-scope **weave end-to-end test**. A pre-seeded scaffold that weave
turns into a playable side-view tower defense game through its default
stage-gated flow — no human edits to the PRD, issues, or code mid-run.

> This repo is intentionally throwaway. It exists to exercise weave, not to
> ship a game. Gitignored from the enclosing `notes` vault. The plan lives
> in `notes/packages/weave/spad/plan-weave-tower-defense.md`.

## Quick start

```sh
bun install
bunx playwright install chromium
bun run dev             # starts Vite at http://localhost:5173
bun run test:unit       # bun test
bun run test:e2e        # Playwright (starts its own dev server)
bun run typecheck
bun run lint
```

Before kicking off a weave run:

```sh
bun run check:bedrock   # ~10-token Bedrock probe
```

## Layout

- `src/` — game code (worker output lands here).
- `e2e/` — Playwright specs. `smoke.spec.ts` runs on every weave slice; the
  gameplay E2E is produced as the final slice in the plan.
- `scripts/check-bedrock.ts` — 10-token AWS Bedrock reachability probe.
- `assets/kenney/` — drop the Kenney Tower Defense (side-view) pack here
  before running.
- `PLAYTEST.md` — manual playtest checklist (human-authored, not edited
  during the run).
- `weave.json` — provider, budgets, feedback loops, 7trees domain.

## How the test runs

1. **Phase 0** (this repo, hand-seeded): working dev server, green smoke
   E2E, empty game loop.
2. **Phase 1 — plan**: `weave plan "<stretch prompt>"` produces a PRD and a
   list of issues. Review read-only; reroll if the decomposition is wrong.
3. **Phase 2 — run**: `weave run` with default `maxParallel: 4`. Cascade-skip
   on failure.
4. **Phase 3 — verify**: play through `PLAYTEST.md`, read the PR diff.
5. **Phase 4 — merge**: `weave merge --create-mr --target main`.
