FROM node:22-bookworm-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS dev
ENV NODE_ENV=development
ENV PROJECTS_ROOT=/app/output
ENV TMP_DIR=/app/tmp
EXPOSE 4000
CMD ["pnpm", "exec", "tsx", "watch", "Admin/server/index.ts"]

FROM base AS build
COPY Admin ./Admin
COPY Converter ./Converter
COPY tsconfig.json ./
RUN pnpm exec vite build --config Admin/vite.config.ts

FROM node:22-bookworm-slim AS prod
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/Admin ./Admin
COPY --from=build /app/Converter ./Converter
COPY --from=build /app/tsconfig.json ./
ENV NODE_ENV=production
ENV PROJECTS_ROOT=/app/output
ENV TMP_DIR=/app/tmp
EXPOSE 4000
CMD ["pnpm", "exec", "tsx", "Admin/server/index.ts"]
