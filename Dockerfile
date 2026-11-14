FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN mkdir -p /app/data /app/uploads

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/yasna.db

EXPOSE 3000

CMD ["npm", "start"]
