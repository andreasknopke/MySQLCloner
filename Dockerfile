FROM node:18-alpine AS backend
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server/ ./

FROM node:18 AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Use Debian-based image for proper MySQL client support (caching_sha2_password plugin)
FROM node:18-slim
WORKDIR /app

# Install MySQL client (real MySQL, not MariaDB) for caching_sha2_password support
RUN apt-get update && \
    apt-get install -y --no-install-recommends mysql-client && \
    rm -rf /var/lib/apt/lists/*

# Copy backend
COPY --from=backend /app/server ./server

# Copy built client
COPY --from=client-build /app/client/build ./client/build

# Install production dependencies only
WORKDIR /app/server
RUN npm install --omit=dev

EXPOSE 5000

# Keep as root for file operations - Railway will handle security
CMD ["node", "index.js"]
