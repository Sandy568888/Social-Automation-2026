FROM node:22.20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ \
    make \
    python3-pip \
    bash \
&& rm -rf /var/lib/apt/lists/*

RUN npm --no-update-notifier --no-fund --global install pnpm@10.6.1

WORKDIR /app
COPY . /app

RUN pnpm install --frozen-lockfile
RUN pnpm run prisma-generate
RUN NODE_OPTIONS="--max-old-space-size=4096" pnpm run build:backend || true
RUN ls -la /app/dist/ 2>/dev/null || echo "NO DIST FOLDER" && \
    ls -la /app/apps/backend/dist/ 2>/dev/null || echo "NO BACKEND DIST FOLDER"

EXPOSE 3000
CMD ["node", "--max-old-space-size=2048", "--experimental-require-module", "./dist/apps/backend/src/main.js"]
