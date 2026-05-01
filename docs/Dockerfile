FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY docs/package.json docs/package.json

RUN npm ci --workspace=docs

COPY docs docs

RUN npm run build --workspace=docs

FROM node:24-alpine AS runner

WORKDIR /app

RUN npm install -g serve

COPY --from=builder /app/docs/build ./build

EXPOSE 3001

CMD ["serve", "-s", "build", "-l", "3001"]
