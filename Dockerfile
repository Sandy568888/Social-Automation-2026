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
RUN NODE_OPTIONS="--max-old-space-size=4096" pnpm run build:backend

EXPOSE 3000

CMD ["node", "--experimental-require-module", "./dist/apps/backend/src/main.js"]
