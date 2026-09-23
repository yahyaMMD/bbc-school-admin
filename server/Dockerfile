FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-noto-core \
    fonts-noto-ui-core \
    fonts-arabeyes \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/package.json ./
RUN npm install --omit=dev

COPY server/src ./src
COPY server/scripts ./scripts

# Bake frontend into the image so a missing volume cannot blank the UI
COPY index.html ./web/index.html
COPY css ./web/css
COPY js ./web/js
COPY assets ./web/assets
COPY data/school_data.json ./seed/school_data.json

ENV NODE_ENV=production
ENV WEB_ROOT=/app/web
ENV SEED_JSON=/app/seed/school_data.json
ENV UPLOAD_DIR=/data/uploads
ENV CHROME_PATH=/usr/bin/chromium
ENV PORT=3000
RUN mkdir -p /data/uploads/students /data/uploads/teachers /data/uploads/announcements
EXPOSE 3000

CMD ["sh", "-c", "node scripts/seed.js && node src/index.js"]
