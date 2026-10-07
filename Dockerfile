# Prelegal: the Next.js frontend, statically exported, served by the FastAPI backend.

# --- Frontend: build static files into /build/frontend/out ---
FROM node:24-slim AS frontend
WORKDIR /build
# The build reads the templates and catalog from the repo root (../ from frontend/).
COPY catalog.json ./
COPY templates/ templates/
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci
COPY frontend/ frontend/
RUN cd frontend && npm run build

# --- Backend: FastAPI app, serving the API and the static frontend ---
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.12.23 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_NO_DEV=1
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-install-project
COPY backend/src/ src/
RUN uv sync --frozen --no-editable
COPY --from=frontend /build/frontend/out /app/static

RUN useradd --system --no-create-home prelegal && mkdir /app/data && chown prelegal /app/data
USER prelegal

ENV PATH="/app/backend/.venv/bin:$PATH" \
    PRELEGAL_HOST=0.0.0.0 \
    PRELEGAL_PORT=8000 \
    PRELEGAL_STATIC_DIR=/app/static \
    PRELEGAL_DB_PATH=/app/data/prelegal.db
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"]
CMD ["prelegal-backend"]
