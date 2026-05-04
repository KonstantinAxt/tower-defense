# assets/

Art, audio, and any other binary assets weave is allowed to consume.

## `kenney/`

The Kenney **Tower Defense (Top-Down)** pack is **not tracked by git** — it's
CC0 and re-downloadable, so we gitignore it to keep the repo lean. Each clone
must re-fetch it before running weave.

```sh
mkdir -p assets/kenney
curl -fL -o /tmp/kenney-td.zip \
  https://kenney.nl/media/pages/assets/tower-defense-top-down/445a721423-1677693738/kenney_tower-defense-top-down.zip
unzip -q /tmp/kenney-td.zip -d assets/kenney && rm /tmp/kenney-td.zip
```

After extracting, the tree should look roughly like:

```
kenney/
├── License.txt
├── PNG/
│   ├── Default size/   # 299 tile PNGs
│   └── Retina/         # @2x versions
├── Tilesheet/
│   ├── towerDefense_tilesheet.png
│   └── towerDefense_tilesheet@2.png
└── Vector/
    └── towerDefense_vector.svg
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
