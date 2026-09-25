# Cards: the Printing

A small, self-hosted card-printing game. The cards are the product; the battle game can wait.

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

Run tests with `uv run python -m pytest -q`. If `uv sync` cannot reach a package index, the lock file is still valid but the local virtual environment cannot be populated until packages are available.

The demo providers need no keys. Set `TEXT_PROVIDER` to `openai` or `openrouter`, and `IMAGE_PROVIDER` to `openai`, `openrouter`, or `comfyui` to generate live content. See `.env.example`; the server reads environment variables, so load the file before starting. Exact reprints reuse the original art and text. ComfyUI requires an API-format workflow with a prompt node and a Save Image node.

The CLI supports `--help` on every command. Admin mutations share the same service functions as the admin API and write an audit record. The first admin is created locally; no default password is supplied.

## Design notes

The server owns inventory, learning, grading, condition, and trades. A design is immutable once printed; copies have their own print defects and wear. All daily boundaries use UTC. Seed cards include bundled painted art; demo generated designs use local SVG art, while configured image providers store raster art. The UI waits for the complete design and loaded artwork before showing the CMYK and foil printing sequence. Foil is a post effect and does not influence image or text generation. The card battle and resource minigames are extension points for later releases.

The Finish Gallery previews every known finish on blank stock or any standard copy in your library. You can inspect and rotate the specimen, compare finishes, and send a learned finish to the press without changing or spending a card.

Collection completion shows each player's learned rules, learned foils, and distinct card designs currently in their box. Its card count uses designs rather than physical copies, and the world total includes every existing design.
