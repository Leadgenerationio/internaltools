#!/bin/bash
set -e

# If DATA_DIR is set (Railway volume mount), symlink storage dirs for persistence
if [ -n "$DATA_DIR" ]; then
  echo "Setting up persistent storage at $DATA_DIR..."
  mkdir -p "$DATA_DIR/uploads" "$DATA_DIR/outputs" "$DATA_DIR/music"

  # ── Aggressive cleanup DIRECTLY on the volume (before symlinks) ──
  echo "Cleaning volume at $DATA_DIR BEFORE symlinking..."
  echo "Volume disk usage BEFORE cleanup:"
  du -sh "$DATA_DIR" 2>/dev/null || true
  df -h "$DATA_DIR" 2>/dev/null | tail -1 || true

  # Delete ALL rendered outputs (can always re-render)
  find "$DATA_DIR/outputs" -type f -delete 2>/dev/null || true
  find "$DATA_DIR/outputs" -mindepth 1 -type d -delete 2>/dev/null || true
  # Delete uploads older than 1 day
  find "$DATA_DIR/uploads" -type f -mtime +1 -delete 2>/dev/null || true
  # Delete any stray files in the volume root (temp files, etc.)
  find "$DATA_DIR" -maxdepth 1 -type f -delete 2>/dev/null || true

  echo "Volume disk usage AFTER cleanup:"
  du -sh "$DATA_DIR" "$DATA_DIR/uploads" "$DATA_DIR/outputs" "$DATA_DIR/music" 2>/dev/null || true
  df -h "$DATA_DIR" 2>/dev/null | tail -1 || true

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
