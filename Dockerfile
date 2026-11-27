# ASHA Saathi: one image, built in three stages. Lint and every test run during the build, so a
# broken change can't produce an image. The final runtime image has no test tools in it.

# ---- 1. Frontend: lint + format check + tests, then the production build ------
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run lint && npm test && npm run build

# ---- 2. Backend: lint + format check + tests (this stage is thrown away) ---------
FROM python:3.12-slim AS api-test
ENV PIP_ROOT_USER_ACTION=ignore PIP_DISABLE_PIP_VERSION_CHECK=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY backend/requirements.txt backend/requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY backend/ ./
RUN ruff check . && ruff format --check . && pytest -p no:cacheprovider && touch /tests-passed

# ---- 3. Runtime: FastAPI serves the API and the built frontend ------------------
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DB_PATH=/data/asha.db \
    STATIC_DIR=/app/static \
    PIP_ROOT_USER_ACTION=ignore \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# Depending on the test stage makes BuildKit run it too (it skips stages nothing uses).
COPY --from=api-test /tests-passed /tmp/tests-passed
COPY backend/app ./app
COPY --from=web /web/dist ./static
RUN useradd --create-home --uid 1000 asha && mkdir -p /data && chown asha /data
USER asha
# Listens on $PORT (default 8000); cloud hosts such as Render set PORT themselves.
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://localhost:{os.getenv(\"PORT\", \"8000\")}/api/health')"
CMD ["python", "-m", "app.serve"]
