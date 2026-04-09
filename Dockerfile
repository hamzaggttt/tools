# --- STAGE 1: Build Frontend ---
FROM node:20 AS build-frontend
WORKDIR /app
COPY media-tools-v2/package*.json ./
RUN npm install
COPY media-tools-v2/ ./
RUN npm run build

# --- STAGE 2: Final Image ---
FROM node:20
ENV NODE_ENV=production

# (FFmpeg is provided by ffmpeg-static package in Node, so no apt-get needed!)

WORKDIR /usr/src/app

# Copy backend manifests
COPY package*.json ./
RUN npm install --omit=dev

# Copy all code
COPY . .

# Inject the built frontend
COPY --from=build-frontend /app/dist ./public

# Setup directories
RUN mkdir -p uploads output && chmod 777 uploads output

EXPOSE 3000
CMD [ "node", "server.js" ]
