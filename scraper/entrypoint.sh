#!/bin/sh
# Run scraper every 5 hours
while true; do
  echo "[scheduler] Starting scrape at $(date -u)"
  ./node_modules/.bin/tsx scraper/run.ts 2>&1 | tee -a /app/logs/scraper.log
  echo "[scheduler] Done at $(date -u), sleeping 5 hours"
  sleep 18000
done
