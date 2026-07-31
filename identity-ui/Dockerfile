# NeoBIM Identity UI — thin renderer for Kratos/Hydra self-service flows.
# Contains no authentication logic; Kratos/Hydra remain the identity engine.
# See docs/10-reference/neobim-plugin-architecture-proposal.md.
#
# Lives at repo root (identity-ui/), not under applications/ — this IS the
# identity platform, not a business application; applications/ is reserved
# for actual consumer apps (mealie, superset, neobim-ui, ...).
#
# `ui/packages/ui` lives outside this repo (a sibling of Ory_IDP) and is only
# needed at build time, to sync its globals.css (see package.json's
# sync:ui-css script and app/globals.css's comment — components are vendored,
# not live-imported, same pattern as applications/neobim/neobim-ui). Supplied as a
# named BuildKit context so the primary build context stays Ory_IDP-only:
#   docker build -f identity-ui/Dockerfile \
#     --build-context uipkg=../ui/packages/ui -t neobim-identity-ui .
FROM node:22-slim AS base
WORKDIR /app

FROM base AS deps
COPY identity-ui/package.json ./identity-ui/package.json
COPY --from=uipkg . /ui/packages/ui
WORKDIR /app/identity-ui
RUN npm install --no-audit --no-fund

FROM base AS build
COPY --from=deps /app /app
COPY --from=deps /ui /ui
COPY identity-ui ./identity-ui
WORKDIR /app/identity-ui
# npm's prebuild hook runs sync:ui-css automatically (see package.json).
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app/identity-ui
COPY --from=build /app/identity-ui/.next/standalone ./
COPY --from=build /app/identity-ui/.next/static ./.next/static
COPY --from=build /app/identity-ui/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
