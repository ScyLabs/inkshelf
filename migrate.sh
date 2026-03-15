#!/bin/bash
set -e

echo "🔄 Starting OneNice migration..."

# Stop old container if running
echo "🛑 Stopping old containers..."
docker stop onepiece-app 2>/dev/null || true
docker rm onepiece-app 2>/dev/null || true

# Start PostgreSQL first
echo "🗄️  Starting PostgreSQL..."
docker compose up -d postgres

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 30
docker compose exec postgres pg_isready -U onepiece -d onepiece || {
  echo "❌ PostgreSQL not ready, waiting longer..."
  sleep 30
}

# Start the app
echo "🚀 Starting OneNice app..."
docker compose up -d onepiece-app

# Build and start scrapper
echo "🕷️  Building and starting scrapper..."
docker compose build scrapper
docker compose up -d scrapper

echo "✅ Migration completed!"
echo "📊 Check status: docker compose ps"
echo "📝 Check logs: docker compose logs -f"