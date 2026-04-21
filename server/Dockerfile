FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=9527
ENV DATA_DIR=/data

EXPOSE 9527

CMD ["node", "index.js"]
