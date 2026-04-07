FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN corepack enable
COPY . .
RUN corepack pnpm install --frozen-lockfile=false
RUN corepack pnpm build

CMD ["node", "dist/cli/entry.js"]
