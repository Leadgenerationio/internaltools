#!/bin/bash
set -e

# If DATA_DIR is set (Railway volume mount), symlink storage dirs for persistence
if [ -n "$DATA_DIR" ]; then
  echo "Setting up persistent storage at $DATA_DIR..."
  mkdir -p "$DATA_DIR/uploads" "$DATA_DIR/outputs" "$DATA_DIR/music"

  # Replace build-time directories with symlinks to the volume
  rm -rf public/uploads public/outputs public/music
  ln -sf "$DATA_DIR/uploads" public/uploads
  ln -sf "$DATA_DIR/outputs" public/outputs
  ln -sf "$DATA_DIR/music" public/music
  echo "Persistent storage linked: uploads, outputs, music -> $DATA_DIR"
else
  # Local / non-volume: ensure directories exist
  mkdir -p public/uploads public/outputs public/music
fi

# Ensure logos dir exists (static, not on volume)
mkdir -p public/logos

# Pre-flight: fail fast if DATABASE_URL is missing
if [ -z "$DATABASE_URL" ]; then
  echo "FATAL: DATABASE_URL is not set. Add it in Railway variables."
  exit 1
fi

# Run Prisma migrations
echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting server..."
exec node server.js
