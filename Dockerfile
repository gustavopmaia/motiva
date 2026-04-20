FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS pruner
COPY . .
RUN npx turbo prune backend --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/full/ .
COPY --from=installer /app/node_modules ./node_modules
RUN npm run build -- --filter=backend

FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/apps/backend/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

USER nodejs

EXPOSE 3000

CMD ["node", "dist/main.js"]
