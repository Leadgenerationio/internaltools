# --- Stage 1: Install dependencies and build ---
FROM node:20-slim AS builder

# Install FFmpeg (needed for video processing)
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first (better Docker caching)
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies for the build step)
RUN npm install

# Copy the rest of the source code
COPY . .

# Build the Next.js app
RUN npm run build

# --- Stage 2: Production image ---
FROM node:20-slim AS runner

# Install FFmpeg in the production image too
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built app and dependencies from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./next.config.js

# Create the directories the app needs for file storage
RUN mkdir -p public/uploads public/outputs public/music

# Railway sets the PORT env var automatically
ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "start"]
