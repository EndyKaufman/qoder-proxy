FROM node:20-slim

ENV PATH="/usr/local/bin:${PATH}"
ENV QODERCLI_BIN="/usr/local/bin/qodercli"

# Install qodercli globally — uses QODER_PERSONAL_ACCESS_TOKEN env var at runtime for auth.
# node:20-slim is Debian-based (glibc) which is required by qodercli's Bun runtime.
# Alpine (musl libc) is incompatible with Bun native binaries.
RUN npm install -g @qoder-ai/qodercli \
  && qodercli --version || true

# Disable qodercli auto-updates so it never tries to download a new version
# on startup inside the container (saves memory, eliminates update-induced delays).
RUN mkdir -p /root/.qoder \
  && echo '{"autoUpdates":false}' > /root/.qoder.json

# Pre-install MCP server packages for faster first request (cached in image layer).
# Also install git for git-summary-mcp.
RUN npm install -g \
  @modelcontextprotocol/server-postgres \
  @modelcontextprotocol/server-redis \
  @pickstar-2002/minio-storage-mcp@latest \
  @daanrongen/nats-mcp \
  @0xshariq/docker-mcp-server \
  git-summary-mcp \
  @playwright/mcp \
  @modelcontextprotocol/server-filesystem \
  @modelcontextprotocol/server-fetch \
  @modelcontextprotocol/server-sqlite \
  && npx playwright install --with-deps chromium || true

# Create directories for project configs and project code mounts
RUN mkdir -p /configs /projects /dashboard-apps /data

WORKDIR /app

# Install ALL deps (including dev) for the build step
COPY package*.json ./
RUN npm ci

# Copy source
COPY src/ ./src/
COPY tsconfig.json tsconfig.build.json nest-cli.json ./

# Build TypeScript
RUN npm run build

# Remove dev deps after build
RUN npm prune --omit=dev

EXPOSE 3000

VOLUME /data

ENV NODE_ENV=production

# Use a Node.js health check — no wget/curl needed, works on any base image
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',_=>process.exit(1))"

CMD ["node", "dist/main.js"]
