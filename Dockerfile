FROM node:18-slim

# Install yt-dlp + ffmpeg + python3
RUN apt-get update && \
    apt-get install -y python3 ffmpeg curl && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install node dependencies
COPY package*.json ./
RUN npm install --production

# Copy source
COPY . .

EXPOSE 4000

CMD ["node", "server.js"]
