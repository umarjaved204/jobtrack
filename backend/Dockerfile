# syntax=docker/dockerfile:1
# Backend image: Python 3.12 + uv. Dependencies are installed from uv.lock (frozen),
# so the image matches local dev exactly.
FROM python:3.12-slim

# uv binary from the official image (same version as local dev; bump deliberately).
COPY --from=ghcr.io/astral-sh/uv:0.13.8 /uv /uvx /bin/

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# 1) Dependencies only: cached until pyproject.toml / uv.lock change. The cache mount keeps
# uv's download cache (~250 MB) out of the image; UV_LINK_MODE=copy makes that safe.
COPY pyproject.toml uv.lock .python-version ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev

# Unprivileged runtime user (created early: step 2 gives it the model directory).
RUN useradd --create-home --uid 10001 appuser

# 2) Optional: the server-side match model (MATCH_EMBEDDINGS=server, docs/adr/0004).
# Production embeds in the browser and needs no model, so the default image doesn't bake
# one (~65 MB). With BAKE_MATCH_MODEL=true the model is downloaded at build time (Render's
# filesystem is ephemeral, so a runtime download would repeat after every spin-down), the
# build fails unless it loads and embeds offline, and offline mode is switched on: a
# missing model is then a loud error, not a slow cold start. Without it, the model
# downloads into /opt/models (owned by appuser) on first use. The baked files are made
# world-readable: the build runs as root and some huggingface_hub cache files are 0600.
# MATCH_MODEL must equal MODEL_NAME in app/services/match/local_embedder.py (a test checks).
ARG BAKE_MATCH_MODEL=false
ARG MATCH_MODEL=BAAI/bge-small-en-v1.5
ENV MATCH_MODEL_DIR=/opt/models
RUN mkdir -p "$MATCH_MODEL_DIR" \
 && if [ "$BAKE_MATCH_MODEL" = "true" ]; then \
      python -c "from fastembed import TextEmbedding; TextEmbedding('${MATCH_MODEL}', cache_dir='${MATCH_MODEL_DIR}')" \
      && HF_HUB_OFFLINE=1 python -c "from fastembed import TextEmbedding; m = TextEmbedding('${MATCH_MODEL}', cache_dir='${MATCH_MODEL_DIR}', local_files_only=True, threads=1); v = next(iter(m.embed(['Built Django REST APIs']))); assert v.shape == (384,), v.shape; print('match model OK')" \
      && chmod -R a+rX "$MATCH_MODEL_DIR"; \
    else \
      chown appuser "$MATCH_MODEL_DIR"; \
    fi
# huggingface_hub reads "true"/"false" (and 1/0) for HF_HUB_OFFLINE.
ENV MATCH_MODEL_OFFLINE=${BAKE_MATCH_MODEL} \
    HF_HUB_OFFLINE=${BAKE_MATCH_MODEL}

# 3) Application code and migrations.
COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health').status == 200 else 1)"

# Apply pending migrations, then serve. Fine for a single instance (Render free tier);
# with several replicas, run migrations as a separate release step instead.
# Render (and most PaaS) inject $PORT; default to 8000 locally.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
