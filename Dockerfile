FROM node:20-bookworm-slim AS base

WORKDIR /app

ENV HUSKY=0

FROM base AS deps

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json

RUN npm pkg delete scripts.prepare \
  && npm ci

FROM deps AS builder

COPY apps/backend apps/backend
COPY packages packages

RUN npm run build --workspace=backend

FROM base AS runner

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json

RUN npm pkg delete scripts.prepare \
  && npm ci --omit=dev --workspace=backend --include-workspace-root=false \
  && npm cache clean --force

COPY --from=builder /app/apps/backend/dist apps/backend/dist

USER node

EXPOSE 3000

CMD ["node", "apps/backend/dist/src/main.js"]
