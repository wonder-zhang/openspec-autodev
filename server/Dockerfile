FROM node:18-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY index.js db.js ./
COPY lib/ ./lib/
COPY middleware/ ./middleware/
COPY routes/ ./routes/
COPY jobs/ ./jobs/

ENV PORT=9527
ENV DATA_DIR=/data

VOLUME /data
EXPOSE 9527

CMD ["node", "index.js"]