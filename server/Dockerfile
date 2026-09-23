FROM node:22-alpine
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
ENV PORT=3000
RUN mkdir -p /data/uploads/students /data/uploads/teachers
EXPOSE 3000

CMD ["sh", "-c", "node scripts/seed.js && node src/index.js"]
