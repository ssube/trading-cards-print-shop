# Trading Cards: Print Shop

A small, self-hosted card-printing game with a quick trading card duel built from the rules on your cards.

## Local development

Requirements: Python 3.10+, Node 20+, and `uv`.

```sh
uv sync
npm --prefix web install
cp .env.example .env
uv run python -m server.cli init
uv run python -m server.cli create-admin --username admin
```

Run `uv run uvicorn server.app:app --reload` and `npm --prefix web run dev` in separate terminals. Open `http://localhost:5173`. The Vite server proxies `/api` and `/assets` to FastAPI. For a single-process deployment, build the frontend with `npm --prefix web run build` and run Uvicorn on port 8000.

For a local container deployment, run `nerdctl compose up --build` after creating `.env`. The same Compose file works with Docker Compose. GitHub Actions is configured to build the Docker image on pushes and pull requests.

Run tests with `uv run python -m pytest -q`. The browser playtest suite covers the offline demo, including onboarding, library filters, deck and progress flows, card printing, and print-sheet export. Install a Chromium browser with `npx --prefix web playwright install chromium`, then run `npm --prefix web run test:e2e`. If Chrome is installed at a custom path, set `PLAYWRIGHT_CHROME_PATH`. The suite includes an offline bot match; Python tests cover the multiplayer match engine and rewards. If `uv sync` cannot reach a package index, the lock file is still valid but the local virtual environment cannot be populated until packages are available.


## The trading card game

Starter, intermediate, and challenge formats use 6, 8, and 12 card decks and race to 5, 7, and 10 sparks. A friend may join a private room with a deck within two cards or 25% of the host's combined printing cost. The Pressroom Bot uses a deck of the same size. Online matches are server-authoritative; the offline demo runs bot matches in localStorage. Turns have two actions and a 40-second clock. Two missed turns forfeit; a turn limit breaks a stalled match by spark score.

Each player has five slots across Forge (two), Spotlight (one), and Archive (two). Any card type can occupy any slot. Monsters attack the first opposing card in their lane or score a spark in an open lane. Forge Monsters deal extra guard damage, Spotlight direct hits score an extra spark and activated Spells draw, and Archive Lands gain guard. Spells are placed face up, then activated with a later action and discarded. Printed draw, spark, mend, glimpse, return, echo, and shuffle effects resolve on their triggers. Opponents see cards on the board, while hands and deck order stay private.

Both players earn paper and ink according to their final spark count for their first three completed matches each UTC day. Only the winner can receive a bonus card, at most one per day. The old physical-protection rule is retired; its printed copies use At dusk instead.

## Offline demo

The welcome screen offers **Try offline demo**. It uses a fixed Demo Collector profile and a starter deck of your choice. Cards, resources, and learned parts are saved in this browser's localStorage. The Press, Card Library, Decks, Print Sheets, Progress, Finish Gallery, and solo games work without a server. Cards can be shared through self-contained public links. Each newly printed design awards a premade discovery card to study, two ink, and one foil. Daily supplies and the five-new-design limit reset at 00:00 UTC. Commissions, NPCs, player trades, multiplayer rooms, and admin actions are unavailable. Offline progress is never shared with an online account or another device.

To build the static GitHub Pages site, run `npm --prefix web run build:demo` and publish `web/dist`. Run `npm --prefix web run test:pages` after building to playtest the artifact at the repository subpath without an API. The Pages workflow runs this check before deploying from `main`; select **GitHub Actions** as the Pages source in repository settings. The static build uses relative asset paths, so it works at the repository's Pages URL. It needs no Python server or API. The regular build still serves the online app and also offers the demo from its welcome screen.

The demo providers need no keys. Set `TEXT_PROVIDER` to `openai` or `openrouter`, and `IMAGE_PROVIDER` to `openai`, `openrouter`, or `comfyui` to generate live content. See `.env.example`; the server reads environment variables, so load the file before starting. Exact reprints reuse the original art and text. ComfyUI requires an API-format workflow with a prompt node and a Save Image node.

The CLI supports `--help` on every command. Admin mutations share the same service functions as the admin API and write an audit record. The first admin is created locally; no default password is supplied.

## Design notes

The server owns inventory, learning, grading, condition, and trades. A design is immutable once printed; copies have their own print defects and wear. All daily boundaries use UTC. Seed cards include bundled art; demo generated designs use local SVG art, while configured image providers store raster art. The online Press accepts a 254-character title or theme hint that guides text and artwork generation; Literal and Wishmaster require one. The GitHub Pages demo disables hints and chooses from prepared names and artwork. The UI shows composition stages before the CMYK and foil printing sequence. Foil, border, and card back are visual parts and do not influence image or text generation. Printed card rules drive the TCG match engine; finishes, grade, sleeves, and slabs remain visual during matches.

The Print Sheets tab lays out one or more owned copies on 4×6 photo, sticker, or card paper. It exports a 4×6 PDF or 1200×1800 PNG; multiple PNG sheets are bundled in a ZIP. Optional mirrored back sheets support two-sided printing. The preview and files can include or hide simulated foil and copy quality effects. Generating a file uses one paper per front sheet and one condition per card placement, with sleeve and slab protection preventing condition wear. Failed rendering does not charge the player, and the finished file can be downloaded again without another charge. Print at actual size; physical foil requires separate materials or finishing.

The Finish Gallery previews every known finish on blank stock or any standard copy in your library. You can inspect and rotate the specimen, compare finishes, and send a learned finish to the press without changing or spending a card.
Foil highlights follow pointer and card rotation, with only a faint ambient reflection while the card is still.

Collection completion shows each player's learned rules, foils, borders, and backs, plus distinct card designs currently in their box. Its card count uses designs rather than physical copies, and the world total includes every existing design.
The Progress page expands that summary into learned and missing parts across every category, daily print usage, and the distinct designs currently in the player's box.

New players choose a named, themed starter deck during registration. Each deck contains six pre-generated copies with exactly one foil, including a shared Paper Sprite and a new Recut Spell. Existing accounts receive three extra starter copies once. The selection unlocks the parts on those cards and is saved on the player account. The signup screen shows all six copies; signup never calls a generation provider.

Borders and card backs are learnable design parts. The Press offers the styles learned from a starter deck or by studying other cards. Classic Gilt and Archive Seal are the original styles; Starlit Filigree with Atlas Compass and Velvet Scrollwork with Fox Masquerade appear on their themed cards. Exact reprints keep the original border and back.

Premade cards explore Botanical, Clockwork, Maritime, Cyber, Grimdark, Literal, and Wishmaster art directions. Cyber uses original neon circuitry and rain-soaked streets; Grimdark uses original gothic ruins and iron silhouettes. Literal follows the player's hint plainly, while Wishmaster grants its exact words with a playful twist. NPC trades make sample cards available to study online; the offline demo awards them through early print discoveries. All four styles have bundled sample artwork.
