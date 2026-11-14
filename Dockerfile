FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json vite.config.ts index.html metadata.json server.ts ./
COPY public ./public
COPY src ./src
COPY docs ./docs

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/yasna.db

EXPOSE 3000

RUN mkdir -p /app/data /app/uploads && chown -R node:node /app
USER node

CMD ["npm", "start"]
