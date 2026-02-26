# --- Stage 1: Install dependencies and build ---
FROM node:20-slim AS builder

# Install FFmpeg + system libs needed by @napi-rs/canvas
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
    && rm -rf /var/lib/apt/lists/*

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

# Install FFmpeg + runtime libs needed by @napi-rs/canvas
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
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the standalone build (includes node_modules it needs)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy Prisma schema + config + generated client for migrations
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/src/generated ./src/generated

# Install prisma CLI for migrations (has many transitive deps, easier to install fresh)
RUN npm install prisma@latest --save-dev --ignore-scripts

# Create the public directory and subdirectories the app needs
RUN mkdir -p public/uploads public/outputs public/music public/logos

# Railway sets the PORT env var automatically
ENV PORT=3000
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

# Run Prisma migrations then start the app
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
