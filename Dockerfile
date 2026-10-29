# Stage 1: build the React front-end
FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: Python server that serves the API, the mission WebSocket and the built UI
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONPATH=/app
COPY requirements-server.txt ./
RUN pip install --no-cache-dir -r requirements-server.txt
COPY qrelay/ qrelay/
COPY server/ server/
COPY data/ data/
COPY --from=web /web/dist web/dist
# Render (and most hosts) provide $PORT; default to 8000 locally.
CMD ["sh", "-c", "uvicorn server.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
