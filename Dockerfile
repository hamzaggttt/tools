# Use a Node.js base image
FROM node:18-bullseye

# Install FFmpeg and other dependencies
RUN apt-get update && apt-get install -y ffmpeg libvpx-dev libx264-dev && rm -rf /var/lib/apt/lists/*

# Create and change to the app directory
WORKDIR /usr/src/app

# Copy application dependency manifests to the container image.
COPY package*.json ./

# Install dependencies.
RUN npm install

# Copy local code to the container image.
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Run the web service on container startup.
CMD [ "node", "server.js" ]
