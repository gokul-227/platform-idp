# syntax=docker/dockerfile:1.7
#
# Next.js standalone build. Three stages: install the workspace, build, then
# copy the self-contained server into a minimal runtime. Cloud Run injects
# PORT and the standalone server.js honours it.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json .npmrc ./
# The workspace packages the app imports; without them pnpm cannot
# resolve a workspace:* dependency and the install fails.
COPY packages packages
COPY apps apps
# /root/.npmrc carries the GitHub Packages auth line; build-time only, so the
# token never lands in an image layer.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    --mount=type=secret,id=npmrc_auth,target=/root/.npmrc,required=true \
    pnpm install --frozen-lockfile

FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @aec-craft/id... build

# The trace does not include static assets or public/, so copy them alongside.
# In a pnpm workspace the standalone output keeps the apps/<name> path.
FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /repo/apps/id/.next/standalone /app
COPY --from=build --chown=app:app /repo/apps/id/.next/static /app/apps/id/.next/static
USER app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["node", "apps/id/server.js"]
