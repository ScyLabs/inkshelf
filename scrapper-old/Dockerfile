FROM node:22-alpine
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Install tsx for running TypeScript
RUN npm install -g tsx

# Copy source code and scraper tsconfig
COPY scraper/tsconfig.scraper.json ./tsconfig.json
COPY src/lib/ ./src/lib/
COPY scraper/ ./scraper/

# Create logs directory
RUN mkdir -p /app/logs

# Install supercronic for cron jobs
RUN apk add --no-cache curl
RUN curl -fsSLO https://github.com/aptible/supercronic/releases/download/v0.2.24/supercronic-linux-amd64 \
  && chmod +x supercronic-linux-amd64 \
  && mv supercronic-linux-amd64 /usr/local/bin/supercronic

# Create crontab
RUN echo "*/55 * * * * tsx scraper/run.ts >> logs/scraper.log 2>&1" > /app/crontab

ENV NODE_ENV=production

CMD ["supercronic", "/app/crontab"]