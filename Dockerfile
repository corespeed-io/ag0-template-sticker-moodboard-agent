# ================================
# Stage 1 — Build frontend
# ================================
FROM node:24-slim AS frontend-build
RUN corepack enable
WORKDIR /app/ui
# Install deps first for better layer caching
COPY ui/package.json ui/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY ui/ ./
RUN pnpm build

# ================================
# Stage 2 — Production runtime
# ================================
FROM denoland/deno:2.6.9
WORKDIR /app
# Cache Deno deps before copying source for better layer caching
COPY deno.json deno.lock ./
RUN deno install
COPY main.ts ./
COPY api/ ./api/
COPY scripts/ ./scripts/
COPY skills/ ./skills/
# Create stickers directory
RUN mkdir -p stickers
# Copy built frontend from stage 1
COPY --from=frontend-build /app/ui/dist ./ui/dist
EXPOSE 8080
CMD ["deno", "run", "--allow-all", "main.ts"]
