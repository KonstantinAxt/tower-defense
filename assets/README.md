# assets/

Art, audio, and any other binary assets weave is allowed to consume.

## `kenney/`

Drop the [Kenney Tower Defense (side-view)](https://kenney.nl/assets/tower-defense-top-down)
pack here before running the plan. Licence: CC0.

After extracting, the tree should look roughly like:

```
kenney/
├── PNG/
│   ├── Default size/
│   │   └── towerDefense_tile*.png
│   └── Retina/
└── Spritesheet/
    ├── towerDefense_tilesheet.png
    └── towerDefense_tilesheet.xml
```

weave's plan phase expects to find sprites under `assets/kenney/` and will
reference them by path from game code.

## Procedural assets

Anything that can be drawn with `canvas` — particles, number pop-ups, damage
flashes — is free for the worker to generate procedurally rather than reach
for an image file. Don't commit generated binaries.

## Not here

- `dist/` — Vite build output (gitignored).
- `test-results/`, `playwright-report/` — Playwright scratch (gitignored).
