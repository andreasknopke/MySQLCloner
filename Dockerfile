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

FROM node:18-alpine
WORKDIR /app

# Install mysql-client for mysqldump (before copying files)
RUN apk add --no-cache mysql-client

# Copy backend
COPY --from=backend /app/server ./server

# Copy built client
COPY --from=client-build /app/client/build ./client/build

# Install production dependencies only
WORKDIR /app/server
RUN npm install --omit=dev

EXPOSE 5000

# Use node user for security
USER node

CMD ["node", "index.js"]
