FROM node:20-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile=false

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @pkg/shared build \
  && pnpm --filter @app/api build \
  && pnpm --filter @app/api prisma:generate

FROM node:20-alpine AS runtime
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --prod --frozen-lockfile=false

COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/node_modules node_modules

WORKDIR /app/apps/api
EXPOSE 3000

CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/apps/api/src/main.js"]
