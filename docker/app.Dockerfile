FROM oven/bun:1.3.10 AS dependencies
WORKDIR /repo/web
COPY web/package.json web/bun.lockb ./
RUN bun install --frozen-lockfile

FROM dependencies AS source
COPY web ./

FROM source AS deployer
CMD ["bunx", "convex", "deploy"]

FROM source AS builder
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
RUN bun run build

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
