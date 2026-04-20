FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY turbo.json ./
COPY tsconfig*.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm ci
RUN npm run build --workspace=backend

FROM node:20-alpine AS runner

WORKDIR /app

RUN addgroup -S nodejs && adduser -S nodejs -G nodejs
RUN apk add --no-cache openssl

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/packages ./packages

USER nodejs

EXPOSE 3000

CMD ["node", "apps/backend/dist/main.js"]
