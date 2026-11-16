# syntax=docker/dockerfile:1
# Multi-stage frontend image.
#   target `dev`   : Vite dev server with HMR (used by docker-compose)
#   target `prod`  : static build served by nginx (production itself is on Vercel;
#                    this target exists so the build can be smoke-tested in a container)

FROM node:24-slim AS base
# Same pnpm version as package.json "packageManager".
RUN npm install -g pnpm@12.21.0
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------- dev
FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["pnpm", "dev", "--host", "0.0.0.0"]

# ---------------------------------------------------------------- build
FROM deps AS build
COPY . .
RUN pnpm build

# ---------------------------------------------------------------- prod
FROM nginx:alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
# SPA fallback: unknown paths serve index.html so client-side routes work on refresh.
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  location / { try_files $uri /index.html; }\n}\n' \
  > /etc/nginx/conf.d/default.conf
EXPOSE 80
