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
EXPOSE 5174
CMD ["pnpm", "exec", "tsx", "watch", "Converter/server/index.ts"]

FROM base AS prod
COPY Converter ./Converter
COPY tsconfig.json ./
ENV NODE_ENV=production
ENV PROJECTS_ROOT=/app/output
ENV TMP_DIR=/app/tmp
EXPOSE 5174
CMD ["pnpm", "exec", "tsx", "Converter/server/index.ts"]
