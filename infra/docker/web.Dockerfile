# Next.js client — a WebSocket-fed island.
#
# No SSR of simulation state: the client subscribes to a 15 Hz binary feed and
# renders at 60 FPS. Next.js earns its place here for the marketing/docs shell
# and the build pipeline, not for rendering the world (TECH_STACK §4).

# --- deps --------------------------------------------------------------------
FROM node:24-alpine AS deps

WORKDIR /repo

# Manifests first, so a source-only change reuses the install layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json biome.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/

# `--frozen-lockfile`: CI and local must install byte-identical trees. The
# pinned versions in TECH_STACK are the point (react must not cross 19.4, three
# must not cross 0.187).
RUN corepack enable && pnpm install --frozen-lockfile

# --- builder -----------------------------------------------------------------
FROM deps AS builder

WORKDIR /repo
COPY . .

# NEXT_PUBLIC_* values are inlined at build time. Compose passes this as a build
# arg purely so the local image is self-describing; nothing here requires it.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter web build

# --- runtime -----------------------------------------------------------------
FROM node:24-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /repo/node_modules ./node_modules

USER nextjs
EXPOSE 3000

CMD ["node_modules/.bin/next", "start", "--port", "3000"]