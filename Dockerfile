# Build frontend
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Python app
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Copy built frontend
COPY --from=frontend /app/frontend/dist ./frontend/dist

ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "gunicorn --worker-tmp-dir /dev/shm --timeout 120 --bind 0.0.0.0:${PORT:-8080} app:app"]
