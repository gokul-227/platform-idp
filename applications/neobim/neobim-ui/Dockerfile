# NeoBIM UI — this platform's Hydra/Kratos identity wired behind the real
# `ui` repo's design system (Ory/ui, a sibling checkout of Ory_IDP — NOT a
# vendored copy) + a layout copied from platform-neobim/apps/auth. No NeoBIM
# auth backend (Better Auth / oauth-provider) is built or run — see
# docs/07-applications/neobim/neobim-ui.md.
#
# `ui/packages/ui` lives outside this repo (a sibling of Ory_IDP), so it's
# supplied as a named BuildKit context, not folded into the primary build
# context (which stays Ory_IDP-only, per this repo's repository-boundary
# rule) — see docker-compose.applications.yml's `additional_contexts`.
#   docker build -f applications/neobim/neobim-ui/Dockerfile \
#     --build-context uipkg=../ui/packages/ui -t neobim-ui .
FROM node:22-slim AS base
WORKDIR /app

FROM base AS deps
COPY applications/neobim/neobim-ui/package.json ./applications/neobim/neobim-ui/package.json
COPY --from=uipkg . /ui/packages/ui
WORKDIR /app/applications/neobim/neobim-ui
RUN npm install --no-audit --no-fund
# ui/packages/ui is a pnpm workspace member, never installed standalone —
# its own globals.css `@import "tailwindcss"` etc. fail to resolve without
# this (confirmed live: see docs/07-applications/neobim/neobim-ui.md).
WORKDIR /ui/packages/ui
RUN npm install --no-audit --no-fund --no-package-lock

FROM base AS build
COPY --from=deps /app /app
# /ui lives outside /app (see the deps stage) — COPY --from=deps /app /app
# doesn't carry it over, so it needs its own line.
COPY --from=deps /ui /ui
COPY applications/neobim/neobim-ui ./applications/neobim/neobim-ui
WORKDIR /app/applications/neobim/neobim-ui
# npm's prebuild hook runs sync:ui-css automatically (see package.json).
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app/applications/neobim/neobim-ui
# next.config.ts's turbopack.root (widened to the repo checkout root so CSS
# resolution can reach the sibling `ui` package — see next.config.ts) makes
# the standalone output tracer mirror the FULL path from that root, adding
# an extra "app/" segment: server.js lands at .../standalone/app/
# applications/neobim/neobim-ui/server.js, not .../standalone/server.js. Confirmed
# live via `docker build --target build` + find. Source paths below account
# for that; WORKDIR here is still just .../neobim-ui, so destinations are
# unprefixed as before.
COPY --from=build /app/applications/neobim/neobim-ui/.next/standalone/app/applications/neobim/neobim-ui ./
COPY --from=build /app/applications/neobim/neobim-ui/.next/static ./.next/static
COPY --from=build /app/applications/neobim/neobim-ui/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
