FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY build.mjs ocr-models.json THIRD_PARTY_NOTICES.md ./
RUN node build.mjs
FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/public/vendor ./public/vendor
COPY public ./public
COPY THIRD_PARTY_NOTICES.md ./public/THIRD_PARTY_NOTICES.txt
COPY server.mjs pdf-backend.mjs share-backend.mjs ./
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
