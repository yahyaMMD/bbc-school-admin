FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

ENV NODE_ENV=production
ENV CHROME_PATH=/usr/bin/chromium
ENV WA_BRIDGE_PORT=3847
ENV WA_AUTH_DIR=/data/wa-auth
ENV WA_DATA_DIR=/data/wa-data

RUN mkdir -p /data/wa-auth /data/wa-data
EXPOSE 3847

CMD ["node", "server.js"]
