FROM node:24.14.0-bookworm-slim AS deps

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV HUSKY=0

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/web/package.json apps/web/
COPY packages/types/package.json packages/types/
RUN npm pkg delete scripts.prepare && npm ci

COPY apps/backend/src apps/backend/src
COPY apps/backend/tsconfig*.json apps/backend/
COPY apps/backend/drizzle.config.ts apps/backend/
COPY packages packages
COPY apps/backend/drizzle apps/backend/drizzle

FROM deps AS builder

RUN npm run build --workspace=backend && npm prune --omit=dev


FROM node:24.14.0-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/apps/backend/package.json apps/backend/
COPY --from=builder /app/apps/web/package.json apps/web/
COPY --from=builder /app/packages/types/package.json packages/types/
COPY --from=builder /app/apps/backend/dist apps/backend/dist
COPY --from=builder /app/apps/backend/drizzle apps/backend/drizzle

USER node
EXPOSE 3000
CMD ["node", "apps/backend/dist/src/main.js"]
