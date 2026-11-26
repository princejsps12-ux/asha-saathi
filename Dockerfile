# ---- 1. Build the React frontend ---------------------------------------------
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# Lint + frontend unit tests run on every build: any warning or failing test fails the image.
RUN npm run lint && npm test && npm run build

# ---- 2. Python runtime: FastAPI serves the API and the built frontend ---------
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
COPY backend/ ./
RUN ruff check .
COPY --from=web /web/dist ./static
RUN useradd --create-home --uid 1000 asha && mkdir -p /data && chown asha /data
USER asha
# Listens on $PORT (default 8000); cloud hosts such as Render set PORT themselves.
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://localhost:{os.getenv(\"PORT\", \"8000\")}/api/health')"
CMD ["python", "-m", "app.serve"]
