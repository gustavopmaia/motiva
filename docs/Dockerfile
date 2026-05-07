FROM node:24.14.0-alpine AS builder

WORKDIR /app

COPY docs/package.json docs/package-lock.json ./

RUN npm ci

COPY docs .

RUN npm run build

FROM node:24.14.0-alpine

WORKDIR /app

RUN npm install -g serve

COPY --from=builder /app/build ./build

EXPOSE 3001

CMD ["serve", "-s", "build", "-l", "3001"]
