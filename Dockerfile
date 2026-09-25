FROM node:20-alpine AS frontend
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.11-slim
WORKDIR /app
COPY --from=ghcr.io/astral-sh/uv:0.10.10 /uv /uvx /bin/
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY server/ ./server/
COPY --from=frontend /app/web/dist ./web/dist
ENV DATABASE_PATH=/app/data/cards.sqlite3 ASSET_DIR=/app/data/assets COOKIE_SECURE=false
VOLUME /app/data
EXPOSE 8000
CMD ["uv", "run", "--frozen", "--no-dev", "uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "8000"]
