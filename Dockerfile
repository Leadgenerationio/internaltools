# --- Stage 1: Install dependencies and build ---
FROM node:20-slim AS builder

# Install FFmpeg + system libs needed by @napi-rs/canvas + text & emoji fonts
RUN apt-get update && apt-get install -y \
    ffmpeg \
    build-essential \
    python3 \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg62-turbo-dev \
    libgif-dev \
    librsvg2-dev \
    libfontconfig1-dev \
    fonts-dejavu-core \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -fv

WORKDIR /app

# Copy package files first (better Docker caching)
COPY package.json package-lock.json* ./

# Install dependencies — force linux platform for native modules
RUN npm ci --force

# Copy the rest of the source code
COPY . .

# Ensure public dir exists (contents are in .dockerignore)
RUN mkdir -p public/uploads public/outputs public/music

# Build the Next.js app (standalone output)
RUN npm run build

# --- Stage 2: Production image ---
FROM node:20-slim AS runner

# Install FFmpeg + runtime libs needed by @napi-rs/canvas + text & emoji fonts
RUN apt-get update && apt-get install -y \
    ffmpeg \
    zip \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    libfontconfig1 \
    fonts-dejavu-core \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -fv

WORKDIR /app

# Copy the standalone build (includes node_modules it needs)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Copy public directory — required for Next.js standalone to serve static files
COPY --from=builder /app/public ./public

# Copy Prisma schema + config + generated client for migrations
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/src/generated ./src/generated

# Install prisma CLI for migrations (has many transitive deps, easier to install fresh)
# Pin to the same version as package.json to avoid compatibility issues
# Also install tsx for worker mode (TypeScript execution)
RUN npm install prisma@7.4.1 --save-dev && npm install tsx@4

# Create the public directory and subdirectories the app needs
RUN mkdir -p public/uploads public/outputs public/music public/logos

# Copy worker source files + tsconfig for worker mode (tsx resolves @/ paths)
COPY --from=builder /app/src/workers ./src/workers
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Copy startup script
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Railway sets the PORT env var automatically
ENV PORT=3000
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

# Entrypoint handles: volume symlinks, prisma migrate, then starts server
CMD ["./docker-entrypoint.sh"]
