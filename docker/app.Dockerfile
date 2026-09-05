FROM oven/bun:1.3.10 AS dependencies
WORKDIR /repo/web
COPY web/package.json web/bun.lockb ./
RUN bun install --frozen-lockfile

FROM dependencies AS source
COPY web ./

FROM source AS deployer
CMD ["bunx", "convex", "deploy"]

FROM node:22-slim AS builder
WORKDIR /repo/web
COPY --from=dependencies /repo/web/node_modules ./node_modules
COPY web ./
ARG NEXT_PUBLIC_CONVEX_URL
ARG NEXT_PUBLIC_CONVEX_SITE_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_ASSETS_URL
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT_MODE=standalone \
    NEXT_PUBLIC_CONVEX_URL=${NEXT_PUBLIC_CONVEX_URL} \
    NEXT_PUBLIC_CONVEX_SITE_URL=${NEXT_PUBLIC_CONVEX_SITE_URL} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_ASSETS_URL=${NEXT_PUBLIC_ASSETS_URL}
RUN node node_modules/next/dist/bin/next build

FROM node:22-slim AS runner
WORKDIR /app
ENV HOSTNAME=0.0.0.0 \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
COPY --from=builder /repo/web/public ./public
COPY --from=builder /repo/web/.next/standalone ./
COPY --from=builder /repo/web/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
