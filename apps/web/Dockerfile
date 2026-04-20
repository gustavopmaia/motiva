FROM node:20-bookworm-slim AS builder

WORKDIR /app
ENV HUSKY=0

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/web/package.json apps/web/
COPY packages/types/package.json packages/types/
RUN npm pkg delete scripts.prepare && npm ci

COPY apps/web apps/web
COPY packages packages

RUN npm run build --workspace=web


FROM nginx:alpine

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
