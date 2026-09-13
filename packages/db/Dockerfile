# syntax=docker/dockerfile:1.7
#
# The audit migration runner. Its own image rather than a command on the
# console's: that one is a Next standalone bundle, which carries the server and
# nothing else, and a migration must not depend on a build shaped for serving.
#
# Same arrangement as the three Ory migration images, and the same contract: a
# Cloud Run job runs it to completion before a revision that reads the table is
# rolled out.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json .npmrc ./
COPY packages packages
COPY apps apps
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    --mount=type=secret,id=npmrc_auth,target=/root/.npmrc,required=true \
    pnpm install --frozen-lockfile

FROM deps AS build
# --legacy: from pnpm v10 `deploy` refuses a workspace that does not set
# `inject-workspace-packages`. Setting it is the alternative, and it costs more
# than this image is worth: injecting replaces every workspace symlink with a
# copy, and `packages/contracts` is consumed as raw .ts through exactly such a
# symlink (see the apps' `transpilePackages`). Next would then compile a copy in
# node_modules, so editing contracts would stop reaching a running dev server
# until the next install — a change to the dev loop of every app, for one
# Dockerfile line, in the one image that uses `deploy` at all.
#
# The legacy path copies the built package plus its production dependencies,
# which is the whole requirement here, and is what the platform monorepo's own
# api image already does on the same pnpm. If pnpm ever drops it, the
# replacement is to copy `dist` and `drizzle` and resolve the two runtime
# dependencies against the lockfile directly.
#
# No `cp` of the build output afterwards, unlike that image: `files` here names
# dist and drizzle, so `deploy` carries them.
RUN pnpm --filter @aec-craft/platform-id-db build \
 && pnpm --filter @aec-craft/platform-id-db deploy --prod --legacy /out

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /out /app
USER app
ENV NODE_ENV=production
# The generated SQL travels beside the code that applies it, so an image can
# only ever run the migrations its own build was cut from.
CMD ["node", "dist/migrate.cli.js"]
