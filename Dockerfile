# --- STAGE 1: Build Frontend ---
FROM node:20-bullseye AS build-frontend
WORKDIR /app
COPY media-tools-v2/package*.json ./
RUN npm install
COPY media-tools-v2/ ./
RUN npm run build

# --- STAGE 2: Final Image ---
FROM node:20-bullseye
ENV NODE_ENV=production

# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy backend manifests
COPY package*.json ./
RUN npm install --omit=dev

# Copy backend code
COPY . .

# Copy built frontend from Stage 1 into backend's public dir
# We use media-tools-v2/dist because that's what Vite outputs
COPY --from=build-frontend /app/dist ./public

# Create necessary directories
RUN mkdir -p uploads output && chmod 777 uploads output

EXPOSE 3000
CMD [ "node", "server.js" ]
