# Use a Node.js base image
FROM node:18-bullseye

# Set environment
ENV NODE_ENV=production

# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Create and change to the app directory
WORKDIR /usr/src/app

# Copy application dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy local code
COPY . .

# Create necessary directories with permissions
RUN mkdir -p uploads output && chmod 777 uploads output

# Expose port (Railway uses PORT env var but EXPOSE is good documentation)
EXPOSE 3000

# Run the web service
CMD [ "node", "server.js" ]
